window.__ModuleLoader__.load({id:'dsh-tool-manager',factory:require=>{
 const React=require('react'),{createElement:h,useState,useEffect}=React;
 const css=`
.dtm{color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;width:100%;min-width:0;box-sizing:border-box}.dtm *{box-sizing:border-box}
.dtm h2{font-size:18px;margin:0 0 8px}.dtm p{margin:6px 0 12px;line-height:1.45;color:var(--dsw-alias-label-secondary)}
.dtm button,.dtm input,.dtm select{font:inherit;color:inherit;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:7px 9px;min-width:0}.dtm button{cursor:pointer}.dtm button:disabled,.dtm select:disabled{opacity:.55;cursor:default}
.dtm :is(input,select,button):focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.dtm-toolbar{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-base,#292929);display:flex;gap:8px;align-items:center;padding:8px 0 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dtm-search{flex:1 1 220px}.dtm-save{margin-left:auto}.dtm-counts{font-size:12px;color:var(--dsw-alias-label-secondary);margin:10px 0}.dtm-tool{display:grid;grid-template-columns:minmax(0,1fr) 132px;gap:8px 16px;padding:11px 0;border-bottom:1px solid var(--dsw-alias-border-l1);align-items:center}
.dtm-name{font-weight:600;overflow-wrap:anywhere}.dtm-description{grid-column:1;margin:3px 0 0!important;font-size:13px;overflow-wrap:anywhere}.dtm-owner{grid-column:1;font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.dtm-tool select{grid-column:2;grid-row:1/4;width:132px}.dtm-badge{font-size:11px;margin-left:7px;padding:2px 5px;border-radius:4px;background:var(--dsw-alias-bg-l1,rgba(127,127,127,.12));color:var(--dsw-alias-label-secondary)}
.dtm-error{color:var(--dsw-alias-state-error-primary)!important}.dtm-empty{padding:24px 0}.dtm-status{font-size:13px}@media(max-width:540px){.dtm-toolbar{flex-wrap:wrap}.dtm-save{margin-left:0}.dtm-tool{grid-template-columns:1fr}.dtm-tool select{grid-column:1;grid-row:auto;width:100%}}
`;
 async function api(action,settings){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let connection=window.__DSH_TOOL_MANAGER__;
  async function reconnect(){const response=await fetch('/plugins/dsh-tool-manager/connection',{credentials:'same-origin',signal:controller.signal});if(!response.ok)throw Error('Tool Manager could not reconnect to DSH.');connection=await response.json();window.__DSH_TOOL_MANAGER__=connection;}
  const request=()=>fetch(connection.path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:'Bearer '+connection.token},body:JSON.stringify({action,settings}),signal:controller.signal});
  try{if(!connection)await reconnect();let response=await request();if(response.status===401){await reconnect();response=await request();}if(!response.ok)throw Error(`Tool Manager request failed (HTTP ${response.status}).`);const data=await response.json();if(data.error)throw Error(data.error);return data;}catch(error){if(controller.signal.aborted)throw Error('Tool catalog request timed out.');throw error;}finally{clearTimeout(timer);}
 }
 function Page(){
  const[data,setData]=useState(null),[draft,setDraft]=useState(null),[query,setQuery]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  async function load(action='list'){setError('');try{const value=await api(action);setData(value);setDraft(value.settings);setError('');}catch(problem){setError(problem.message);}}
  useEffect(()=>{let live=true;api('list').then(value=>{if(live){setData(value);setDraft(value.settings);}}).catch(problem=>live&&setError(problem.message));return()=>{live=false;};},[]);
  if(!data||!draft)return h('section',{className:'dtm'},h('style',null,css),h('h2',null,'Tool Manager'),error?h(React.Fragment,null,h('p',{className:'dtm-error'},error),h('button',{onClick:()=>load()},'Retry')):h('p',null,'Loading tools…'));
  const text=query.trim().toLowerCase();
  const tools=data.tools.filter(tool=>!text||`${tool.name} ${tool.description} ${tool.owner}`.toLowerCase().includes(text));
  const effective=tool=>tool.filterable?(draft.tools[tool.name]||'hidden'):'loaded';
  const counts=data.tools.reduce((result,tool)=>{result[effective(tool)]++;return result;},{loaded:0,hidden:0});
  const change=(name,mode)=>setDraft(current=>({...current,tools:{...current.tools,[name]:mode}}));
  const save=async()=>{setBusy(true);setNotice('');try{const value=await api('save',draft);setData(value);setDraft(value.settings);setNotice('Saved. New model steps now use this tool list.');setError('');}catch(problem){setError(problem.message);}finally{setBusy(false);}};
  return h('section',{className:'dtm'},h('style',null,css),h('h2',null,'Tool Manager'),
   h('p',null,'DSH tools stay loaded. Every other registered tool is either Loaded or Hidden behind browse_tools search.'),
   error&&h('p',{className:'dtm-error',role:'alert'},error),notice&&h('p',{className:'dtm-status',role:'status'},notice),
   h('div',{className:'dtm-toolbar'},h('input',{className:'dtm-search','aria-label':'Search tools',placeholder:'Find a tool…',value:query,onChange:event=>setQuery(event.target.value)}),h('button',{disabled:busy,onClick:()=>load('refresh')},'Refresh'),h('button',{className:'dtm-save',disabled:busy,onClick:save},busy?'Saving…':'Save')),
   h('div',{className:'dtm-counts'},`${counts.loaded} loaded · ${counts.hidden} hidden · ${data.tools.length} total`),
   !tools.length&&h('p',{className:'dtm-empty'},'No tools match.'),
   ...tools.map(tool=>h('div',{className:'dtm-tool',key:tool.name},
    h('div',{className:'dtm-name'},tool.name,!tool.filterable&&h('span',{className:'dtm-badge'},tool.stock?'DSH':'Required')),
    h('p',{className:'dtm-description'},tool.description),h('div',{className:'dtm-owner'},tool.owner),
    h('select',{'aria-label':'Availability for '+tool.name,disabled:!tool.filterable,value:effective(tool),onChange:event=>change(tool.name,event.target.value)},h('option',{value:'loaded'},'Loaded'),h('option',{value:'hidden'},'Hidden'))
   ))
  );
 }
 return{inject:['slots'],apply(ctx){ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'tool-manager',order:65,label:()=> 'Tool Manager'},Page));}};
}});
