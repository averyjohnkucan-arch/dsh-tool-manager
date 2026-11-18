import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';

export const defaults=()=>({version:3,tools:{}});
export function validate(value){
 if(!value||value.version!==3||!value.tools||Array.isArray(value.tools)||typeof value.tools!=='object'||Object.keys(value.tools).length>10000)throw Error('Invalid Tool Manager settings.');
 for(const[name,mode]of Object.entries(value.tools))if(!name||name.length>256||!['loaded','hidden'].includes(mode))throw Error('Every tool must be Loaded or Hidden.');
 return structuredClone(value);
}
function migrate(value){
 if(value?.version===3)return validate(value);
 const tools={};
 for(const[name,entry]of Object.entries(value?.tools||{})){
  const mode=typeof entry==='string'?entry:entry?.mode;
  if(mode==='basic'||mode==='loaded')tools[name]='loaded';
  if(mode==='discover'||mode==='disabled'||mode==='hidden')tools[name]='hidden';
 }
 return validate({version:3,tools});
}
export class Settings{
 constructor(root){this.root=root||join(process.env.DSH_HOME||join(homedir(),'.dsh'),'dsh-tool-manager');this.value=defaults();this.queue=Promise.resolve();}
 async init(){await mkdir(this.root,{recursive:true,mode:0o700});try{this.value=migrate(JSON.parse(await readFile(join(this.root,'settings.json'),'utf8')));}catch(error){if(error.code!=='ENOENT')throw error;}}
 async save(value){const checked=validate(value);this.queue=this.queue.catch(()=>{}).then(async()=>{const temp=join(this.root,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(checked,null,2),{mode:0o600});await rename(temp,join(this.root,'settings.json'));this.value=checked;});await this.queue;return checked;}
}
