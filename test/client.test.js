import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import {defaults} from '../lib/settings.js';
test('settings tree renders plugin folders, ordering, semantic controls and scope limits',async()=>{const data={settings:defaults(),tools:[{name:'browser_click',owner:'Browser plugin',ownership:'user mapping',group:'Web/Actions',summary:'Click a page button',mode:'discover',filterable:true,order:0},{name:'tool_manager_search',owner:'Tool manager',ownership:'package source match',group:'Discovery',summary:'Find tools',mode:'basic',filterable:false,order:0}],agents:[{id:'fixture',selected:['browser_click'],pending:['browser_click']}],index:{status:'idle',cached:0},limits:['Fixture scope limitation']};const states=[data,data.settings,'','',0,'','',false];let exported,Page;const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props,children}),useState:()=>[states.shift(),()=>{}],useEffect:()=>{}};vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{AbortController,setTimeout,clearTimeout,window:{__ModuleLoader__:{load:mod=>{exported=mod.factory(()=>React);}}}});exported.apply({slots:{inject:(_slot,fn)=>fn(),register:(_opts,component)=>{Page=component;}}});const tree=Page();const text=JSON.stringify(tree);assert.match(text,/Browser plugin/);assert.match(text,/Web/);assert.match(text,/Folder order/);assert.match(text,/Tool order/);assert.match(text,/Embedding API root/);assert.match(text,/Queued for compaction/);assert.match(text,/Fixture scope limitation/);assert.match(text,/dtm-tool-head/);assert.match(text,/dtm-toolbar/);assert.doesNotMatch(text,/"type":"table"/);});
test('folder and checkbox bulk edits span pages, preserve siblings and remain drafts until saved',async()=>{
 const settings=defaults();settings.tools.alpha_0={summary:'Keep this description',mode:'inherit'};
 const tools=Array.from({length:65},(_,i)=>({name:'alpha_'+i,owner:'Plugin A',group:i<60?'Web/Actions':'Other',mode:'inherit',summary:'Action',filterable:true}));
 tools.push({name:'beta',owner:'Plugin B',group:'Web/Actions',mode:'inherit',summary:'Other plugin'}, {name:'tool_manager_search',owner:'Plugin A',group:'Web/Actions',mode:'basic',summary:'Control'});
 const data={settings,tools,agents:[],index:{},limits:[]},states=[data,structuredClone(settings),'','',0,'','',false,[]],requests=[];let cursor,Page,exported;
 const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props,children}),useState:()=>{const i=cursor++;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useEffect:()=>{}};
 vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{AbortController,setTimeout,clearTimeout,window:{__DSH_TOOL_MANAGER__:{path:'/fixture',token:'fixture'},__ModuleLoader__:{load:mod=>{exported=mod.factory(()=>React);}}},fetch:async(_url,request)=>{requests.push(JSON.parse(request.body));return{ok:true,json:async()=>({...data,settings:JSON.parse(request.body).settings})};}});
 exported.apply({slots:{inject:(_slot,fn)=>fn(),register:(_opts,component)=>{Page=component;}}});
 function render(){cursor=0;return Page();}
 function find(tree,predicate){if(!tree||typeof tree!=='object')return;if(predicate(tree))return tree;for(const child of tree.children||[]){const result=Array.isArray(child)?child.map(v=>find(v,predicate)).find(Boolean):find(child,predicate);if(result)return result;}}
 const byLabel=label=>find(render(),n=>n.props?.['aria-label']===label);
 byLabel('Select folder Plugin A / Web').props.onChange({target:{checked:true}});
 assert.equal(states[8].length,60);assert.ok(!states[8].includes('beta'));assert.ok(!states[8].includes('tool_manager_search'));
 byLabel('Apply availability to selected tools').props.onChange({target:{value:'discover'}});
 assert.equal(Object.keys(states[1].tools).length,60);assert.equal(states[1].tools.alpha_59.mode,'discover');assert.equal(states[1].tools.alpha_0.summary,'Keep this description');assert.equal(states[1].tools.alpha_60,undefined);assert.equal(settings.tools.alpha_0.mode,'inherit');assert.equal(requests.length,0);
 byLabel('Apply availability to folder Plugin A').props.onChange({target:{value:'disabled'}});
 assert.equal(states[1].tools.alpha_64.mode,'disabled');assert.equal(states[1].tools.beta,undefined);assert.equal(states[1].tools.tool_manager_search,undefined);
 byLabel('Selection lifetime for alpha_0').props.onChange({target:{value:'once'}});assert.equal(states[1].tools.alpha_0.lifetime,'once');
 byLabel('Fast tool selection').props.onChange({target:{checked:true}});assert.equal(states[1].fastSelection,true);
 byLabel('Automatic tool retrieval').props.onChange({target:{checked:true}});byLabel('Top results (maximum)').props.onChange({target:{value:'3'}});byLabel('Use one tool browser').props.onChange({target:{checked:true}});byLabel('Default tool baseline').props.onChange({target:{value:'discover'}});
 const save=find(render(),n=>n.type==='button'&&n.children.includes('Save changes'));await save.props.onClick();
 assert.equal(requests.length,1);assert.equal(requests[0].action,'save');assert.equal(requests[0].settings.tools.alpha_64.mode,'disabled');assert.equal(requests[0].settings.autoRetrieval.enabled,true);assert.equal(requests[0].settings.autoRetrieval.topK,3);assert.equal(requests[0].settings.compactBrowser,true);assert.equal(requests[0].settings.defaultMode,'discover');
});
test('a stalled catalog request times out with a working Retry button',async()=>{
 let cursor=0,Page,exported,timeout;const effects=[],states=[null,null,'','',0,'','',false,[]];
 const settings=defaults();const data={settings,tools:[],agents:[],limits:[],index:{}};
 let stalled=true;
 const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props,children}),useState:()=>{const i=cursor++;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useEffect:fn=>effects.push(fn)};
 vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{AbortController,setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{},window:{__DSH_TOOL_MANAGER__:{path:'/fixture',token:'fixture'},__ModuleLoader__:{load:m=>exported=m.factory(()=>React)}},fetch:async(_url,options)=>stalled?new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')))):{ok:true,json:async()=>data}});
 exported.apply({slots:{inject:(_slot,fn)=>fn(),register:(_opts,p)=>Page=p}});
 Page();effects[0]();timeout();await new Promise(resolve=>setImmediate(resolve));
 cursor=0;const failed=Page();assert.match(JSON.stringify(failed),/request timed out/);assert.doesNotMatch(JSON.stringify(failed),/Loading tools…/);
 function find(n){if(!n||typeof n!=='object')return;if(n.type==='button'&&n.children.includes('Retry loading tools'))return n;for(const c of n.children||[]){const found=Array.isArray(c)?c.map(find).find(Boolean):find(c);if(found)return found;}}
 const retry=find(failed);assert.ok(retry);stalled=false;await retry.props.onClick();assert.equal(states[0],data);assert.equal(states[5],'');
});
test('stale plugin capabilities renew once through the authenticated connection endpoint',async()=>{
 let cursor=0,exported,Page;const effects=[],states=[null,null,'','',0,'','',false,[]],requests=[];const data={settings:defaults(),tools:[],agents:[],limits:[],index:{}};
 const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props,children}),useState:()=>{const i=cursor++;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useEffect:fn=>effects.push(fn)};
 const win={__DSH_TOOL_MANAGER__:{path:'/plugins/dsh-tool-manager/action',token:'old'},__ModuleLoader__:{load:m=>exported=m.factory(()=>React)}};
 vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{AbortController,setTimeout,clearTimeout,window:win,fetch:async(path,options)=>{
  requests.push({path,options});assert.equal(options.credentials,'same-origin');
  if(path.endsWith('/connection'))return{ok:true,status:200,json:async()=>({path:'/plugins/dsh-tool-manager/action',token:'new'})};
  if(options.headers.Authorization==='Bearer old')return{ok:false,status:401};
  return{ok:true,status:200,json:async()=>data};
 }});
 exported.apply({slots:{inject:(_slot,fn)=>fn(),register:(_opts,p)=>Page=p}});Page();effects[0]();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(states[0],data);assert.equal(win.__DSH_TOOL_MANAGER__.token,'new');assert.equal(requests.length,3);assert.equal(requests[1].path,'/plugins/dsh-tool-manager/connection');assert.equal(states[5],'');
});
