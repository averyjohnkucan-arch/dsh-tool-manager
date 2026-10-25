import test from 'node:test';
import assert from 'node:assert/strict';
import {candidatePage,findOptions,relevantSummary} from '../lib/candidates.js';
import {rows} from '../lib/catalog.js';
import {findCandidates} from '../lib/retrieval.js';
import {defaults} from '../lib/settings.js';
import {empty} from '../lib/state.js';
const schema=(name,description,inputs={})=>({name,description,parameters:{type:'object',properties:{action:{type:'string',enum:['menu','generate','status']},...inputs}}});
const schemas=[
 schema('generate_video','Generate Video with MiniMax H3: a separate local text-to-video pipeline for full-motion scenes, complex movement and native audio. '+ 'Use this pipeline for detailed motion and physical interactions. '.repeat(8)+'Accepts optional uploaded first and/or last frame images. These anchor the endpoints; motion between them is generated, not frame-exact control.',{first_frame_path:{type:'string',description:'First frame image for image to video animation'},last_frame_path:{type:'string',description:'Last frame image for endpoint control'}}),
 schema('generate_video_clip','Generate a simple video from a text prompt using local LTX. Text-to-video only; image inputs are unsupported.',{prompt:{type:'string'}}),
 schema('render_video_solar','Render a video using a structure video and optional first frame. Does not generate motion between two still frames.',{structure_video_path:{type:'string'}}),
 schema('create_image','Create an image locally from a prompt. Image generation and editing.'),
 schema('create_image_art','Create art locally from an image and prompt. Animate-style image artwork.'),
 schema('image_upscale','Improve image detail from an image.'),
 schema('image_inspect','Read an image from the drive.')
];
const definitions=new Map(schemas.map(s=>[s.name,s]));
const catalog=rows(schemas,defaults(),new Map(),new Set(schemas.map(s=>s.name)));
const skills=Array.from({length:100},(_,i)=>({name:'remote-video-'+i,description:'Create video locally from image and prompt, image to video, animate image, video from image, first and last frame animation using a third-party API.',provider:'library'}));
test('image-to-video searches retain H3 inputs and late capability details despite skill noise',()=>{
 for(const query of ['create video locally from image and prompt create_video image to video video from image animate image','animate video between first and last frame images','generate video from image with motion']){
  const ranked=findCandidates(catalog,skills,query,empty(),findOptions),page=candidatePage(ranked,definitions,query);
  const h3=page.find(c=>c.name==='generate_video');assert.ok(h3,query);assert.match(h3.summary,/first and\/or last frame images/);assert.ok(h3.inputs.includes('first_frame_path'));assert.ok(h3.inputs.includes('last_frame_path'));
  assert.ok(page.some(c=>c.name==='generate_video_clip'));assert.ok(page.length<=10);assert.ok(JSON.stringify(page).length<=10000);
 }
});
test('full description and documented input names remain searchable after the short UI preview',()=>{
 const only=rows([schema('specialized','Introduction. '.repeat(40)+'Endpoint animation is supported.',{rare_capability:{type:'string',description:'Ultrasonic transducer calibration'}})],defaults(),new Map(),new Set(['specialized']));
 assert.equal(findCandidates(only,[],'ultrasonic transducer calibration',empty(),findOptions)[0]?.name,'specialized');assert.equal(findCandidates(only,[],'endpoint animation',empty(),findOptions)[0]?.name,'specialized');
});
test('tool ranking is independent of skill-library size and disabled tools stay excluded',()=>{
 const query='create video locally from image and prompt';
 const order=n=>findCandidates(catalog,skills.slice(0,n),query,empty(),findOptions).filter(c=>c.kind==='tool').map(c=>c.name);
 assert.deepEqual(order(1),order(100));
 assert.ok(!findCandidates(catalog.map(c=>({...c,mode:'disabled'})),skills,query,empty(),findOptions).some(c=>c.kind==='tool'));
});
test('snippets preserve negative capability qualifications and enforce page budgets',()=>{
 const description='Local renderer. '+ 'Generic rendering information. '.repeat(40)+'Does not support image-to-video animation.';
 assert.match(relevantSummary(description,'image to video animation'),/Does not support image-to-video animation\./);
 assert.ok(JSON.stringify(candidatePage(findCandidates(catalog,skills,'video image',empty(),findOptions),definitions,'video image',800)).length<=800);
});
