import test from 'node:test';
import assert from 'node:assert/strict';
import {folderEntries,expandNames,windowReminder} from '../lib/folders.js';
import {empty,select} from '../lib/state.js';

const row=(name,group='Browser',mode='discover')=>({name,group,mode,summary:'Use a browser page',filterable:true});
test('browser folder expands permitted on-demand members, excludes disabled and pinned tools, deduplicates names',()=>{
 const catalog=[row('browser_open'),row('browser_act'),row('browser_disabled','Browser','disabled'),row('web_fetch','Web','basic')];
 assert.deepEqual(folderEntries(catalog).map(f=>f.name),['browser']);
 assert.deepEqual(expandNames(['browser','browser_act'],catalog).names,['browser_act','browser_open']);
 assert.throws(()=>expandNames(['invented'],catalog),/unavailable/);
 assert.deepEqual(expandNames(['browser'],catalog,{selected:['browser_act']}).names,['browser_act']);
 assert.match(windowReminder(catalog,select(empty(),['browser_act','browser_open'])),/Open tool folders: \["browser"\]/);
});
test('generic folders do not shadow actual callables, allow larger bundles, and omit unattributed unrelated tools',()=>{
 const catalog=[...Array.from({length:12},(_,i)=>row('office_'+i,'Office')),row('office','Other'),row('unknown','Unattributed')];
 const folder=folderEntries(catalog)[0];assert.equal(folder.name,'folder:Office');
 assert.equal(expandNames(['folder:Office'],catalog).names.length,12);
 assert.deepEqual(expandNames(['office'],catalog).names,['office']);
 assert.throws(()=>expandNames(['office','office'],catalog),/unique/);
});
