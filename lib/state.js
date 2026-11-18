export const KEY='dsh-tool-manager';
export const CONTROL=['browse_tools'];
export const empty=()=>({version:1,selected:[]});
const names=value=>Array.isArray(value)&&value.length<=256&&value.every(name=>typeof name==='string'&&name.length>0&&name.length<=256);
export const valid=state=>state?.version===1&&names(state.selected)&&new Set(state.selected).size===state.selected.length;

export function fold(state,event){
 if(event.surfaceOp?.op==='replace')return state;
 const success=event.type==='tool/result'?!event.data.message?.isError:event.type==='tool/ptc-dispatch'?!event.data.isError:false;
 if(!success)return state;
 const next=event.data.meta?.toolManager;
 return next?.owner===KEY&&valid(next.state)?structuredClone(next.state):state;
}
export function select(state,added){
 if(!names(added)||!added.length)throw Error('Select at least one tool.');
 const selected=[...new Set([...state.selected,...added])];
 if(selected.length>256)throw Error('Too many loaded tools in this conversation.');
 return{version:1,selected};
}
export function unselect(state,removed){
 if(!names(removed)||!removed.length)throw Error('Unload at least one tool.');
 return{version:1,selected:state.selected.filter(name=>!removed.includes(name))};
}
