import {canonicalName} from './candidates.js';
import {CONTROL} from './state.js';

// Folder names are discovery aliases, never executable proxy tools. Expansion
// uses the calling agent's permitted catalog, so it cannot restore hidden tools.
export function folderEntries(catalog) {
 const groups=new Map(),reserved=new Set(catalog.map(t=>canonicalName(t.name)));
 for(const tool of catalog){
  if(tool.mode!=='discover'||CONTROL.includes(tool.name))continue;
  const group=tool.group==='Unattributed'&&tool.name.startsWith('browser_')?'Browser':tool.group;
  if(!group||group==='Unattributed')continue;
  const list=groups.get(group)||[];list.push(tool);groups.set(group,list);
 }
 const folders=[],used=new Set(reserved);
 for(const [group,tools] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
  if(tools.length<2||tools.length>256)continue;
  const slug=group.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'_').replace(/^_|_$/g,'');
  if(!slug)continue;
  let name=slug;
  if(used.has(canonicalName(name)))name='folder:'+group;
  if(used.has(canonicalName(name)))continue;
  used.add(canonicalName(name));
  const members=tools.map(t=>t.name).sort();
  const summary=`Open the ${group} tool folder: ${members.length} tools (${members.join(', ')}). All member schemas become available together until closed or successful compaction.`;
  folders.push({name,group,owner:'dsh-tool-manager',mode:'discover',filterable:true,folder:true,members,summary,searchText:tools.map(t=>t.searchText||t.summary).join('\n').slice(0,16000)});
 }
 return folders;
}

export function expandNames(names,catalog,{limit=7,selected}={}) {
 if(!Array.isArray(names)||!names.length||names.length>limit||new Set(names).size!==names.length)throw Error(`Select 1–${limit} unique tool or folder names per call.`);
 const folders=folderEntries(catalog),opened=[],expanded=[];
 for(const name of names){
  const tool=catalog.find(t=>t.name===name&&t.mode!=='disabled'&&!CONTROL.includes(t.name));
  const folder=!tool&&folders.find(f=>f.name===name||canonicalName(f.group)===canonicalName(name));
  if(!tool&&!folder)throw Error(`Tool or folder is unavailable: ${name}`);
  if(folder)opened.push(folder.name);
  expanded.push(...(tool?[tool.name]:folder.members));
 }
 const tools=[...new Set(expanded)].filter(n=>!selected||selected.includes(n));
 if(!tools.length)throw Error('No currently selected tools match these names or folders.');
 if(tools.length>256)throw Error('A selection may contain at most 256 tools.');
 return {names:tools,folders:opened};
}

export function windowReminder(catalog,state) {
 const open=folderEntries(catalog).filter(f=>f.members.every(n=>state.selected.includes(n))).map(f=>f.name);
 return `Open tool folders: ${JSON.stringify(open)}. Selected tools: ${JSON.stringify(state.selected)}. They stay available across turns, close automatically after successful compaction, and can be closed now with browse_tools(action="close_tools", names=[tool or folder names]). Closing schemas does not close a website or terminate a provider's resources.`;
}
