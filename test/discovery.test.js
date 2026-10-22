import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverSkills,choiceStatus} from '../lib/discovery.js';
import {compactSkillCatalog,compactSkillDecision,compactSkillHistory} from '../lib/context-window.js';
import {Context} from '@deepseek-ai/cordis';
import SessionStore from '@deepseek-ai/dsh-session';
import {rows} from '../lib/catalog.js';
import {defaults} from '../lib/settings.js';

test('explicit discovery includes slow skills and rejects incomplete observations',async()=>{
 const skills=[{name:'local-guide',invocation:{modelInvocable:true}},{name:'user-only',invocation:{modelInvocable:false}}];
 const started=performance.now();
 assert.equal((await discoverSkills({snapshot:async()=>{await new Promise(r=>setTimeout(r,1100));return{skills,complete:true};}})).length,1);
 assert.ok(performance.now()-started>=1000);
 await assert.rejects(discoverSkills({snapshot:async()=>({skills,complete:false})}),/incomplete/);
 const c=new AbortController();c.abort();await assert.rejects(discoverSkills({list:async()=>skills},{signal:c.signal}),/abort/i);
 assert.equal(choiceStatus(['skill','office_tools'],['excel-guide']),'Model chose office_tools, excel-guide');
});

test('11,000 catalog entries remain searchable metadata without entering model text',()=>{
 const entries=Array.from({length:11000},(_,i)=>({name:`guide-${i}`,description:'A long description '.repeat(25)}));
 const message={role:'user',id:'catalog',source:{kind:'skill-catalog',form:'catalog',entries},content:[{type:'text',text:JSON.stringify(entries)}]};
 const bounded=compactSkillCatalog(message);
 assert.ok(bounded.content[0].text.length<600);
 assert.equal(bounded.source,message.source,'preserve stock catalog identity');
 assert.equal(bounded.id,message.id);
 assert.equal(compactSkillCatalog(bounded),bounded,'no repeated replacements');
 const body={role:'user',source:{kind:'skill',form:'instructions'},content:[{type:'text',text:'Full selected instructions'}]};
 assert.equal(compactSkillCatalog(body),body);
 const decision={kind:'enter',messages:[body,message],startsRequestSeries:true};
 assert.equal(compactSkillDecision(decision).messages[0],body);
 assert.equal(compactSkillDecision(decision).startsRequestSeries,true);
 assert.equal(compactSkillDecision({kind:'reject',messages:[message]}).messages[0],message);
});

test('existing catalog history is bounded once through public surface replacement; audit and skill bodies survive',async t=>{
 const ctx=new Context();new SessionStore(ctx);t.after(()=>ctx.fiber.dispose());const s=ctx.sessions.create('catalog-window');
 const catalog=s.append('user/message',{role:'user',id:'catalog',source:{kind:'skill-catalog',entries:[{name:'a',description:'catalog only'}]},content:[{type:'text',text:'OLD FULL CATALOG'}]},{surfaceOp:'append'});
 const selected=s.append('user/message',{role:'user',id:'body',source:{kind:'skill',form:'instructions'},content:[{type:'text',text:'Keep the complete selected skill body'}]},{surfaceOp:'append'});
 compactSkillHistory(s);const seqs=[...s.surface.nodes];compactSkillHistory(s);
 assert.deepEqual(s.surface.nodes,seqs);
 assert.equal(s.eventAt(catalog.seq).data.content[0].text,'OLD FULL CATALOG');
 assert.ok(s.surface.nodes.includes(selected.seq));
 assert.ok(!JSON.stringify(s.deriveMessages()).includes('OLD FULL CATALOG'));
});

test('essentials preset exposes 15 Linux tools including search, while overrides and discovery remain authoritative',()=>{
 const names=['bash','read','write','edit','glob','grep','read_image','working_directory','ask_user_question','web_search','web_fetch','knowledge_search','knowledge_read_document','skill','browse_tools','mcp__rea__analyze_function','office_tools'];
 const config=defaults(),catalog=rows(names.map(name=>({name})),config,new Map(),new Set(names));
 assert.equal(catalog.filter(t=>t.mode==='basic').length,15);
 assert.deepEqual(catalog.filter(t=>t.mode==='discover').map(t=>t.name),['mcp__rea__analyze_function','office_tools']);
 config.tools.bash={mode:'disabled'};assert.equal(rows([{name:'bash'}],config,new Map(),new Set())[0].mode,'disabled');
});
