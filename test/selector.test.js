import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseTools} from '../lib/selector.js';

const candidates=[
 {name:'office_write',description:'Write spreadsheet formulas',owner:'office'},
 {name:'office_read',description:'Read spreadsheet cells',owner:'office'},
];
function runtime({choice={names:['office_write']},efforts=[{id:'off'}],chunks}={}){
 const requests=[];
 return{requests,async prepareCall(config,_signal,configure){const controls=configure({}, {reasoning:{efforts}});return{config:{...config,...controls},async *stream(request){requests.push(request);yield*(chunks||[{type:'block-end',index:0,block:{type:'tool-call',name:'select_tools',arguments:JSON.stringify(choice)}},{type:'finish',reason:{kind:'tool-calls'}}]);}};}};
}

test('auxiliary selector requests reasoning off and can select from one to eight exact tools',async()=>{
 const llm=runtime();const result=await chooseTools(llm,{provider:'fixture',model:'model'},{query:'spreadsheet formulas',candidates,maxSelect:8});
 assert.deepEqual(result.names,['office_write']);assert.equal(result.mode,'reasoning off');assert.equal(llm.requests[0].reasoningEffort,'off');
 assert.deepEqual(llm.requests[0].tools[0].parameters.properties.names.items.enum,['office_write','office_read']);assert.equal(llm.requests[0].tools[0].parameters.properties.names.maxItems,8);
});

test('one match loads directly and invalid names never load',async()=>{
 const direct=await chooseTools(null,null,{query:'write',candidates:candidates.slice(0,1)});assert.deepEqual(direct.names,['office_write']);assert.equal(direct.mode,'single match');
 await assert.rejects(chooseTools(runtime({choice:{names:['invented']}}),{provider:'fixture',model:'model'},{query:'spreadsheet',candidates}),/invalid choice twice/);
});

test('reasoning output is rejected when the selector requested off',async()=>{
 const llm=runtime({chunks:[{type:'reasoning-delta',text:'thinking'}]});
 await assert.rejects(chooseTools(llm,{provider:'fixture',model:'model'},{query:'spreadsheet',candidates}),/emitted reasoning/);
});
