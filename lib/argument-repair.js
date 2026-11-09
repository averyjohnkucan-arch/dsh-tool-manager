// Repair on a private continuation of the exact request, before malformed
// arguments enter the session log or reach the tool executor. Nothing from
// the continuation is appended to the session; only completed arguments emit.
import {BlockAssembler, createMessage, isAgentLoopRequest} from '@deepseek-ai/dsh-llm';

function incomplete(block, tools) {
 if(block.type!=='tool-call'||block.name!=='bash')return;
 const schema=tools?.find(tool=>tool.name===block.name);
 if(!schema)return;
 let args;try{args=JSON.parse(block.arguments);}catch{return;}
 if(!args||typeof args!=='object'||Array.isArray(args))return;
 const missing=['description','command'].filter(key=>schema.parameters?.required?.includes(key)&&!Object.hasOwn(args,key));
 if(missing.length)return {block,args,missing};
}

export async function completeArguments(llm, request, assistant, target, signal=request.signal) {
 signal?.throwIfAborted();
 // Answer every call in the private branch, including parallel calls that
 // remain pending in the real session. These receipts never execute anything.
 const receipts=assistant.content.filter(block=>block.type==='tool-call').map(block=>createMessage({
  role:'tool',source:{kind:'tool',callId:block.id},toolCallId:block.id,
  ...(block.id===target.block.id?{isError:true}:{}),
  content:[{type:'text',text:block.id===target.block.id
   ?`Arguments incomplete: missing required ${target.missing.join(', ')}. Nothing has executed.`
   :'Pending; not executed. Complete the incomplete call before execution.'}],
 }));
 const question=createMessage({role:'user',source:{kind:'user'},content:[{type:'text',text:
  `Complete only the earlier ${target.block.name} call ${target.block.id}. What was ${target.missing.join(' and ')}? `+
  (target.missing.length===1&&target.missing[0]==='description'
   ?'Reply only with the short description text.'
   :'Reply only with a JSON object containing the missing fields and their string values.')+
  ' This completes the pending call; do not execute anything or start another task.'}]});
 const {sessionId,...base}=request;
 // Preserve the actual model route, settings, full history and tool schemas.
 // Omit only session dispatch identity; retain tool history so provider-side
 // in-history tool declarations and the cached prefix remain unchanged.
 const repair={...base,signal,messages:[...request.messages,assistant,...receipts,question]};
 const response=new BlockAssembler();
 for await(const chunk of llm.stream(repair)){
  signal?.throwIfAborted();response.push(chunk);
 }
 signal?.throwIfAborted();
 if(!['stop','tool-calls'].includes(response.finish.kind))throw Error('Argument completion did not finish.');
 const blocks=response.blocks(),calls=blocks.filter(block=>block.type==='tool-call');
 let supplied;
 if(calls.length){
  if(calls.length!==1||calls[0].name!==target.block.name)throw Error('Argument completion must return exactly the original tool.');
  supplied=JSON.parse(calls[0].arguments);
 }else{
  const text=blocks.filter(block=>block.type==='text').map(block=>block.text).join('').trim();
  try{supplied=JSON.parse(text);}catch{
   if(target.missing.length!==1||target.missing[0]!=='description')throw Error('Argument completion must return JSON for a missing command.');
   supplied={description:text};
  }
  if(typeof supplied==='string'&&target.missing.length===1&&target.missing[0]==='description')supplied={description:supplied};
 }
 if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))throw Error('Argument completion must return an object.');
 const patch={};
 for(const key of target.missing){
  if(typeof supplied[key]!=='string'||!supplied[key].trim())throw Error(`Argument completion did not supply ${key}.`);
  patch[key]=supplied[key];
 }
 // Only missing fields can change, even if the model rewrites existing ones.
 return {arguments:JSON.stringify({...target.args,...patch}),usage:response.usage};
}

export function installArgumentRepair(ctx, {isMainRequest=request=>!request.purpose&&(isAgentLoopRequest(request)||!!request.sessionId), timeoutMs=60000}={}) {
 const stats={requests:0,unbrandedRequests:0,attempted:0,repaired:0,failed:0,lastError:null};
 const dispose=ctx.on('llm/stream',async function*(request,next){
  if(!isMainRequest(request)){yield* next();return;}
  stats.requests++;if(!isAgentLoopRequest(request))stats.unbrandedRequests++;
  const assembly=new BlockAssembler(),held=[];
  let holding=false;
  for await(const chunk of next()){
   assembly.push(chunk);
   // Text/reasoning preceding a tool still streams normally. Hold from the
   // first tool block so neither malformed arguments nor repair steps leak.
   if(chunk.type==='tool-call-delta'||chunk.type==='block-start'&&chunk.blockType==='tool-call'||chunk.type==='block-end'&&chunk.block.type==='tool-call')holding=true;
   if(holding)held.push(chunk);else yield chunk;
  }
  if(!holding)return;
  request.signal?.throwIfAborted();
  const replacements=new Map();
  let repairUsage;
  if(['stop','tool-calls'].includes(assembly.finish.kind)){
   const assistant=assembly.message({provider:request.provider,model:request.model,...(assembly.replayState?{replayState:assembly.replayState}:{})});
   for(const block of assistant.content){
    const target=incomplete(block,request.tools);if(!target)continue;
    stats.attempted++;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(new Error('Argument completion timed out.')),timeoutMs);
    const signal=request.signal?AbortSignal.any([request.signal,controller.signal]):controller.signal;
    try{
     const completed=await completeArguments(this,request,assistant,target,signal);
     replacements.set(block.id,completed.arguments);stats.repaired++;stats.lastError=null;
     if(completed.usage){repairUsage??={};for(const [key,value] of Object.entries(completed.usage))if(typeof value==='number')repairUsage[key]=(repairUsage[key]||0)+value;}
    }catch(error){
     request.signal?.throwIfAborted();
     stats.failed++;stats.lastError=error.message;
     // One attempt only. Leave native validation authoritative on failure.
     ctx.logger?.('tool-manager').warn('Could not complete missing Bash arguments: %s',error.message);
    }finally{clearTimeout(timer);}
   }
  }
  const emitted=new Set();
  for(const chunk of held){
   if(chunk.type==='tool-call-delta'&&replacements.has(chunk.id)){
    if(emitted.has(chunk.id))continue;
    emitted.add(chunk.id);yield {...chunk,name:'bash',argumentsDelta:replacements.get(chunk.id)};
   }else if(chunk.type==='block-end'&&chunk.block.type==='tool-call'&&replacements.has(chunk.block.id)){
    yield {...chunk,block:{...chunk.block,arguments:replacements.get(chunk.block.id)}};
   }else if(chunk.type==='finish'&&replacements.size){
    // Adapter-private replay may encode the original invalid arguments.
    const {replayState,...finish}=chunk;yield finish;
   }else if(chunk.type==='usage'&&repairUsage){
    const usage={...chunk.usage};for(const [key,value] of Object.entries(repairUsage))usage[key]=(usage[key]||0)+value;
    yield {...chunk,usage};repairUsage=undefined;
   }else yield chunk;
  }
 },{global:true});
 dispose.stats=stats;return dispose;
}
