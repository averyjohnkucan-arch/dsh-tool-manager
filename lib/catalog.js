import {readdir,readFile,stat,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {CONTROL} from './state.js';
import {brief} from './search.js';

// Fallbacks cover host-created tools whose package source is not inspectable.
// Package provenance is the primary test, so future @deepseek-ai tools are loaded automatically.
const STOCK_NAMES=new Set([
 'bash','pwsh','working_directory','read','read_image','write','edit','apply_patch','glob','grep',
 'web_search','web_fetch','ask_user_question','todo_write','enter_plan_mode','exit_plan_mode',
 'create_goal','get_goal','update_goal','job_list','job_output','job_kill',
 'schedule_create','schedule_list','schedule_view','schedule_edit','schedule_update','schedule_delete',
 'skill','subagent','subagent_fork','list_subagent_models','list_agents','send_message','wait_agent','interrupt_agent','workflow',
 'present','office_render','office_convert','office_recalculate','plugin_manager',
]);

async function javascriptFiles(root,depth=0,output=[]){
 if(depth>4||output.length>6000)return output;
 let entries;
 try{entries=await readdir(root,{withFileTypes:true});}catch{return output;}
 for(const entry of entries){
  if(output.length>6000)break;
  const path=join(root,entry.name);
  if(entry.isDirectory()&&!entry.name.startsWith('.')&&entry.name!=='node_modules')await javascriptFiles(path,depth+1,output);
  else if(entry.isFile()&&entry.name.endsWith('.js'))output.push(path);
 }
 return output;
}

export async function provenance(roots){
 const moduleRoots=new Set();
 for(const root of roots){
  let path=resolve(root);
  for(let depth=0;depth<10;depth++){
   if(path.endsWith('node_modules'))moduleRoots.add(path);
   try{if((await stat(join(path,'node_modules'))).isDirectory())moduleRoots.add(join(path,'node_modules'));}catch{}
   const parent=dirname(path);if(parent===path)break;path=parent;
  }
 }
 const packageDirs=new Set();
 for(const root of moduleRoots){
  let entries;try{entries=await readdir(root);}catch{continue;}
  for(const name of entries){
   if(name.startsWith('.'))continue;
   if(name.startsWith('@')){try{for(const child of await readdir(join(root,name)))packageDirs.add(join(root,name,child));}catch{}}
   else packageDirs.add(join(root,name));
  }
  try{for(const name of await readdir(join(root,'.pnpm'))){if(!name.startsWith('@deepseek-ai+'))continue;const scope=join(root,'.pnpm',name,'node_modules','@deepseek-ai');try{for(const child of await readdir(scope))packageDirs.add(join(scope,child));}catch{}}}catch{}
 }
 const found=new Map();
 const scanned=new Set();
 for(const directory of packageDirs){
  try{
   const canonical=await realpath(directory);if(scanned.has(canonical))continue;scanned.add(canonical);
   const manifest=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
   if(!manifest.name)continue;
   for(const file of await javascriptFiles(directory)){
    let source;try{if((await stat(file)).size>3*1024*1024)continue;source=await readFile(file,'utf8');}catch{continue;}
    for(const match of source.matchAll(/\bdefineTool\s*\(\s*\{\s*name\s*:\s*["']([a-zA-Z][\w-]{1,100})["']/g)){
     const owners=found.get(match[1])||new Set();owners.add(manifest.name);found.set(match[1],owners);
    }
   }
  }catch{}
 }
 return found;
}

export function isStock(name,candidates=[]){
 return CONTROL.includes(name)||STOCK_NAMES.has(name)||name.startsWith('browser_')||name.startsWith('harness_')||candidates.some(owner=>owner.startsWith('@deepseek-ai/'));
}

export function rows(schemas,settings,owners,filterable){
 return schemas.filter(tool=>tool.name!=='run_code').map(tool=>{
  const candidates=[...(owners.get(tool.name)||[])].sort();
  const stock=isStock(tool.name,candidates);
  const canHide=filterable.has(tool.name)&&!stock;
  const mode=canHide?(settings.tools[tool.name]||'hidden'):'loaded';
  const owner=candidates.length===1?candidates[0]:candidates.length?'DSH built-in tools':tool.name.match(/^mcp__([^_]+(?:_[^_]+)*)__/)?.[1]||'Other tools';
  return{name:tool.name,description:brief(tool.description)||tool.name.replaceAll('_',' '),owner,stock,filterable:canHide,mode};
 });
}
