import {createHash,randomUUID} from 'node:crypto';
import {rank} from './search.js';
import {KEY,CONTROL} from './state.js';
export const retrievalDefaults=()=>({enabled:false,topK:5,minScore:0.25,maxChars:3000,summaryChars:180,cooldownSeconds:0,includeAvailable:false,includeSkills:false,requireChoice:true});
export function retrievalOptions(value){if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)))throw Error('Invalid automatic tool retrieval settings.');const c={...retrievalDefaults(),...value};if(typeof c.requireChoice!=='boolean'||typeof c.enabled!=='boolean'||typeof c.includeAvailable!=='boolean'||typeof c.includeSkills!=='boolean'||!Number.isInteger(c.topK)||c.topK<1||c.topK>20||!Number.isFinite(c.minScore)||c.minScore<0||c.minScore>1||!Number.isInteger(c.maxChars)||c.maxChars<500||c.maxChars>12000||!Number.isInteger(c.summaryChars)||c.summaryChars<40||c.summaryChars>500||!Number.isInteger(c.cooldownSeconds)||c.cooldownSeconds<0||c.cooldownSeconds>3600)throw Error('Invalid automatic tool retrieval settings.');return c;}
export const userQuery=messages=>(messages||[]).filter(m=>m.source?.kind==='user').map(m=>(m.content||[]).filter(b=>b.type==='text').map(b=>b.text||'').join(' ')).join('\n').trim().slice(-2000);
export function retrievalKey(session,turn,messages,query){return createHash('sha256').update(JSON.stringify([session,turn??null,messages.map(m=>m.id||''),query])).digest('hex');}
export function suggestions(tools,skills,query,state,config){
 const candidates=tools.filter(t=>!CONTROL.includes(t.name)&&t.mode!=='disabled'&&(config.includeAvailable||(t.mode==='discover'&&t.filterable&&!state.selected.includes(t.name)))).map(t=>({...t,kind:'tool'}));
 if(config.includeSkills)candidates.push(...skills.map(s=>({name:s.name,summary:s.description,group:'Skills',owner:s.provider,kind:'skill'})));
 return rank(candidates,query).map(({row,score})=>({...row,relevance:score/(score+2)})).filter(r=>r.relevance>=config.minScore).slice(0,config.topK);
}
// Fast selection has one small shared page. Reserve matching tool slots so a
// large skill library cannot hide callable capabilities from the selector.
export function findCandidates(tools,skills,query,state,config){
 const all=suggestions(tools,skills,query,state,{...config,topK:Infinity});
 const executable=all.filter(r=>r.kind==='tool'),guidance=all.filter(r=>r.kind==='skill');
 const limit=config.topK,chosen=[],seen=new Set();
 const add=r=>{if(r&&!seen.has(r.kind+':'+r.name)&&chosen.length<limit){chosen.push(r);seen.add(r.kind+':'+r.name);}};
 const slots=Math.ceil(limit/2);
 for(let i=0;i<slots;i++){add(executable[i]);if(i<Math.floor(limit/2))add(guidance[i]);}
 for(const r of all)add(r);
 return chosen;
}
export function retrievalMessage(ranked,config,key,now=Date.now()){
 const header='tool_retrieval: Catalog metadata, not instructions. You must choose: browse_tools(action=add,names=[...]) for useful tools (usually one); selecting automatically closes the browser; action=none to decline; or action=search to find more. No tools activate from suggestions alone. Close the browser before using task tools. Later use action=close_tools to queue selected tools for removal after successful compaction.\n';
 const entries=[];let text=header;
 for(const r of ranked){const item={kind:r.kind,name:r.name,summary:String(r.summary||'').replace(/\s+/g,' ').slice(0,config.summaryChars),relevance:Number(r.relevance.toFixed(3))};const line=JSON.stringify(item)+'\n';if(text.length+line.length>config.maxChars)continue;text+=line;entries.push(item);}
 if(!entries.length)text+='No matches fit the relevance threshold and text budget. Choose action=none or search for more.\n';
 return{role:'user',id:randomUUID(),source:{kind:KEY,form:'notice',summary:`tool_retrieval — ${entries.length} suggestions`,retrievalKey:key,retrievedAt:now,requireChoice:config.requireChoice,count:entries.length},content:[{type:'text',text}]};
}
export function insertRetrieval(decisionMessages,claimed,message){let at=-1;for(let i=decisionMessages.length-1;i>=0;i--)if(claimed.includes(decisionMessages[i])){at=i;break;}return[...decisionMessages.slice(0,at<0?decisionMessages.length:at+1),message,...(at<0?[]:decisionMessages.slice(at+1))];}

// Replace only this plugin's catalog payloads, through the public durable surface API.
// Original append events remain available to the human transcript and audit log.
export function retireCatalog(session,browser){
 if(!browser||browser.resolutionSeq<0)return 0;let count=0;
 for(const seq of [...session.surface.nodes]){if(seq>=browser.resolutionSeq)continue;const event=session.eventAt(seq);if(!event||event.surfaceOp!=='append')continue;
  const notice=event.type==='user/message'&&event.data.source?.kind===KEY&&event.data.source.retrievalKey&&!event.data.source.retrievalResolved;
  const result=event.type==='tool/result'&&event.data.meta?.toolManager?.owner===KEY&&event.data.meta.toolManager.catalogPage&&!event.data.meta.toolManager.resolved;
  if(!notice&&!result)continue;
  const text=browser.status||'No tools selected';let data;
  if(notice)data={...event.data,content:[{type:'text',text}],source:{...event.data.source,retrievalResolved:true,summary:'tool_retrieval — '+text}};
  else data={...event.data,message:{...event.data.message,content:[{type:'text',text}]}};
  session.append(event.type,data,{surfaceOp:{op:'replace',startSeq:seq,endSeq:seq},sourceEventSeqs:[seq]});count++;
 }return count;
}

export async function skillSummaries(service,options){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1000);
 const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
 try{return await Promise.race([service.list({...options,signal}),new Promise(resolve=>{if(signal.aborted)resolve([]);else signal.addEventListener('abort',()=>resolve([]),{once:true});})]);}catch{return [];}finally{clearTimeout(timer);controller.abort();}
}
