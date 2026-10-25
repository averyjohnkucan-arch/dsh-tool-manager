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
async function fixture(t,tools={},names=['read','ask_user_question','browser_click'],defaultMode='inherit',extra={}){
 const dir=await mkdtemp(join(tmpdir(),'tool-manager-audit-'));t.after(()=>rm(dir,{recursive:true,force:true}));await writeFile(join(dir,'settings.json'),JSON.stringify({...defaults(),compactBrowser:false,fastSelection:false,tools,defaultMode,...extra}));
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
test('provider-default policy preserves all existing tools and original schemas; generic names do not collide',async t=>{
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
test('compact browser gates unselected task calls, auto-closes on add, and retires catalog history',async t=>{
 const f=await fixture(t,{read:override('basic')},['read','browser_click','browser_type'],'discover',{compactBrowser:true});await f.install();
 assert.ok(f.ctx.tools.get('browse_tools',f.agent));assert.equal(f.ctx.tools.get('tool_manager_search',f.agent),undefined);assert.equal(f.ctx.tools.get('browser_click',f.agent),undefined);
 let id=0;function commit(result,name='browse_tools'){return f.agent.session.append('tool/result',{turn:0,step:0,message:{id:'browser-'+(++id),role:'tool',toolCallId:'browser-call-'+id,content:result.content,source:{kind:'tool',name},...(result.isError?{isError:true}:{})},meta:result.meta},{surfaceOp:'append'});}
 const checkpoint=f.agent.session.append('user/message',{role:'user',id:'checkpoint',source:{kind:'user'},content:[{type:'text',text:'Checkpoint: browse a webpage'}]},{surfaceOp:'append'});
 const found=await f.call('browse_tools',{action:'search',task:'browse page'});assert.equal(found.isError,false);const catalogEvent=commit(found);await f.step();
 assert.equal((await f.call('read')).isError,true,'even pinned task tools must wait for the browser to close');
 const selected=await f.call('browse_tools',{action:'add',names:['browser_click']});assert.equal(selected.isError,false);commit(selected);await f.step();assert.ok(f.ctx.tools.get('browser_click',f.agent));assert.equal((await f.call('browser_click')).isError,false,'add automatically closes before the next task call');
 const done=await f.call('browse_tools',{action:'close'});assert.match(done.value.status,/1 tools selected/);commit(done);await f.step();assert.equal((await f.call('browser_click')).isError,false);
 const messages=f.agent.session.deriveMessages();assert.ok(messages.some(m=>m.content.some(b=>b.type==='text'&&b.text==='1 tools selected')));assert.ok(!f.agent.session.surface.nodes.includes(catalogEvent.seq));assert.ok(f.agent.session.surface.nodes.includes(checkpoint.seq));assert.equal(f.agent.session.eventAt(catalogEvent.seq).data.meta.toolManager.catalogPage,true,'original audit event must remain unchanged');
 const queued=await f.call('browse_tools',{action:'close_tools',names:['browser_click']});commit(queued);await f.step();assert.ok(f.ctx.tools.get('browser_click',f.agent));
 f.agent.session.append('compaction/end',{compactionId:'browser-close-ok',turn:0});await f.step();assert.equal(f.ctx.tools.get('browser_click',f.agent),undefined);
});
test('automatic retrieval offers five suggestions once, requires a choice, and select-none retires its notice',async t=>{
 const f=await fixture(t,{},Array.from({length:8},(_,i)=>'browser_action_'+i),'discover',{compactBrowser:true,autoRetrieval:{enabled:true,topK:5,minScore:0,maxChars:3000,summaryChars:180,cooldownSeconds:0,includeAvailable:false,includeSkills:false,requireChoice:true}});await f.install();
 const user={role:'user',id:'retrieve-user',source:{kind:'user'},content:[{type:'text',text:'Browse a page and click a button'}]};
 const payload={agent:f.agent,messages:[user],turn:1,step:1,signal:new AbortController().signal};
 const step=()=>f.ctx.waterfall('agent/pre-step',payload,()=>Promise.resolve({kind:'enter',messages:[user],startsRequestSeries:true}));
 const result=await step();assert.equal(result.startsRequestSeries,true);assert.equal(result.messages.length,2);const notice=result.messages[1];assert.equal(notice.source.count,5);assert.ok(notice.content[0].text.length<=3000);
 f.agent.session.append('user/message',notice,{surfaceOp:'append'});
 const duplicate=await step();assert.equal(duplicate.messages.length,1,'committed notice must not be repeated for the same claimed user batch');
 const none=await f.call('browse_tools',{action:'none'});assert.equal(none.value.status,'No tools selected');f.agent.session.append('tool/result',{turn:1,step:1,message:{id:'none-result',role:'tool',toolCallId:'none-call',content:none.content,source:{kind:'tool',name:'browse_tools'}},meta:none.meta},{surfaceOp:'append'});
 await f.step();const messages=f.agent.session.deriveMessages();assert.ok(messages.some(m=>m.content.some(b=>b.type==='text'&&b.text==='No tools selected')));assert.ok(!messages.some(m=>m.content.some(b=>b.type==='text'&&b.text.startsWith('tool_retrieval:'))));
});
test('an unresolved browser steers the model back to a choice with bounded retries',async t=>{
 const f=await fixture(t,{},['browser_click'],'discover',{compactBrowser:true});await f.install();const messages=[];f.agent.steer=message=>messages.push(message);
 const opened=await f.call('browse_tools',{action:'search',task:'browser'});f.agent.session.append('tool/result',{turn:1,step:1,message:{id:'open-stop-test',role:'tool',toolCallId:'stop-open',content:opened.content,source:{kind:'tool',name:'browse_tools'}},meta:opened.meta},{surfaceOp:'append'});
 await f.ctx.serial('agent/turn-stopping',{agent:f.agent,turn:1});await f.ctx.serial('agent/turn-stopping',{agent:f.agent,turn:1});assert.equal(messages.length,2);assert.match(messages[0].content[0].text,/choose none/);
 await assert.rejects(f.ctx.serial('agent/turn-stopping',{agent:f.agent,turn:1}),/choice required/);
});
test('use-once selection keeps failed calls available and retires after committed success through public services',async t=>{
 const f=await fixture(t,{},['read'],'discover',{compactBrowser:true});f.ctx.tools.register(defineTool({name:'browser_click',description:'Click fixture',parameters:{count:{type:'integer',required:true}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=> 'original task output'}));await f.install();
 let id=0;const commit=(r,name='browse_tools')=>f.agent.session.append('tool/result',{turn:0,step:0,message:{id:'once-'+(++id),role:'tool',toolCallId:'once-'+id,content:r.content,source:{kind:'tool',name},...(r.isError?{isError:true}:{})},...(r.meta?{meta:r.meta}:{})},{surfaceOp:'append'});
 const add=await f.call('browse_tools',{action:'add',names:['browser_click'],use_once:true});assert.equal(add.isError,false);assert.deepEqual(add.value.oneShot,['browser_click']);commit(add);await f.step();
 commit(await f.call('browse_tools',{action:'close'}));await f.step();assert.ok(f.ctx.tools.get('browser_click',f.agent));
 const bad=await f.call('browser_click',{unknown:'malformed'});assert.equal(bad.isError,true);commit(bad,'browser_click');await f.step();assert.ok(f.ctx.tools.get('browser_click',f.agent));
 const ok=await f.call('browser_click',{count:1});assert.equal(ok.isError,false);assert.ok(f.ctx.tools.get('browser_click',f.agent),'execution alone does not mutate committed selection');const event=commit(ok,'browser_click');await f.step();assert.equal(f.ctx.tools.get('browser_click',f.agent),undefined);assert.deepEqual(f.agent.session.eventAt(event.seq).data.message.content,ok.content);
 const again=await f.call('browse_tools',{action:'add',names:['browser_click'],use_once:false});assert.deepEqual(again.value.oneShot,[]);
});
test('saved use-once lifetime requires discover policy and supports an explicit persistent override',async t=>{
 const f=await fixture(t,{browser_click:{...override('discover'),lifetime:'once'},read:override('basic')});await f.install();
 assert.deepEqual((await f.call('tool_manager_select',{names:['browser_click']})).value.oneShot,['browser_click']);
 assert.deepEqual((await f.call('tool_manager_select',{names:['browser_click'],use_once:false})).value.oneShot,[]);
 assert.equal((await f.call('tool_manager_select',{names:['read'],use_once:true})).isError,true);
});
test('combined find uses current request route, commits only selected schemas, closes browser and keeps candidates out of parent context',async t=>{
 const f=await fixture(t,{},['browser_click','browser_type'],'discover',{compactBrowser:true,fastSelection:true,autoRetrieval:{enabled:true,minScore:0}});let request;
 new(class extends Service{constructor(){super(f.ctx,'llm');}async prepareCall(config,_signal,configure){assert.deepEqual({provider:config.provider,model:config.model},{provider:'current',model:'model'});const controls=configure({}, {reasoning:{efforts:[{id:'off'}]}});assert.equal(controls.reasoningEffort,'off');return{config:{...config,...controls},async *stream(r){request=r;yield{type:'block-end',index:0,block:{type:'tool-call',name:'select_tools',arguments:'{"names":["browser_click"],"skills":[]}'}};yield{type:'finish',reason:{kind:'tool-calls'}};}};}})();
 await f.install();await f.ctx.waterfall('agent/request',{agent:f.agent},()=>Promise.resolve({provider:'current',model:'model',reasoningEffort:'high'}));
 const user={role:'user',id:'fast-user',source:{kind:'user'},content:[{type:'text',text:'click a page'}]};const pre=await f.ctx.waterfall('agent/pre-step',{agent:f.agent,messages:[user],turn:1,signal:new AbortController().signal},()=>Promise.resolve({kind:'enter',messages:[user]}));assert.equal(pre.messages.length,1,'discovery must be model-initiated');
 const result=await f.call('browse_tools',{action:'find',task:'click a page',keywords:['browser']});assert.equal(result.isError,false);assert.equal(result.value.status,'Model chose browser_click');assert.ok(request.messages[0].content[0].text.includes('browser_type'));assert.ok(!JSON.stringify(result.content).includes('browser_type'));assert.equal(result.meta.toolManager.selectionTrace.stages.length,2);assert.equal(f.ctx.tools.get('browser_click',f.agent),undefined,'no activation before commit');
 f.agent.session.append('tool/result',{turn:1,step:1,message:{id:'fast-result',role:'tool',toolCallId:'fast-call',content:result.content,source:{kind:'tool',callId:'fast-call'}},meta:result.meta},{surfaceOp:'append'});await f.step();assert.ok(f.ctx.tools.get('browser_click',f.agent));assert.equal(f.ctx.tools.get('browser_type',f.agent),undefined);assert.equal((await f.call('browser_click')).isError,false,'no separate close call required');
 const reopened=await f.call('browse_tools',{action:'search',folder:'browser_click'});assert.equal(reopened.isError,false);assert.deepEqual(reopened.value.selected,['browser_click']);assert.equal(reopened.value.browser.action,'resolve');assert.match(reopened.value.next,/Call these tools directly/);assert.ok(!reopened.value.catalogPage);
 const other=f.addAgent('search-alias');await f.ctx.waterfall('agent/request',{agent:other.agent},()=>Promise.resolve({provider:'current',model:'model'}));const alias=await f.call('browse_tools',{action:'search',task:'click a page'},other.agent);assert.equal(alias.isError,false);assert.equal(alias.value.browser.action,'resolve');assert.equal(alias.value.status,'Model chose browser_click');assert.ok(!alias.value.catalogPage);
});

test('global fast search scans all skills regardless of suggestion settings, commits only chosen tools and keeps huge catalogs out',async t=>{
 const f=await fixture(t,{},['skill','office_tools','office_extra'],'essential',{compactBrowser:true,fastSelection:true,autoRetrieval:{includeSkills:false,includeAvailable:false,minScore:1}});
 f.ctx.skills.register({name:'excel-guide',description:'Excel budget spreadsheet workflow',content:'SELECTED EXCEL INSTRUCTIONS',source:'runtime'});
 f.ctx.skills.register({name:'unrelated-guide',description:'An unrelated gardening workflow',content:'UNSELECTED GARDEN INSTRUCTIONS',source:'runtime'});
 let request;
 new(class extends Service{constructor(){super(f.ctx,'llm');}async prepareCall(config,_signal,configure){const controls=configure({}, {reasoning:{efforts:[{id:'off'}]}});return{config:{...config,...controls},async *stream(r){request=r;yield{type:'block-end',index:0,block:{type:'tool-call',name:'select_tools',arguments:'{"names":["office_tools"],"skills":["excel-guide"]}'}};yield{type:'finish',reason:{kind:'tool-calls'}};}};}})();
 await f.install();await f.ctx.waterfall('agent/request',{agent:f.agent},()=>Promise.resolve({provider:'current',model:'model'}));
 const r=await f.call('browse_tools',{action:'find',task:'office tools Excel budget spreadsheet'});assert.equal(r.isError,false,JSON.stringify(r));
 assert.equal(request.reasoningEffort,'off');assert.match(JSON.stringify(request.messages),/excel-guide/);
 assert.equal(r.value.status,'Model chose office_tools, excel-guide');assert.deepEqual(r.value.selected,['office_tools','skill']);
 assert.match(JSON.stringify(r.content),/SELECTED EXCEL INSTRUCTIONS/);assert.doesNotMatch(JSON.stringify(r.content),/office_extra|UNSELECTED GARDEN INSTRUCTIONS/);
 f.agent.session.append('tool/result',{turn:0,step:0,message:{id:'global-select',role:'tool',toolCallId:'global-select',content:r.content,source:{kind:'tool',name:'browse_tools'}},meta:r.meta},{surfaceOp:'append'});
 await f.step();assert.ok(f.ctx.tools.get('office_tools',f.agent));assert.ok(f.ctx.tools.get('skill',f.agent));assert.equal(f.ctx.tools.get('office_extra',f.agent),undefined);
 const before=f.ctx.skills.list({scope:f.agent});assert.equal((await before).length,2);
 // A catalog provider loaded after Tool Manager must not bypass the per-agent
 // window installed at agent creation. This matches both plugin startup orders.
 f.ctx.on('agent/pre-step',async(_p,next)=>{const d=await next();return{...d,messages:[...d.messages,{role:'user',id:'huge',source:{kind:'skill-catalog',entries:Array.from({length:11000},(_,i)=>({name:`guide-${i}`,description:'metadata'}))},content:[{type:'text',text:'HUGE_CATALOG '.repeat(500000)}]}]};},{prepend:true});
 const other=f.addAgent('created-after-providers');f.ctx.emit('agent/created',{agent:other.agent});
 const d=await f.step(other.agent);assert.ok(d.messages.at(-1).content[0].text.length<600);assert.equal((await f.ctx.skills.list({scope:other.agent})).length,2);
});

test('exact find names load schemas directly, advertise their menu and preserve provider restrictions',async t=>{
 const f=await fixture(t,{},['read'],'essential',{compactBrowser:true,fastSelection:true});
 f.ctx.tools.register(defineTool({name:'generate_video',description:'Full-motion video',parameters:{action:{type:'string',enum:['menu','generate'],default:'menu'},first_frame_path:{type:'string'}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>'menu'}));
 await f.install();
 for(const args of [{action:'find',task:'full schema for video',names:['generate_video']},{action:'find',task:'generate video'},{action:'find',names:['generate_video']}]){
  const result=await f.call('browse_tools',args);assert.equal(result.isError,false,JSON.stringify(result));assert.deepEqual(result.value.selected,['generate_video']);assert.deepEqual(result.value.ready[0].menuCall,{name:'generate_video',arguments:{action:'menu'}});assert.equal(result.meta.toolManager.selectionTrace.stages.length,1,'no LLM or skill catalog request');assert.equal(f.ctx.tools.get('generate_video',f.agent),undefined,'selection still requires commit');
 }
 const restricted=f.addAgent('restricted');restricted.agent.ctx.tools.restrict({deny:['generate_video']});await f.step(restricted.agent);assert.equal((await f.call('browse_tools',{action:'find',names:['generate_video']},restricted.agent)).isError,true);
 assert.equal((await f.call('browse_tools',{action:'find',names:['invented']})).isError,true);
});
test('invalid Bash calls get corrective guidance without executing or synthesizing a command',async t=>{
 const f=await fixture(t);let executions=0;
 f.ctx.tools.register(defineTool({name:'bash',description:'Bash fixture',parameters:{description:{type:'string',required:true},command:{type:'string',required:true}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async args=>{executions++;return args.command;}}));await f.install();
 for(const args of [{description:'Check a tool menu'},{command:'pwd'}]){
  const bad=await f.call('bash',args);assert.equal(bad.isError,true);assert.match(JSON.stringify(bad.content),/BOTH description and command/);assert.equal(executions,0);
 }
 const ok=await f.call('bash',{description:'Show current directory',command:'pwd'});assert.equal(ok.isError,false);assert.equal(executions,1);assert.equal(ok.value,'pwd');
});
