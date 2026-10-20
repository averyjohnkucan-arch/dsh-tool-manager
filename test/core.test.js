import test from 'node:test';import assert from 'node:assert/strict';import {empty,fold,select,close,KEY} from '../lib/state.js';import {search} from '../lib/search.js';import {validate,defaults,Settings} from '../lib/settings.js';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const receipt=s=>({type:'tool/result',data:{message:{isError:false},meta:{toolManager:{owner:KEY,state:s}}}});
test('search does not activate tools, exact capabilities rank, empty queries stay empty',()=>{const rows=[{name:'browser_click',group:'Browser',owner:'browser',summary:'Click a button on a web page'},{name:'cad_render',group:'Engineering',owner:'cad',summary:'Render a CAD mesh'}];assert.equal(search(rows,'click browser button')[0].name,'browser_click');assert.deepEqual(search(rows,'the and'),[]);assert.deepEqual(search(rows,'unrelated'),[]);assert.equal(rows.length,2);});
test('select -> close -> failed compaction keeps tools; successful compaction removes only queued',()=>{let s=select(empty(),['browser_click','cad_render']);s=close(s,['browser_click']);assert.deepEqual(s.selected,['browser_click','cad_render']);s=fold(s,{type:'compaction/end',seq:8,data:{error:'failed'}});assert.equal(s.selected.length,2);s=fold(s,{type:'compaction/end',seq:10,data:{compactionId:'ok'}});assert.deepEqual(s.selected,['cad_render']);assert.deepEqual(s.pending,[]);assert.equal(fold(s,{type:'compaction/end',seq:10,data:{}}),s);});
test('reselect cancels closure, log replay restores full state, errors cannot change it',()=>{const original=close(select(empty(),['a','b'],['browser-skill']),['a']);const restored=fold(empty(),receipt(original));assert.deepEqual(restored,original);const reopened=select(restored,['a']);assert.deepEqual(reopened.pending,[]);const err=receipt(select(empty(),['wrong']));err.data.message.isError=true;assert.equal(fold(restored,err),restored);const nested={type:'tool/ptc-dispatch',data:{name:'tool_select',isError:false,meta:receipt(reopened).data.meta}};assert.deepEqual(fold(empty(),nested),reopened);});
test('selection validates limits atomically',()=>{assert.throws(()=>select(empty(),Array.from({length:8},(_,i)=>'t'+i)));assert.throws(()=>select(empty(),['a','a']));assert.throws(()=>close(empty(),['a']));assert.deepEqual(select(empty(),['a','b'],[],2).selected,['a','b']);});
test('settings survive atomic save, bounds reject corrupt policy',async t=>{const dir=await mkdtemp(join(tmpdir(),'tool-manager-'));t.after(()=>rm(dir,{recursive:true,force:true}));const s=new Settings(dir);await s.init();const v=defaults();v.tools.browser_click={mode:'discover',owner:'browser',summary:'Click',group:'Browser',skills:['browser']};await s.save(v);const other=new Settings(dir);await other.init();assert.deepEqual(other.value,v);assert.throws(()=>validate({...v,maxSelect:8}));assert.throws(()=>validate({...v,tools:{x:{...v.tools.browser_click,skills:['x'.repeat(300)]}}}));});
test('use-once retires only committed successful calls, preserving persistent tools and failed retries',()=>{
 let s=select(empty(),['once','keep'],[],7,['once']);
 const result=(name,isError=false)=>({type:'tool/result',seq:3,data:{message:{source:{name},isError,content:[{type:'text',text:'original task output'}]}}});
 assert.equal(fold(s,result('once',true)),s);assert.equal(fold(s,result('keep')),s);
 const replacement={...result('once'),surfaceOp:{op:'replace'}};assert.equal(fold(s,replacement),s);
 const event=result('once'),before=structuredClone(event);s=fold(s,event);assert.deepEqual(event,before);assert.deepEqual(s.selected,['keep']);assert.deepEqual(s.oneShot,[]);
 s=select(s,['once'],[],7,['once']);s=fold(s,{type:'tool/ptc-dispatch',data:{name:'once',isError:false}});assert.deepEqual(s.selected,['keep']);
});
test('use-once reselect changes lifetime and successful compaction removes pending lifetime metadata',()=>{
 const once=select(empty(),['a'],[],7,['a']);assert.deepEqual(select(once,['a']).oneShot,[]);
 const queued=close(once,['a']);assert.deepEqual(select(queued,['a'],[],7,['a']).pending,[]);
 const compacted=fold(queued,{type:'compaction/end',seq:9,data:{}});assert.deepEqual(compacted.oneShot,[]);
 assert.throws(()=>select(empty(),['a'],[],7,['b']));
 const cfg=defaults();cfg.tools.a={mode:'discover',owner:'',group:'',summary:'',skills:[],lifetime:'once'};assert.equal(validate(cfg).tools.a.lifetime,'once');assert.throws(()=>validate({...cfg,tools:{a:{...cfg.tools.a,lifetime:'invalid'}}}));
});
test('switching to model-initiated discovery dismisses an old automatic browser without dropping selected tools',()=>{
 const original={...select(empty(),['keep']),browser:{open:true,added:[],resolutionSeq:-1,status:''}};
 const dismissed=fold(original,{type:'user/message',seq:20,data:{source:{kind:KEY,dismissBrowser:true}}});assert.equal(dismissed.browser.open,false);assert.equal(dismissed.browser.resolutionSeq,20);assert.deepEqual(dismissed.selected,['keep']);
 const opened=fold(dismissed,{type:'tool/result',seq:21,data:{message:{},meta:{toolManager:{owner:KEY,browser:{action:'open'}}}}});assert.equal(opened.browser.manual,true);
});
