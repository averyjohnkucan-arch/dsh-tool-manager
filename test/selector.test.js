import test from 'node:test';import assert from 'node:assert/strict';
import {chooseTools} from '../lib/selector.js';
const candidates=[{kind:'tool',name:'browser_click',summary:'Click a page button'},{kind:'skill',name:'browser-guide',summary:'Browser guidance'}];
const route={provider:'fixture',model:'model'};
function runtime({choice={names:['browser_click'],skills:[]},efforts=[{id:'off'}],chunks}={}){const requests=[];return{requests,async prepareCall(config,signal,configure){const controls=configure({}, {reasoning:{efforts}});return{config:{...config,...controls},async *stream(request){requests.push(request);yield*(chunks||[{type:'block-end',index:0,block:{type:'tool-call',name:'select_tools',arguments:JSON.stringify(choice)}},{type:'finish',reason:{kind:'tool-calls'}}]);}};}};}
test('selector sees only bounded catalog metadata, uses advertised off, and returns a validated choice',async()=>{
 const llm=runtime();const selected=await chooseTools(llm,route,{task:'click the page',keywords:['browser'],candidates});assert.deepEqual(selected.names,['browser_click']);const req=llm.requests[0];assert.equal(req.reasoningEffort,'off');assert.equal(req.model,'model');assert.equal(req.maxTokens,512);assert.equal(req.sessionId,undefined);assert.equal(req.messages.length,1);assert.deepEqual(req.tools.map(t=>t.name),['select_tools']);assert.equal(selected.trace.stages.length,2);
});
test('no matches require no model request; unsupported off does not silently think',async()=>{
 const r=await chooseTools(null,null,{task:'unmatched',candidates:[]});assert.deepEqual(r.names,[]);
 const llm=runtime({efforts:[{id:'low'}]});await assert.rejects(chooseTools(llm,route,{task:'click',candidates}),/does not advertise reasoning off/);assert.equal(llm.requests.length,0);
});
test('malformed, invented, duplicate or excessive selections never activate tools',async()=>{
 for(const choice of [{names:['invented'],skills:[]},{names:['browser_click','browser_click'],skills:[]},{names:[],skills:['hidden']},{names:['browser_click'],skills:[],execute:'bash'}])await assert.rejects(chooseTools(runtime({choice}),route,{task:'click',candidates}),/unavailable names/);
 await assert.rejects(chooseTools(runtime({chunks:[{type:'block-end',index:0,block:{type:'tool-call',name:'select_tools',arguments:'{' }},{type:'finish',reason:{kind:'tool-calls'}}]}),route,{task:'click',candidates}),/Malformed/);
});
test('provider reasoning, failed/truncated streams and cancellation never select tools',async()=>{
 await assert.rejects(chooseTools(runtime({chunks:[{type:'reasoning-delta',text:'thinking'}]}),route,{task:'click',candidates}),/emitted reasoning/);
 for(const kind of ['error','max-tokens','aborted'])await assert.rejects(chooseTools(runtime({chunks:[{type:'finish',reason:{kind}}]}),route,{task:'click',candidates}),/did not finish/);
 const controller=new AbortController();controller.abort();await assert.rejects(chooseTools(runtime(),route,{task:'click',candidates,signal:controller.signal}),/abort/i);
});
test('delta assembly and empty selection work without any executable task tools in the request',async()=>{
 const chunks=[{type:'tool-call-delta',index:0,name:'select_tools',argumentsDelta:'{"names":[],'},{type:'tool-call-delta',index:0,argumentsDelta:'"skills":[]}'},{type:'finish',reason:{kind:'tool-calls'}}];const r=await chooseTools(runtime({chunks}),route,{task:'talk',candidates});assert.deepEqual(r.names,[]);
});
test('public DSH LlmRuntime prepares an off request while the conversation reasoning config remains high',async t=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);const agentRequire=createRequire(require.resolve('@deepseek-ai/dsh-agent'));
 const {default:LlmRuntime,LlmAdapter}=await import(agentRequire.resolve('@deepseek-ai/dsh-llm'));const {Context}=await import('@deepseek-ai/cordis');const ctx=new Context(),llm=new LlmRuntime(ctx);t.after(()=>ctx.fiber.dispose());let observed;
 llm.registerAdapter(['fixture'],new(class extends LlmAdapter{
  providerInfo(provider){return{id:provider,name:'Fixture'};}
  async resolveModel(provider,id){return{provider,id,name:'Fixture model',reasoning:{efforts:[{id:'off',name:'Off'},{id:'high',name:'High'}]}};}
  async *stream(request){observed=request;yield{type:'block-end',index:0,block:{type:'tool-call',id:'selector-fixture',name:'select_tools',arguments:'{"names":["browser_click"],"skills":[]}'}};yield{type:'finish',reason:{kind:'tool-calls'}};}
 })());
 const main=Object.freeze({...route,reasoningEffort:'high'});const result=await chooseTools(llm,main,{task:'click',candidates});assert.deepEqual(result.names,['browser_click']);assert.equal(observed.reasoningEffort,'off');assert.equal(main.reasoningEffort,'high');
});
