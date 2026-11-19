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
import {KEY,CONTROL,empty,fold,select,unselect,valid} from './lib/state.js';

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
 ctx.on('agent/created',({agent})=>inspect(agent));
 ctx.on('agent/disposed',({agent})=>{records.get(agent)?.mask?.();records.delete(agent);});
 ctx.on('session/event',(session,event)=>{
  if(!['tool/result','tool/ptc-dispatch'].includes(event.type)||event.surfaceOp?.op==='replace')return;
  for(const [agent,value] of records)if(agent.session===session){value.dirty=true;inspect(agent);}
 });
 ctx.effect(()=>()=>{disposed=true;for(const value of records.values())value.mask?.();records.clear();});

 ctx.effect(()=>ctx.systemPrompt.section({name:KEY,order:2950,interpolate:false,text:context=>{
  const agent=context.scope;
  if(!agent?.session)return'';
  const catalog=inspect(agent);
  const selected=new Set(state(agent).selected);
  const count=catalog.filter(tool=>tool.mode==='hidden'&&!selected.has(tool.name)).length;
  return count?`${count} additional tools are hidden and available through browse_tools. If the visible tools do not fit the task, search with a short capability description or two to five keywords, then load the exact tool names you need.`:'';
 }}));

 const output={
  schema:{type:'object',additionalProperties:true},
  render:(_args,value)=>[{type:'text',text:JSON.stringify(value.visible)}],
  presentationMeta:(_args,value)=>({toolManager:{owner:KEY,state:value.state}}),
 };
 const publicTool=tool=>({name:tool.name,description:tool.description,owner:tool.owner});
 ctx.effect(()=>ctx.tools.register(defineTool({
  name:'browse_tools',
  description:'Search tools hidden by Tool Manager, load exact tool names into this conversation, or unload tools loaded earlier. For search, describe the capability you need or provide two to five relevant keywords. Search returns matching tool metadata and does not execute a tool.',
  parameters:{
   action:{type:'string',enum:['search','load','unload'],required:true},
   query:{type:'string',description:'A short capability description or two to five relevant keywords. Examples: "edit spreadsheet formulas" or "email calendar scheduling". Used only with action="search".',default:''},
   names:{type:'array',items:{type:'string'},description:'Exact tool names returned by search. Used with load or unload.',default:[]},
   limit:{type:'integer',description:'Maximum search results from 1 to 20.',default:8},
  },
  output,
  execute:async(args,exec)=>{
   if(!exec.agent)throw Error('A live agent is required.');
   const catalog=inspect(exec.agent);
   const current=state(exec.agent);
   if(args.action==='search'){
    const query=String(args.query||'').trim();
    if(!query||query.length>1000)throw Error('Provide a search query up to 1,000 characters.');
    const limit=Math.min(20,Math.max(1,args.limit||8));
    const selected=new Set(current.selected);
    const available=catalog.filter(tool=>tool.mode==='hidden'&&!selected.has(tool.name));
    const matches=search(available,query,limit);
    return{state:current,visible:{matches:matches.map(publicTool),count:matches.length,next:matches.length?'Call browse_tools with action="load" and exact names from these results.':'No hidden tools matched.'}};
   }
   const names=[...new Set(args.names||[])];
   if(!names.length||names.length>20||names.some(name=>typeof name!=='string'||name.length>256))throw Error('Provide 1 to 20 exact tool names.');
   if(args.action==='load'){
    const allowed=new Set(catalog.filter(tool=>tool.mode==='hidden').map(tool=>tool.name));
    const invalid=names.filter(name=>!allowed.has(name));
    if(invalid.length)throw Error(`Not a hidden tool: ${invalid.join(', ')}`);
    const next=select(current,names);
    return{state:next,visible:{loaded:names,next:'The loaded tools are available on the next model step.'}};
   }
   const invalid=names.filter(name=>!current.selected.includes(name));
   if(invalid.length)throw Error(`Not loaded by Tool Manager: ${invalid.join(', ')}`);
   const next=unselect(current,names);
   return{state:next,visible:{unloaded:names}};
  },
 })));

 ctx.effect(()=>ctx.tools.guard(exec=>{
  if(!exec.agent||CONTROL.includes(exec.name))return;
  const tool=inspect(exec.agent).find(row=>row.name===exec.name);
  if(tool?.mode==='hidden'&&!state(exec.agent).selected.includes(exec.name))return 'This tool is hidden. Search and load it through browse_tools first.';
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
