export const KEY='dsh-tool-manager';
export const CONTROL=['browse_tools','tool_manager_search','tool_manager_select','tool_manager_close'];
export const empty=()=>({version:1,selected:[],oneShot:[],pending:[],skills:[],browser:{open:false,added:[],resolutionSeq:-1,status:''},retrievals:[],lastCompaction:-1});
const strings=x=>Array.isArray(x)&&x.length<=256&&x.every(y=>typeof y==='string'&&y.length<=256);
export function valid(s){return s?.version===1&&strings(s.selected)&&strings(s.pending)&&strings(s.skills)&&Number.isInteger(s.lastCompaction)&&s.pending.every(n=>s.selected.includes(n))&&(s.oneShot===undefined||(strings(s.oneShot)&&s.oneShot.every(n=>s.selected.includes(n))))&&(s.browser===undefined||(typeof s.browser.open==='boolean'&&strings(s.browser.added)&&Number.isInteger(s.browser.resolutionSeq)&&typeof s.browser.status==='string'))&&(s.retrievals===undefined||(Array.isArray(s.retrievals)&&s.retrievals.length<=64&&s.retrievals.every(r=>typeof r.key==='string'&&r.key.length===64&&Number.isFinite(r.at))));}
export function fold(state,event){
 if(event.surfaceOp&&typeof event.surfaceOp==='object'&&event.surfaceOp.op==='replace')return state;
 if(event.type==='user/message'&&event.data.source?.kind===KEY&&typeof event.data.source.retrievalKey==='string'&&!event.data.source.retrievalResolved&&/^[0-9a-f]{64}$/.test(event.data.source.retrievalKey)&&Number.isFinite(event.data.source.retrievedAt)){const {retrievalKey:key,retrievedAt:at}=event.data.source;return{...state,...(event.data.source.requireChoice?{browser:{open:true,added:state.browser?.open?state.browser.added:[],resolutionSeq:state.browser?.resolutionSeq??-1,status:state.browser?.status||''}}:{}),retrievals:[...(state.retrievals||[]).filter(r=>r.key!==key),{key,at}].slice(-64)};}

 if((event.type==='tool/result'&&!event.data.message.isError)||(event.type==='tool/ptc-dispatch'&&!event.data.isError&&[...CONTROL,'tool_search','tool_select','tool_close'].includes(event.data.name))){const r=event.data.meta?.toolManager;if(r?.owner===KEY){let next=valid(r.state)?structuredClone(r.state):state;if(r.browser){const prior=next.browser||empty().browser;const {action,names=[]}=r.browser;if(action==='open')next={...next,browser:{...prior,open:true,added:prior.open?prior.added:[]}};if(action==='add'&&strings(names))next={...next,browser:{...prior,open:true,added:[...new Set([...(prior.open?prior.added:[]),...names])]}};if(action==='close')next={...next,browser:{...prior,open:false,resolutionSeq:event.seq,status:prior.added.length?`${prior.added.length} tools selected`:'No tools selected'}};}return next;}}

 const success=event.type==='tool/result'&&!event.data.message.isError||event.type==='tool/ptc-dispatch'&&!event.data.isError;
 const name=event.type==='tool/result'?event.data.message.source?.name:event.data.name;
 if(success&&state.oneShot?.includes(name)&&!CONTROL.includes(name))return {...state,selected:state.selected.filter(n=>n!==name),pending:state.pending.filter(n=>n!==name),oneShot:state.oneShot.filter(n=>n!==name)};
 if(event.type==='compaction/end'&&!event.data.error&&event.seq>state.lastCompaction)return {...state,selected:state.selected.filter(n=>!state.pending.includes(n)),pending:[],oneShot:(state.oneShot||[]).filter(n=>!state.pending.includes(n)),lastCompaction:event.seq};
 return state;
}
export function select(state,names,skills=[],limit=7,oneShot=[]){
 if(!strings(names)||!names.length||names.length>limit||new Set(names).size!==names.length)throw Error(`Select 1–${limit} unique tool names per call.`);
 if(!strings(oneShot)||oneShot.some(n=>!names.includes(n)))throw Error('Use-once names must be selected tools.');
 if(!strings(skills)||skills.length>7)throw Error('Select at most seven skills per call.');
 const combinedSkills=[...new Set([...state.skills,...skills])];if(combinedSkills.length>256)throw Error('The session skill-selection limit is 256.');const selected=[...new Set([...state.selected,...names])];if(selected.length>256)throw Error('Close tools and compact before opening more than 256 tools.');
 return {...state,selected,oneShot:[...new Set([...(state.oneShot||[]).filter(n=>!names.includes(n)),...oneShot])],pending:state.pending.filter(n=>!names.includes(n)),skills:combinedSkills};
}
export function close(state,names){if(!strings(names)||!names.length||names.some(n=>!state.selected.includes(n)))throw Error('Name currently selected tools to close.');return {...state,pending:[...new Set([...state.pending,...names])]};}
