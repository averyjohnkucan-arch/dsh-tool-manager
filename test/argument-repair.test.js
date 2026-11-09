import test from 'node:test';
import assert from 'node:assert/strict';
import {Context} from '@deepseek-ai/cordis';
import LlmRuntime,{LlmAdapter,BlockAssembler,markAgentLoopRequest,isAgentLoopRequest,createMessage} from '@deepseek-ai/dsh-llm';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools';
import {installArgumentRepair} from '../lib/argument-repair.js';

const schema={name:'bash',description:'Execute a shell script. Include description and command.',parameters:{type:'object',properties:{description:{type:'string'},command:{type:'string'}},required:['description','command']}};
const block=(args,id='original')=>({type:'tool-call',id,name:'bash',arguments:JSON.stringify(args)});
async function* chunks(blocks,{delta=false,kind='tool-calls',replay=false}={}){
 yield {type:'text-delta',index:0,text:'Checking now.'};
 for(const [offset,value] of blocks.entries()){
  const index=offset+1;
  if(delta){
   yield {type:'block-start',index,blockType:'tool-call'};
   yield {type:'tool-call-delta',index,id:value.id,name:value.name,argumentsDelta:value.arguments.slice(0,5)};
   yield {type:'tool-call-delta',index,id:value.id,argumentsDelta:value.arguments.slice(5)};
  }else yield {type:'block-end',index,block:value};
 }
 yield {type:'usage',usage:{inputTokens:10,outputTokens:5,totalTokens:105,cacheReadTokens:90}};
 yield {type:'finish',reason:{kind},...(replay?{replayState:{response:{original:true}}}:{})};
}
async function fixture(t,original,response,options={}){
 const ctx=new Context(),llm=new LlmRuntime(options.isolated?ctx.isolate('llm'):ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);
 t.after(()=>ctx.fiber.dispose());
 const seen=[];let executions=0;
 ctx.tools.register(defineTool({name:'bash',description:schema.description,parameters:{description:{type:'string',required:true},command:{type:'string',required:true}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>{executions++;return 'done';}}));
 llm.registerAdapter(['fixture'],new(class extends LlmAdapter{
  providerInfo(provider){return {id:provider,name:'Fixture'};}
  async resolveModel(provider,id){return {provider,id,name:'Fixture',reasoning:{efforts:[{id:'high',name:'High'}]}};}
  async* stream(request){
   seen.push(request);
   if(seen.length===1){yield* chunks(original,options);return;}
   if(options.repairError)throw Error('Provider unavailable');
   if(options.beforeRepair)options.beforeRepair(request);
   if(options.stallAfterOutput){yield{type:'text-delta',index:0,text:'First token'};options.stallAfterOutput(request);request.signal?.throwIfAborted();}
   if(options.repairText!==undefined){yield{type:'text-delta',index:0,text:options.repairText};yield{type:'finish',reason:{kind:'stop'}};return;}
   if(options.abort){options.abort.abort();request.signal?.throwIfAborted();}
   yield* chunks(response,{kind:options.repairKind||'tool-calls'});
  }
 })());
 const repair=installArgumentRepair(options.isolated?ctx.isolate('llm'):ctx);
 const messages=[createMessage({role:'system',source:{kind:'system-prompt'},content:[{type:'text',text:'Complete original system prompt.'}]}),createMessage({role:'user',source:{kind:'user'},content:[{type:'text',text:'Original user request.'}]})];
 const request=(options.unbranded?value=>value:markAgentLoopRequest)({provider:'fixture',model:'same-model',reasoningEffort:'high',temperature:0.4,maxTokens:4096,messages,tools:[schema],sessionId:'real-session',signal:options.abort?.signal||new AbortController().signal});
 const output=[],assembled=new BlockAssembler();
 const run=async()=>{for await(const chunk of llm.stream(request)){output.push(chunk);assembled.push(chunk);}return assembled.blocks();};
 return {ctx,llm,seen,messages,request,output,assembled,repair,run,get executions(){return executions;}};
}

for(const missing of ['description','command'])test(`privately fills missing ${missing} with full context and executes once`,async t=>{
 const full={description:'Show current directory',command:'pwd'},partial={...full};delete partial[missing];
 const f=await fixture(t,[block(partial)],[block(full,'repair')]);
 const blocks=await f.run(),call=blocks.find(b=>b.type==='tool-call');
 assert.equal(f.seen.length,2);assert.equal(call.id,'original');assert.deepEqual(JSON.parse(call.arguments),full);
 const repair=f.seen[1];assert.equal(repair.provider,f.request.provider);assert.equal(repair.model,f.request.model);assert.equal(repair.reasoningEffort,'high');assert.equal(repair.temperature,0.4);assert.deepEqual(repair.tools,f.request.tools);
 assert.deepEqual(repair.messages.slice(0,2),f.messages);assert.equal(repair.messages[2].role,'assistant');assert.equal(repair.messages[3].toolCallId,'original');assert.match(repair.messages.at(-1).content[0].text,new RegExp(`What was ${missing}`));
 assert.equal(isAgentLoopRequest(repair),false);assert.equal(repair.sessionId,undefined);
 assert.equal(JSON.stringify(blocks).includes('What was'),false);assert.equal(blocks.filter(b=>b.type==='tool-call').length,1);
 const result=await f.ctx.tools.execute({name:call.name,callId:call.id,arguments:JSON.parse(call.arguments),signal:f.request.signal});
 assert.equal(result.isError,false);assert.equal(f.executions,1);
});
test('complete calls stream unchanged without a second request',async t=>{
 const f=await fixture(t,[block({description:'List files',command:'ls'})],[]);await f.run();assert.equal(f.seen.length,1);
});
test('delta-only responses consolidate; existing command and id cannot change; stale replay removed',async t=>{
 const f=await fixture(t,[block({command:'pwd'})],[block({command:'rm something',description:'Show current directory'},'new-id')],{delta:true,replay:true});
 const blocks=await f.run();assert.deepEqual(JSON.parse(blocks.find(b=>b.type==='tool-call').arguments),{command:'pwd',description:'Show current directory'});
 assert.equal(f.output.at(-1).replayState,undefined);assert.equal(f.assembled.usage.inputTokens,10);
});
test('both missing fields are completed together',async t=>{
 const f=await fixture(t,[block({})],[block({command:'pwd',description:'Show directory'})]);const blocks=await f.run();assert.equal(f.seen.length,2);assert.equal(JSON.parse(blocks[1].arguments).command,'pwd');
});
test('parallel calls are paired in the private branch and retained individually',async t=>{
 const f=await fixture(t,[block({command:'pwd'}),block({command:'ls',description:'List files'},'parallel')],[block({description:'Show directory'})]);
 const blocks=await f.run(),repair=f.seen[1];assert.deepEqual(repair.messages.filter(m=>m.role==='tool').map(m=>m.toolCallId),['original','parallel']);assert.equal(blocks.filter(b=>b.type==='tool-call').length,2);
});
for(const options of [{repairError:true},{repairKind:'max-tokens'}])test(`failed repair is bounded and native validation still rejects: ${JSON.stringify(options)}`,async t=>{
 const f=await fixture(t,[block({description:'Show directory'})],[block({command:'pwd'})],options);const blocks=await f.run(),call=blocks[1];
 assert.equal(f.seen.length,2);assert.deepEqual(JSON.parse(call.arguments),{description:'Show directory'});
 const result=await f.ctx.tools.execute({name:'bash',callId:call.id,arguments:JSON.parse(call.arguments),signal:f.request.signal});assert.equal(result.isError,true);assert.equal(f.executions,0);
});
test('cancellation during repair never emits a callable tool',async t=>{
 const abort=new AbortController(),f=await fixture(t,[block({command:'pwd'})],[block({description:'Show directory'})],{abort});
 await assert.rejects(f.run(),/abort/i);assert.equal(f.output.some(c=>c.type==='tool-call-delta'||c.block?.type==='tool-call'),false);assert.equal(f.executions,0);
});
test('truncated original output is never repaired',async t=>{
 const f=await fixture(t,[block({command:'pwd'})],[],{kind:'max-tokens'});const blocks=await f.run();assert.equal(f.seen.length,1);assert.equal(blocks.some(b=>b.type==='tool-call'),false);
});

test('session requests survive a lost process-local brand and private repair preserves tool history',async t=>{
 const f=await fixture(t,[block({command:'pwd'})],[block({description:'Show directory'})],{unbranded:true});
 const history={fixture:'original tool declaration history'};f.request.toolHistory=history;
 const blocks=await f.run();assert.equal(f.seen.length,2);assert.equal(JSON.parse(blocks[1].arguments).description,'Show directory');
 assert.deepEqual(f.seen[1].toolHistory,history);assert.equal(f.seen[1].sessionId,undefined);
});

test('repair observes an isolated LLM service and continues through that exact service',async t=>{
 const f=await fixture(t,[block({description:'Show directory'})],[block({command:'pwd'})],{isolated:true});
 const blocks=await f.run();assert.equal(f.seen.length,2);assert.equal(JSON.parse(blocks[1].arguments).command,'pwd');
});

for(const [missing,reply] of [['description','Show current directory'],['description','{"description":"Show current directory"}'],['command','{"command":"pwd"}']])test(`private completion accepts just the missing value: ${missing} / ${reply}`,async t=>{
 const original=missing==='description'?{command:'pwd'}:{description:'Show current directory'};
 const f=await fixture(t,[block(original)],[],{repairText:reply});const blocks=await f.run();
 assert.deepEqual(JSON.parse(blocks[1].arguments),{command:'pwd',description:'Show current directory'});assert.equal(f.seen.length,2);
 assert.equal(JSON.stringify(blocks).includes('What was'),false);
});
test('a prose answer cannot become an executable command',async t=>{
 const f=await fixture(t,[block({description:'Show directory'})],[],{repairText:'I would run pwd here.'});
 const blocks=await f.run();assert.deepEqual(JSON.parse(blocks[1].arguments),{description:'Show directory'});assert.equal(f.executions,0);
});

test('hidden request costs never inflate the main context occupancy sample',async t=>{
 const f=await fixture(t,[block({command:'pwd'})],[block({description:'Show directory'})]);await f.run();
 assert.deepEqual(f.assembled.usage,{inputTokens:10,outputTokens:5,totalTokens:105,cacheReadTokens:90});
 assert.deepEqual(f.repair.stats.repairUsage,{inputTokens:10,outputTokens:5,totalTokens:105,cacheReadTokens:90});
 assert.equal(f.repair.stats.repaired,1);
});

test('queue and full-context prefill can exceed 60 seconds without spending the repair output deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=await fixture(t,[block({command:'pwd'})],[block({description:'Show directory'})],{beforeRepair(request){t.mock.timers.tick(180000);assert.equal(request.signal.aborted,false);}});
 const blocks=await f.run();assert.equal(f.repair.stats.repaired,1);assert.equal(JSON.parse(blocks[1].arguments).description,'Show directory');
});
test('a stalled output still times out once generation begins',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=await fixture(t,[block({command:'pwd'})],[],{stallAfterOutput(request){t.mock.timers.tick(60001);assert.equal(request.signal.aborted,true);}});
 const blocks=await f.run();assert.equal(f.repair.stats.failed,1);assert.match(f.repair.stats.lastError,/after output began/);assert.deepEqual(JSON.parse(blocks[1].arguments),{command:'pwd'});
});
