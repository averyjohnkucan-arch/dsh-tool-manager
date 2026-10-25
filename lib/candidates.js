import {words} from './search.js';

export const canonicalName = value => String(value).trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
export const findKey=(task,keywords=[])=>JSON.stringify([canonicalName(task),[...new Set(keywords.map(canonicalName))].sort()]);

// Search the registered description and input documentation, not just its UI
// preview. Keep explicit bounds for unusually large third-party schemas.
export function capabilityText(schema) {
 const inputs=Object.entries(schema.parameters?.properties||{}).map(([name,p])=>`${name}: ${p.description||''}`);
 return [String(schema.description||'').slice(0,16000),inputs.join('\n').slice(0,16000)].join('\n');
}

export function relevantSummary(text,query,limit=650) {
 const clean=String(text||'').replace(/\s+/g,' ').trim();
 if(clean.length<=limit)return clean;
 const terms=new Set(words(query));
 const sentences=[...new Set((clean.match(/[^.!?\n]+[.!?]?/g)||[clean]).map(s=>s.trim()))];
 const scored=sentences.map((s,index)=>({s:s.trim(),index,score:[...new Set(words(s))].filter(w=>terms.has(w)).length}));
 const chosen=[scored[0]],seen=new Set([0]);let used=chosen[0].s.length;
 // Whole sentences preserve qualifications such as "not supported". Retain
 // the opening identity and the most relevant capability sentences after it.
 for(const row of scored.slice(1).sort((a,b)=>b.score-a.score||a.index-b.index)){
  if(!row.score||used+row.s.length+1>limit)continue;
  chosen.push(row);seen.add(row.index);used+=row.s.length+1;
 }
 if(chosen.length===1&&used<limit){for(const row of scored.slice(1)){if(seen.has(row.index)||used+row.s.length+1>limit)continue;chosen.push(row);used+=row.s.length+1;}}
 return chosen.sort((a,b)=>a.index-b.index).map(r=>r.s).join(' ').slice(0,limit);
}

// This page goes only to the auxiliary selector, never the parent conversation.
// Automatic suggestion settings intentionally do not shrink explicit discovery.
export const findOptions=Object.freeze({topK:10,includeAvailable:true,includeSkills:true,minScore:0});
export function candidatePage(ranked,definitions,query,maxChars=10000) {
 const candidates=[];let used=2;
 for(const row of ranked){
  const schema=definitions.get(row.name),p=schema?.parameters;
  const item={kind:row.kind,name:row.name,summary:relevantSummary(row.kind==='tool'?schema?.description||row.searchText||row.summary:row.summary,query)};
  if(row.kind==='tool'&&p){
   // Prefer query-relevant input names, but never claim an unregistered input.
   const terms=new Set(words(query));
   item.inputs=Object.entries(p.properties||{}).map(([name,prop],index)=>({name,index,score:words(name+' '+(prop.description||'')).filter(w=>terms.has(w)).length})).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,24).map(p=>p.name);
   item.required=p.required||[];
   if(Array.isArray(p.properties?.action?.enum))item.actions=p.properties.action.enum;
  }
  const size=JSON.stringify(item).length+1;
  if(used+size>maxChars)continue;
  used+=size;candidates.push(item);
 }
 return candidates;
}
