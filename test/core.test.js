import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {defaults,validate,Settings} from '../lib/settings.js';
import {empty,fold,select,unselect,KEY} from '../lib/state.js';
import {search} from '../lib/search.js';

test('settings have only loaded and hidden states and save atomically',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'simple-tool-manager-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const settings=new Settings(directory);await settings.init();assert.deepEqual(settings.value,defaults());
 const value={version:3,tools:{office_write:'hidden',video_generate:'loaded'}};await settings.save(value);
 assert.deepEqual(JSON.parse(await readFile(join(directory,'settings.json'),'utf8')),value);
 assert.throws(()=>validate({version:3,tools:{x:'disabled'}}));
});

test('old settings migrate to the two-state format',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'simple-tool-migrate-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(join(directory,'settings.json'),JSON.stringify({version:2,tools:{a:{mode:'basic'},b:{mode:'discover'},c:{mode:'inherit'}}}));
 const settings=new Settings(directory);await settings.init();assert.deepEqual(settings.value,{version:3,tools:{a:'loaded',b:'hidden'}});
});

test('conversation selection is replayable and search is deterministic',()=>{
 let state=select(empty(),['office_write']);assert.deepEqual(state.selected,['office_write']);
 state=unselect(state,['office_write']);assert.deepEqual(state.selected,[]);
 const next=select(state,['video_generate']);
 const event={type:'tool/result',data:{message:{isError:false},meta:{toolManager:{owner:KEY,state:next}}}};
 assert.deepEqual(fold(empty(),event),next);
 event.data.message.isError=true;assert.deepEqual(fold(empty(),event),empty());
 const tools=[{name:'office_write',owner:'office',description:'Write spreadsheet cells'},{name:'video_generate',owner:'media',description:'Generate a video'}];
 assert.equal(search(tools,'spreadsheet editing')[0].name,'office_write');
});
