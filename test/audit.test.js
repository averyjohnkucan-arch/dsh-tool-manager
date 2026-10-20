import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Context,Service} from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools';
import SessionStore from '@deepseek-ai/dsh-session';
import Projection from '@deepseek-ai/dsh-session-projection';
import Skills from '@deepseek-ai/dsh-skill';
import {createScope} from '@deepseek-ai/dsh-scope';
import * as plugin from '../index.js';import {defaults} from '../lib/settings.js';import {CONTROL} from '../lib/state.js';
const def=name=>defineTool({name,description:`Fixture ${name}: browse a page or execute the original behavior`,parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>name});
const override=mode=>({mode,owner:'',summary:'',group:'',skills:[]});
async function fixture(t,tools={},names=['read','ask_user_question','browser_click'],defaultMode='inherit'){
 const dir=await mkdtemp(join(tmpdir(),'tool-manager-audit-'));t.after(()=>rm(dir,{recursive:true,force:true}));await writeFile(join(dir,'settings.json'),JSON.stringify({...defaults(),tools,defaultMode}));
 const ctx=new Context();new SystemPrompt(ctx,{});new ToolRuntime(ctx);new SessionStore(ctx);new Projection(ctx);new Skills(ctx);const agents=[];const defs=new Map(),routes=new Map();let route;
 new(class extends Service{constructor(){super(ctx,'agents');}list(){return agents;}})();new(class extends Service{constructor(){super(ctx,'webServer');}register(r){route=r;routes.set(r.path,r);return()=>routes.delete(r.path);}getOrigin(){return 'http://127.0.0.1:3099';}})();
 for(const name of names){const d=def(name);defs.set(name,d);ctx.tools.register(d);}
 const addAgent=id=>{const agent={session:ctx.sessions.create(id,{meta:{cwd:dir}})};const scope=createScope(ctx,agent);agent.ctx=scope.ctx;agents.push(agent);return {agent,scope};};
 const {agent,scope}=addAgent('one');const original=ctx.tools.schemas(agent);
 let fiber;const install=async()=>fiber=await ctx.plugin(plugin,{dataDir:dir});
 const step=async(a=agent)=>ctx.waterfall('agent/pre-step',{agent:a},()=>Promise.resolve({messages:[],kind:'continue',preserved:'fixture'}));
 const call=async(name,args={},a=agent)=>ctx.tools.execute({callId:'fixture-'+Math.random(),name,arguments:args,agent:a,signal:new AbortController().signal});
 t.after(async()=>{await fiber?.dispose();for(const a of agents)await a.ctx.fiber.dispose();await ctx.fiber.dispose();});
 return {ctx,agent,scope,defs,addAgent,install,step,call,original,route:()=>route,routeFor:path=>routes.get(path),dispose:()=>fiber.dispose()};
}
test('default policy preserves all existing tools and original schemas; generic names do not collide',async t=>{
 const f=await fixture(t,{},['read','ask_user_question','browser_click','tool_search','tool_select','tool_close']);await f.install();
 for(const original of f.original)assert.deepEqual(f.ctx.tools.schemas(f.agent).find(s=>s.name===original.name),original);
 assert.deepEqual((await f.call('tool_search')).value,'tool_search');for(const name of CONTROL)assert.ok(f.ctx.tools.get(name,f.agent));
 const result=await f.step();assert.equal(result.preserved,'fixture');
 const search=await f.call('tool_manager_search',{task:'browser page'});assert.ok(search.value.tools.some(x=>x.name==='browser_click'&&x.mode==='inherit'));
});
test('future global and agent-local tools retain provider behavior by default',async t=>{
 const f=await fixture(t);await f.install();f.ctx.tools.register(def('future_global'));f.agent.ctx.tools.register(def('future_agent_local'));await f.step();
 assert.ok(f.ctx.tools.get('future_global',f.agent));assert.ok(f.ctx.tools.get('future_agent_local',f.agent));
 const r=await f.call('tool_manager_search',{});assert.ok(r.value.tools.some(t=>t.name==='future_global'&&t.mode==='inherit'));assert.ok(r.value.tools.some(t=>t.name==='future_agent_local'&&!t.filterable));
});
test('explicit discovery reacts to late registration, unload, reload, and scope relocation',async t=>{
 const f=await fixture(t,{late_tool:override('discover')});await f.install();const tool=def('late_tool');let remove=f.ctx.tools.register(tool);await f.step();assert.equal(f.ctx.tools.get('late_tool',f.agent),undefined);
 remove();await f.step();assert.equal(f.ctx.tools.get('late_tool',f.agent),undefined);
 remove=f.ctx.tools.register(tool);await f.step();assert.equal(f.ctx.tools.get('late_tool',f.agent),undefined);
 remove();f.agent.ctx.tools.register(tool);await f.step();assert.ok(f.ctx.tools.get('late_tool',f.agent),'same definition moved into exempt own layer must not crash or retain a stale mask');
 const r=await f.call('tool_manager_search',{task:'late tool'});assert.equal(r.value.tools.find(t=>t.name==='late_tool').filterable,false);
});
test('provider restrictions stay authoritative and scope catalogs do not leak hidden tools',async t=>{
 const f=await fixture(t,{browser_click:override('basic')});const upstream=f.agent.ctx.tools.restrict({deny:['browser_click']});await f.install();assert.equal(f.ctx.tools.get('browser_click',f.agent),undefined);
 const r=await f.call('tool_manager_search',{task:'browser click'});assert.ok(!r.value.tools.some(t=>t.name==='browser_click'));
 const other=f.addAgent('other');await f.step(other.agent);assert.ok(f.ctx.tools.get('browser_click',other.agent));upstream();await f.step();assert.ok(f.ctx.tools.get('browser_click',f.agent));
});
test('explicit disabled policy denies exempt agent-local tools; unloading manager restores provider surface',async t=>{
 const f=await fixture(t,{browser_click:override('discover'),local_tool:override('disabled')});f.agent.ctx.tools.register(def('local_tool'));await f.install();assert.equal(f.ctx.tools.get('browser_click',f.agent),undefined);
 const denied=await f.call('local_tool');assert.equal(denied.isError,true);await f.dispose();assert.ok(f.ctx.tools.get('browser_click',f.agent));const allowed=await f.call('local_tool');assert.equal(allowed.isError,false);for(const name of CONTROL)assert.equal(f.ctx.tools.get(name,f.agent),undefined);
});
test('standalone skills are searchable without selecting or activating any tool',async t=>{
 const f=await fixture(t);f.ctx.skills.register({name:'bash-workflow',description:'Use Bash pipelines and shell quoting safely',content:'Fixture Bash guidance.',source:'runtime'});f.ctx.skills.register({name:'private-skill',description:'Bash secret fixture',content:'Not model invocable',source:'runtime',invocation:{modelInvocable:false,userInvocable:true}});await f.install();
 const r=await f.call('tool_manager_search',{task:'Bash pipelines'});assert.equal(r.isError,false);assert.ok(r.value.skills.some(s=>s.name==='bash-workflow'));assert.ok(!r.value.skills.some(s=>s.name==='private-skill'));
 assert.equal(f.ctx.tools.get('browser_click',f.agent).name,'browser_click');const bad=await f.call('tool_manager_select',{names:['read'],skills:['private-skill']});assert.equal(bad.isError,true);
});
test('catalog reads are mutation-free and unchanged agent steps do not rebuild tool restrictions',async t=>{
 const names=Array.from({length:200},(_,i)=>'fixture_'+i);
 const f=await fixture(t,{fixture_0:override('discover')},names);await f.install();
 for(let i=0;i<25;i++)f.addAgent('idle-'+i);
 const injection=[];f.ctx.emit('webserver/index-inject',injection);const capability=injection.find(x=>x.name==='__DSH_TOOL_MANAGER__').value;
 let changes=0;f.ctx.on('tools/change',()=>{changes++;});
 const start=performance.now();
 for(let i=0;i<10;i++){
  const body=JSON.stringify({action:'list'});const req={headers:{authorization:'Bearer '+capability.token,'content-type':'application/json'},method:'POST',async *[Symbol.asyncIterator](){yield body;}};
  let text,status=200;const res={setHeader(){},writeHead(n){status=n;},end(s){text=s;}};
  await f.route().handler(req,res);assert.equal(status,200);const data=JSON.parse(text);assert.ok(data.tools.some(x=>x.name==='fixture_199'));assert.equal(data.agents.length,26);
 }
 const elapsed=performance.now()-start;
 assert.equal(changes,0,'opening the settings catalog must not create/dispose restrictions in any agent');
 await f.step();await f.step();assert.equal(changes,0,'unchanged steps must reuse the existing scoped mask');
 assert.equal(f.ctx.tools.get('fixture_0',f.agent),undefined,'cached policy must still hide discovery tools');
 t.diagnostic(`10 catalog reads, 200 tools and 26 agents: ${elapsed.toFixed(1)} ms, zero registry mutations`);
});
test('capability renewal requires the existing DSH browser authentication and rejects cross-origin requests',async t=>{
 const f=await fixture(t);await f.install();let authenticated=false,checks=0;
 new(class extends Service{constructor(){super(f.ctx,'connection');}authorizeIndex(_req,res){checks++;if(authenticated)return true;res.writeHead(401);res.end('Unauthorized');return false;}})();
 const route=f.routeFor('/plugins/dsh-tool-manager/connection');assert.ok(route);
 async function request(method='GET',origin){let status=200,body='';await route.handler({method,headers:origin?{origin}:{}},{setHeader(){},writeHead(n){status=n;},end(s){body=s||'';}});return{status,body};}
 assert.equal((await request()).status,401);assert.equal(checks,1);
 authenticated=true;assert.equal((await request('POST')).status,403);assert.equal((await request('GET','https://example.org')).status,403);assert.equal(checks,1);
 const accepted=await request('GET','http://127.0.0.1:3099');assert.equal(accepted.status,200);const capability=JSON.parse(accepted.body);assert.equal(capability.path,'/plugins/dsh-tool-manager/action');assert.match(capability.token,/^[0-9a-f]{64}$/);
});
test('stock baseline hides extra schemas until a committed selection while keeping stock tools callable',async t=>{
 const f=await fixture(t,{},['read','skill','knowledge_search'],'stock');await f.install();
 assert.ok(f.ctx.tools.get('read',f.agent));assert.ok(f.ctx.tools.get('skill',f.agent));assert.equal(f.ctx.tools.get('knowledge_search',f.agent),undefined);
 const found=await f.call('tool_manager_search',{task:'knowledge search'});assert.ok(found.value.tools.some(t=>t.name==='knowledge_search'));assert.equal(f.ctx.tools.get('knowledge_search',f.agent),undefined);
 f.ctx.tools.register(def('future_plugin_tool'));await f.step();assert.equal(f.ctx.tools.get('future_plugin_tool',f.agent),undefined);
 const selected=await f.call('tool_manager_select',{names:['knowledge_search']});assert.equal(selected.isError,false);
 f.agent.session.append('tool/result',{turn:0,step:0,message:{id:'stock-select',role:'tool',toolCallId:'stock-select',content:selected.content,source:{kind:'tool',name:'tool_manager_select'}},meta:selected.meta},{surfaceOp:'append'});
 await f.step();assert.ok(f.ctx.tools.get('knowledge_search',f.agent));assert.equal(f.ctx.tools.get('future_plugin_tool',f.agent),undefined);
});
