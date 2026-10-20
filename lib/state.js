export const KEY='dsh-tool-manager';
export const CONTROL=['tool_search','tool_select','tool_close'];
export const empty=()=>({version:1,selected:[],pending:[],skills:[],lastCompaction:-1});
const strings=x=>Array.isArray(x)&&x.length<=256&&x.every(y=>typeof y==='string'&&y.length<=256);
export function valid(s){return s?.version===1&&strings(s.selected)&&strings(s.pending)&&strings(s.skills)&&Number.isInteger(s.lastCompaction)&&s.pending.every(n=>s.selected.includes(n));}
export function fold(state,event){
 if(event.type==='tool/result'&&!event.data.message.isError){const r=event.data.meta?.toolManager;if(r?.owner===KEY&&valid(r.state))return structuredClone(r.state);}
 if(event.type==='tool/ptc-dispatch'&&!event.data.isError&&CONTROL.includes(event.data.name)){const r=event.data.meta?.toolManager;if(r?.owner===KEY&&valid(r.state))return structuredClone(r.state);}
 if(event.type==='compaction/end'&&!event.data.error&&event.seq>state.lastCompaction)return {...state,selected:state.selected.filter(n=>!state.pending.includes(n)),pending:[],lastCompaction:event.seq};
 return state;
}
export function select(state,names,skills=[],limit=7){
 if(!strings(names)||!names.length||names.length>limit||new Set(names).size!==names.length)throw Error(`Select 1–${limit} unique tool names per call.`);
 if(!strings(skills)||skills.length>7)throw Error('Select at most seven skills per call.');
 const selected=[...new Set([...state.selected,...names])];if(selected.length>256)throw Error('Close tools and compact before opening more than 256 tools.');
 return {...state,selected,pending:state.pending.filter(n=>!names.includes(n)),skills:[...new Set([...state.skills,...skills])]};
}
export function close(state,names){if(!strings(names)||!names.length||names.some(n=>!state.selected.includes(n)))throw Error('Name currently selected tools to close.');return {...state,pending:[...new Set([...state.pending,...names])]};}
