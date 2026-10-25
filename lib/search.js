const stop=new Set('a an the to of for and is it my please can you with what that this how me help we our on in at do does be need want using'.split(' '));
const singular=w=>w.length>4&&w.endsWith('ies')?w.slice(0,-3)+'y':w.length>3&&w.endsWith('s')&&!/(ss|us|is)$/.test(w)?w.slice(0,-1):w;
export const words=s=>(String(s).replace(/[_/.-]/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>!stop.has(w)).map(singular);
export const brief=s=>String(s||'').replace(/\s+/g,' ').slice(0,350);
export function rank(rows,query,limit=Infinity){
 const terms=[...new Set(words(query))];if(!terms.length)return[];
 const docs=rows.map(r=>({row:r,tokens:words(`${r.name} ${r.name} ${r.group} ${r.owner} ${r.summary} ${r.searchText||''}`)}));const avg=docs.reduce((n,d)=>n+d.tokens.length,0)/Math.max(1,docs.length);
 const frequencies=new Map(terms.map(t=>[t,docs.filter(d=>d.tokens.includes(t)).length]));
 return docs.map(({row,tokens})=>({row,score:terms.reduce((score,t)=>{const f=tokens.filter(w=>w===t).length;if(!f)return score;const df=frequencies.get(t);return score+Math.log(1+(docs.length-df+.5)/(df+.5))*f*2.2/(f+1.2*(.25+.75*tokens.length/Math.max(1,avg)));},0)})).filter(d=>d.score>0).sort((a,b)=>b.score-a.score||a.row.name.localeCompare(b.row.name)).slice(0,limit);
}

export function search(rows,query,limit=24){return rank(rows,query,limit).map(d=>d.row);}
