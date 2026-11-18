import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {provenance,rows} from '../lib/catalog.js';
import {defaults} from '../lib/settings.js';

test('DSH, browser, Harness, and control tools stay loaded while third-party tools default hidden',()=>{
 const owners=new Map([['future_stock_tool',new Set(['@deepseek-ai/dsh-tool-future'])]]);
 const names=['read','browser_click','harness_status','future_stock_tool','browse_tools','third_party_tool'];
 const result=rows(names.map(name=>({name,description:name})),defaults(),owners,new Set(names));
 for(const name of names.slice(0,-1)){const tool=result.find(row=>row.name===name);assert.equal(tool.mode,'loaded',name);assert.equal(tool.stock,true,name);}
 const third=result.at(-1);assert.equal(third.mode,'hidden');assert.equal(third.filterable,true);
 const configured={version:3,tools:{third_party_tool:'loaded'}};assert.equal(rows([{name:'third_party_tool'}],configured,new Map(),new Set(['third_party_tool']))[0].mode,'loaded');
});

test('official tool provenance is discovered recursively',async t=>{
 const root=await mkdtemp(join(tmpdir(),'simple-tool-owner-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const directory=join(root,'node_modules','@deepseek-ai','dsh-tool-fixture','lib','nested');await mkdir(directory,{recursive:true});
 await writeFile(join(root,'node_modules','@deepseek-ai','dsh-tool-fixture','package.json'),JSON.stringify({name:'@deepseek-ai/dsh-tool-fixture'}));
 await writeFile(join(directory,'tools.js'),'ctx.tools.register(defineTool({\n name: "fixture_tool", description: "fixture"\n}));');
 const owners=await provenance([root]);assert.deepEqual([...owners.get('fixture_tool')],['@deepseek-ai/dsh-tool-fixture']);
});
