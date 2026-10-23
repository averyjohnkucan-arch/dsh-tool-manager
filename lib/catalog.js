import {CONTROL} from './state.js';
import {defaultMode,STOCK_TOOLS} from './policy.js';
import {readdir,readFile,stat,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {brief} from './search.js';

// Read installed package files only. No registry internals, package execution,
// monkey-patching, or claims that source matching proves runtime ownership.
export async function provenance(roots){
 const matches=new Map(),packages=new Set(),scanned=new Set(),moduleRoots=new Set();
 for(const root of roots){let path=resolve(root);for(let i=0;i<10;i++){if(path.endsWith('node_modules'))moduleRoots.add(path);try{if((await stat(join(path,'node_modules'))).isDirectory())moduleRoots.add(join(path,'node_modules'));}catch{}const parent=dirname(path);if(parent===path)break;path=parent;}}
 for(const root of moduleRoots){
  let entries;try{entries=await readdir(root);}catch{continue;}
  for(const name of entries){if(name.startsWith('.'))continue;if(name.startsWith('@')){try{for(const sub of await readdir(join(root,name)))packages.add(join(root,name,sub));}catch{}}else packages.add(join(root,name));}
  // pnpm places built-in DSH providers in sibling virtual-store packages,
  // rather than the profile node_modules where third-party plugins reside.
  try{for(const name of await readdir(join(root,'.pnpm'))){if(!name.startsWith('@deepseek-ai+'))continue;const scoped=join(root,'.pnpm',name,'node_modules','@deepseek-ai');try{for(const sub of await readdir(scoped))packages.add(join(scoped,sub));}catch{}}}catch{}
 }
 for(const dir of packages){try{
  const canonical=await realpath(dir);if(scanned.has(canonical))continue;scanned.add(canonical);
  const p=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));if(!p.name)continue;
  for(const file of ['index.js','lib/index.js','lib/tool-knowledge/index.js']){
   const path=join(dir,file);let src;try{if((await stat(path)).size>3*1024*1024)continue;src=await readFile(path,'utf8');}catch{continue;}
   // Match the actual defineTool declaration, not unrelated name properties
   // such as parameter names, prompt-section names, or embedded fixture data.
   for(const m of src.matchAll(/\bdefineTool\s*\(\s*\{\s*name\s*:\s*["']([a-zA-Z][\w-]{1,100})["']/g)){
    const set=matches.get(m[1])||new Set();set.add(p.name);matches.set(m[1],set);
   }
  }
 }catch{}}
 return matches;
}
export function rows(schemas,settings,owners,filterable){return schemas.filter(t=>t.name!=='run_code').map(t=>{
 const c=settings.tools[t.name],candidates=CONTROL.includes(t.name)?['dsh-tool-manager']:[...(owners.get(t.name)||[])].sort();
 const builtIn=candidates.length>1&&candidates.every(n=>n.startsWith('@deepseek-ai/'));
 const mcp=t.name.match(/^mcp__([^_]+(?:_[^_]+)*)__[^_]/);const mcpOwner=mcp?'MCP: '+mcp[1]:null;
 const inferred=candidates.length===1?candidates[0]:builtIn?'DSH built-in tools':mcpOwner||'Unattributed tools';
 return {name:t.name,searchText:brief(t.description),summary:c?.summary||brief(t.description)||t.name.replaceAll('_',' ')+' tool',
  owner:c?.owner||inferred,candidates,
  ownership:c?.owner?'user mapping':candidates.length===1?'package source match (inferred)':candidates.length>1?'multiple installed providers match; choose an owner override':mcpOwner?'MCP name prefix (inferred)':'provider not exposed by DSH; no package match',
  group:c?.group||(candidates.length===1?candidates[0].replace('@deepseek-ai/dsh-tool-',''):builtIn?'Built-in providers':mcpOwner?'MCP/'+mcp[1]:'Unattributed'),
  lifetime:c?.lifetime||'persistent',order:c?.order||0,mode:CONTROL.includes(t.name)?'basic':c?.mode||defaultMode(t.name,settings),stock:STOCK_TOOLS.has(t.name),skills:c?.skills||[],filterable:filterable.has(t.name)};
 }).sort((a,b)=>a.group.localeCompare(b.group)||a.order-b.order||a.name.localeCompare(b.name));}
