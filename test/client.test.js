import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('settings UI exposes only Loaded and Hidden and locks DSH tools',async()=>{
 const data={settings:{version:3,tools:{}},tools:[
  {name:'read',description:'Read files',owner:'@deepseek-ai/dsh-tool-fs',stock:true,filterable:false,mode:'loaded'},
  {name:'office_write',description:'Write cells',owner:'dsh-office-tools',stock:false,filterable:true,mode:'hidden'},
 ]};
 const states=[data,structuredClone(data.settings),'','','',false];let cursor=0,Page,exported;
 const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children}),useState:()=>{const index=cursor++;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useEffect:()=>{}};
 vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{AbortController,setTimeout,clearTimeout,window:{__ModuleLoader__:{load:module=>exported=module.factory(()=>React)}}});
 exported.apply({slots:{inject:(_slot,callback)=>callback(),register:(_definition,component)=>Page=component}});
 const tree=Page(),text=JSON.stringify(tree);assert.match(text,/DSH tools stay loaded/);assert.match(text,/Tool Selection/);assert.match(text,/office_write/);assert.match(text,/Loaded/);assert.match(text,/Hidden/);assert.doesNotMatch(text,/Baseline|Embedding|Disabled|Skills to load|Folder/);
 function find(node,label){if(!node||typeof node!=='object')return;if(node.props?.['aria-label']===label)return node;for(const child of node.children||[]){const found=Array.isArray(child)?child.map(item=>find(item,label)).find(Boolean):find(child,label);if(found)return found;}}
 assert.equal(find(tree,'Availability for read').props.disabled,true);assert.equal(find(tree,'Availability for office_write').props.disabled,false);
});
