import Schema from '@deepseek-ai/schemastery';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {z} from 'zod';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {homedir} from 'node:os';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Settings} from './lib/settings.js';
import {provenance,rows} from './lib/catalog.js';
import {search} from './lib/search.js';
import {chooseTools} from './lib/selector.js';
import {KEY,CONTROL,empty,fold,select,valid} from './lib/state.js';

export const inject=['tools','systemPrompt','sessionProjections','agents','webServer'];
export const Config=Schema.object({dataDir:Schema.string().default('')});

export async function apply(ctx,config){
 const settings=new Settings(config.dataDir);
 await settings.init();

 const require=createRequire(import.meta.url);
 let dshRoot;
 try{dshRoot=require.resolve('@deepseek-ai/dsh-tools');}catch{}
 const home=process.env.DSH_HOME||join(homedir(),'.dsh');
 const roots=[join(home,'profiles',process.env.DSH_PROFILE||'web','node_modules'),fileURLToPath(import.meta.url),...(process.argv[1]?[process.argv[1]]:[])];
 if(dshRoot)roots.push(dirname(dirname(dirname(dirname(dshRoot)))));
 let owners=await provenance(roots);

 const records=new Map();
 let changing=false;
 let disposed=false;
 let revision=0;
 const state=agent=>ctx.sessionProjections.stateOf(agent.session,KEY)||empty();
 ctx.effect(()=>ctx.sessionProjections.register({key:KEY,stateVersion:1,stateSchema:z.custom(valid),init:empty,apply:fold}));

 function record(agent){
  let value=records.get(agent);
  if(!value){value={catalog:[],filterable:new Set(),mask:null,dirty:true,selectionKey:'',revision:-1};records.set(agent,value);}
  return value;
 }
 function probe(agent,names,result){
  if(!names.length)return;
  try{const release=agent.ctx.tools.restrict({deny:names});release();for(const name of names)result.add(name);}
  catch{if(names.length>1){const middle=Math.floor(names.length/2);probe(agent,names.slice(0,middle),result);probe(agent,names.slice(middle),result);}}
 }
 function inspect(agent){
  const current=record(agent);
  const selected=state(agent).selected;
  const selectionKey=JSON.stringify(selected);
  if(changing||(!current.dirty&&current.selectionKey===selectionKey&&current.revision===revision))return current.catalog;
  changing=true;
  try{
   current.mask?.();
   current.mask=null;
   if(current.dirty){
    current.filterable.clear();
    const names=ctx.tools.schemas(agent).map(tool=>tool.name).filter(name=>name!=='run_code'&&!CONTROL.includes(name));
    probe(agent,names,current.filterable);
   }
   current.catalog=rows(ctx.tools.schemas(agent),settings.value,owners,current.filterable);
   const denied=current.catalog.filter(tool=>tool.mode==='hidden'&&tool.filterable&&!selected.includes(tool.name)).map(tool=>tool.name);
   if(denied.length)current.mask=agent.ctx.tools.restrict({deny:denied});
   current.dirty=false;
   current.selectionKey=selectionKey;
   current.revision=revision;
   return current.catalog;
  }finally{changing=false;}
 }
 function refreshAll(){for(const agent of ctx.agents.list())inspect(agent);}

 ctx.on('tools/change',()=>{if(changing||disposed)return;for(const value of records.values())value.dirty=true;});
 ctx.on('agent/request',async({agent},next)=>{const request=await next();record(agent).route={provider:request.provider,model:request.model};return request;});
 ctx.on('agent/created',({agent})=>inspect(agent));
 ctx.on('agent/disposed',({agent})=>{records.get(agent)?.mask?.();records.delete(agent);});
 ctx.on('session/event',(session,event)=>{
  if(!['tool/result','tool/ptc-dispatch','compaction/end'].includes(event.type)||event.surfaceOp?.op==='replace')return;
  for(const [agent,value] of records)if(agent.session===session){value.dirty=true;inspect(agent);}
 });
 ctx.effect(()=>()=>{disposed=true;for(const value of records.values())value.mask?.();records.clear();});

 ctx.effect(()=>ctx.systemPrompt.section({name:KEY,order:2950,interpolate:false,text:context=>{
  const agent=context.scope;
  if(!agent?.session)return'';
  const catalog=inspect(agent);
  const selected=new Set(state(agent).selected);
  const count=catalog.filter(tool=>tool.mode==='hidden'&&!selected.has(tool.name)).length;
  return count?`${count} additional tools are available through tool_selection. If the visible tools do not fit the task, call tool_selection with a short task description and two to five relevant keywords. That one call searches, selects up to eight tools with reasoning off when supported, and loads their schemas for the next step.`:'';
 }}));

 const output={
  schema:{type:'object',additionalProperties:true},
  render:(_args,value)=>[{type:'text',text:value.receipt}],
  presentationMeta:(_args,value)=>({toolManager:{owner:KEY,state:value.state,audit:value.audit}}),
 };
 const publicTool=tool=>({name:tool.name,description:tool.description,owner:tool.owner});
 ctx.effect(()=>ctx.tools.register(defineTool({
  name:'tool_selection',
  description:'Find and load additional tools in one call. Describe the capability you need and optionally provide two to five relevant keywords. Tool Selection locally searches hidden tools, shortlists up to eight matches, asks a constrained auxiliary selector to choose the smallest sufficient set with reasoning Off/None when the model supports it, and loads the selected schemas for the next model step. When Off/None is unavailable it uses the model-default fallback behavior. The result is only a compact receipt naming the selected tools; shortlist metadata and selection details stay out of conversational context.',
  parameters:{
   task:{type:'string',description:'Short description of the capability needed. Example: "edit formulas in a spreadsheet".',required:true},
   keywords:{type:'array',items:{type:'string'},description:'Two to five focused search terms. Example: ["spreadsheet", "formulas", "cells"].',default:[]},
  },
  output,
  execute:async(args,exec)=>{
   if(!exec.agent)throw Error('A live agent is required.');
   const catalog=inspect(exec.agent);
   const current=state(exec.agent);
   const task=String(args.task||'').trim(),keywords=args.keywords||[];
   if(!task||task.length>1000||!Array.isArray(keywords)||keywords.length>5||keywords.some(keyword=>typeof keyword!=='string'||!keyword.trim()||keyword.length>80))throw Error('Provide a short task and at most five focused keywords.');
   const query=[task,...keywords].join(' ');
   const selected=new Set(current.selected);
   const available=catalog.filter(tool=>tool.mode==='hidden'&&!selected.has(tool.name));
   const matches=search(available,query,8);
   const route=exec.agent.session.requestHeader()?.config||record(exec.agent).route;
   const choice=await chooseTools(exec.agent.ctx.get('llm'),route,{query,candidates:matches.map(publicTool),maxSelect:8,signal:exec.signal});
   const next=choice.names.length?select(current,choice.names):current;
   const receipt=choice.names.length?`Model selected ${choice.names.join(', ')}.`:'Model selected no additional tools.';
   return{state:next,receipt,audit:{query,shortlist:matches.map(publicTool),selector:{mode:choice.mode,...(choice.reasoningEffort?{reasoningEffort:choice.reasoningEffort}:{}),...(choice.usage?{usage:choice.usage}:{})},selected:choice.names}};
  },
 })));

 ctx.effect(()=>ctx.tools.guard(exec=>{
  if(!exec.agent||CONTROL.includes(exec.name))return;
  const tool=inspect(exec.agent).find(row=>row.name===exec.name);
  if(tool?.mode==='hidden'&&!state(exec.agent).selected.includes(exec.name))return 'This tool is hidden. Load it through tool_selection first.';
 }));

 const token=randomBytes(32).toString('base64url');
 const connection={path:'/plugins/dsh-tool-manager/action',token};
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/plugins/dsh-tool-manager/connection',handler:async(req,res)=>{
  if(req.method!=='GET'||(req.headers.origin&&req.headers.origin!==ctx.webServer.getOrigin())){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(connection));
 }}));
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:connection.path,handler:async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const supplied=Buffer.from(String(req.headers.authorization||'').replace(/^Bearer /,''));
  const expected=Buffer.from(token);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(401);res.end(JSON.stringify({error:'Owner capability required.'}));return;}
  if(req.method!=='POST'||!String(req.headers['content-type']).startsWith('application/json')||(req.headers.origin&&req.headers.origin!==ctx.webServer.getOrigin())){res.writeHead(403);res.end('{}');return;}
  try{
   let body='';
   for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1048576)throw Error('Request too large.');}
   const request=JSON.parse(body);
   if(request.action==='save'){
    await settings.save(request.settings);
    revision++;
    for(const value of records.values())value.dirty=true;
    refreshAll();
   }else if(request.action==='refresh'){
    owners=await provenance(roots);
    revision++;
    for(const value of records.values())value.dirty=true;
    refreshAll();
   }else if(request.action!=='list')throw Error('Unknown action.');
   const tools=new Map();
   for(const agent of ctx.agents.list())for(const tool of inspect(agent))tools.set(tool.name,tool);
   const globalSchemas=ctx.tools.schemas();
   for(const tool of rows(globalSchemas,settings.value,owners,new Set(globalSchemas.map(schema=>schema.name))))if(!tools.has(tool.name))tools.set(tool.name,tool);
   res.end(JSON.stringify({settings:settings.value,tools:[...tools.values()].sort((a,b)=>a.owner.localeCompare(b.owner)||a.name.localeCompare(b.name))}));
  }catch(error){res.writeHead(400);res.end(JSON.stringify({error:error.message}));}
 }}));
 refreshAll();
}
