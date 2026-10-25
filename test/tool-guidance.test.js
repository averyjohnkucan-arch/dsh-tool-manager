import test from 'node:test';import assert from 'node:assert/strict';
import {guideTool,toolInputs} from '../lib/tool-guidance.js';
test('Bash guidance keeps native validation and requires both fields',()=>{
 const schema={name:'bash',description:'Run a command',parameters:{type:'object',required:['description','command'],properties:{description:{type:'string',description:'Label'},command:{type:'string',description:'Script'}}}};
 const before=structuredClone(schema),guided=guideTool(schema);assert.deepEqual(schema,before);assert.match(guided.description,/BOTH description and command/);assert.match(guided.parameters.properties.command.description,/command \(required\)/);assert.match(guided.parameters.properties.description.description,/description \(required\)/);assert.deepEqual(guided.parameters.required,schema.parameters.required);
 const other={...schema,name:'other_tool'};assert.equal(guideTool(other),other);
});
test('ready receipt offers menus only when the registered schema supports them',()=>{
 assert.deepEqual(toolInputs({name:'video',parameters:{properties:{action:{enum:['menu','generate']}},required:['action']}}).menuCall,{name:'video',arguments:{action:'menu'}});
 assert.equal(toolInputs({name:'no_menu',parameters:{properties:{action:{enum:['generate']}}}}).menuCall,undefined);
 assert.equal(toolInputs({name:'needs_file',parameters:{properties:{action:{enum:['menu']}},required:['file']}}).menuCall,undefined);
});
