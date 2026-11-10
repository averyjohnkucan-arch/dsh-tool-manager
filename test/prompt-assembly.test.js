import test from 'node:test';
import assert from 'node:assert/strict';
import {Context} from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import {guideAssembly} from '../lib/tool-guidance.js';

test('current DSH assembles a prompt before publishing its tool catalog', async () => {
 const ctx = new Context();
 try {
  await ctx.plugin(SystemPrompt, {});
  ctx.systemPrompt.section({name:'fixture', order:0, text:'Fixture instructions.'});
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => guideAssembly(await next()));
  const assembly = await ctx.systemPrompt.assemble();
  assert.ok(assembly.sections.some(section => section.text === 'Fixture instructions.'));
  assert.deepEqual(assembly.tools, []);
 } finally { await ctx.fiber.dispose(); }
});

test('legacy assemblies keep tool guidance and absent tools are not invented', () => {
 const current = {sections:[], contexts:[], variables:{}};
 assert.equal(guideAssembly(current), current);
 const tool = {name:'bash', description:'Run commands', parameters:{properties:{description:{},command:{}},required:['description','command']}};
 const legacy = {...current, tools:[tool]};
 const guided = guideAssembly(legacy);
 assert.match(guided.tools[0].description, /both required fields/);
 assert.equal(legacy.tools[0], tool);
 assert.equal(tool.description, 'Run commands');
});
