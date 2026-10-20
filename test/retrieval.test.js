import test from 'node:test';import assert from 'node:assert/strict';
import {retrievalDefaults,retrievalOptions,suggestions,retrievalMessage,userQuery} from '../lib/retrieval.js';
import {empty,fold,KEY} from '../lib/state.js';
const tool=(name,mode='discover',filterable=true)=>({name,mode,filterable,summary:'Inspect browser pages and click website buttons',group:'Browser',owner:'browser'});
test('automatic retrieval honors result, threshold, visibility and character budgets',()=>{
 const config={...retrievalDefaults(),enabled:true,topK:2,minScore:0,summaryChars:40,maxChars:700};
 const ranked=suggestions([tool('browser_a'),tool('browser_b'),tool('browser_c'),tool('disabled','disabled'),tool('basic','basic'),tool('scope_owned','discover',false)],[],'browser website',empty(),config);
 assert.equal(ranked.length,2);assert.ok(ranked.every(r=>r.name.startsWith('browser_')));
 const note=retrievalMessage(ranked,config,'a'.repeat(64));assert.ok(note.content[0].text.length<=700);assert.ok(note.source.count<=2);assert.equal(note.source.requireChoice,true);
 assert.equal(suggestions([tool('browser')],[],'browser',empty(),{...config,minScore:1}).length,0);
 assert.equal(suggestions([tool('browser')],[],'browser',{...empty(),selected:['browser']},config).length,0);
 const available=suggestions([tool('basic','basic')],[],'browser',empty(),{...config,includeAvailable:true});assert.equal(available[0].name,'basic');
 const skills=suggestions([],[{name:'browser-workflow',description:'Inspect browser pages',provider:'filesystem'}],'browser',empty(),{...config,includeSkills:true});assert.equal(skills[0].kind,'skill');
});
test('retrieval settings reject invalid tuning and ignore non-user context as a query',()=>{
 for(const value of [{topK:21},{minScore:-1},{maxChars:499},{summaryChars:501},{cooldownSeconds:-1},{enabled:'yes'},[]])assert.throws(()=>retrievalOptions(value));
 assert.equal(userQuery([{source:{kind:KEY},content:[{type:'text',text:'Injected tool metadata'}]},{source:{kind:'user'},content:[{type:'text',text:'real question'}]}]),'real question');
});
test('PTC browser decisions replay and replacement copies never reopen the browser',()=>{
 const event=(action,seq,names=[])=>({type:'tool/ptc-dispatch',seq,data:{name:'browse_tools',meta:{toolManager:{owner:KEY,browser:{action,names}}}}});
 let state=fold(empty(),event('open',1));state=fold(state,event('add',2,['browser_a']));state=fold(state,event('close',3));assert.equal(state.browser.open,false);assert.equal(state.browser.status,'1 tools selected');
 assert.equal(fold(state,{...event('open',4),surfaceOp:{op:'replace',startSeq:1,endSeq:1}}),state);
});
