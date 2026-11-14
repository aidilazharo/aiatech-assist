'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const benchmark=require('../src/agent-image-test');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/library-studio.css'),'utf8');

test('Random geometry challenge has deterministic seed, positions, exact hex and 15-degree rotations',()=>{
 for(const difficulty of ['easy','medium','hard']){
  const first=benchmark.makeRandomChallenge('geometryseed0001',difficulty);
  const again=benchmark.makeRandomChallenge('geometryseed0001',difficulty);
  assert.deepEqual(first,again);
  assert.equal(first.spec.shapes.length,{easy:1,medium:2,hard:3}[difficulty]);
  assert.equal(benchmark.compareChallenge(first.spec,first).score,100);
  assert.match(first.prompt,/clockwise rotation \d+ degrees/);
  assert.match(first.svg,/<svg/);
  for(const shape of first.spec.shapes){
   assert.match(shape.fill,/^#[0-9a-f]{6}$/);
   assert.equal(shape.rotationDeg%15,0);
   assert.ok(shape.x>=0&&shape.y>=0);
  }
 }
});
test('Wrong rotation, shape, color and count lower the reproducible score',()=>{
 const challenge=benchmark.makeRandomChallenge('geometryseed0022','hard');
 const cloned=()=>JSON.parse(JSON.stringify(challenge.spec));
 let wrong=cloned();wrong.shapes[0].rotationDeg=(wrong.shapes[0].rotationDeg+15)%360;
 assert.ok(benchmark.compareChallenge(wrong,challenge).score<100);
 wrong=cloned();wrong.shapes[0].shape=wrong.shapes[0].shape==='circle'?'triangle':'circle';
 assert.ok(benchmark.compareChallenge(wrong,challenge).score<100);
 wrong=cloned();wrong.shapes[0].fill=wrong.shapes[0].fill==='#abcdef'?'#123456':'#abcdef';
 assert.ok(benchmark.compareChallenge(wrong,challenge).score<100);
 wrong=cloned();wrong.shapes.pop();
 assert.ok(benchmark.compareChallenge(wrong,challenge).score<100);
 assert.throws(()=>benchmark.makeRandomChallenge('../unsafe','easy'),/seed/);
 assert.throws(()=>benchmark.parseSpec('{"shapes":[{"shape":"script","fill":"#000000"}]}'),/shape/);
});
test('Seeded benchmark result saves model identity, prompt, geometry, score and exact replay source',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-geometry-'));
 try{
  const reference=benchmark.makeRandomChallenge('geometryseed0009','medium');
  const run=benchmark.makeRecord({prompt:reference.prompt,agentPath:'ai-harness/agents/software-developer.json',model:'Model Y',target:{kind:'vscode',vendor:'copilot'},spec:reference.spec,challenge:reference,startedAt:'2026-11-14T00:00:00.000Z',durationMs:12});
  assert.equal(run.accuracy.score,100);assert.equal(run.verdict,'pending');
  assert.equal(run.challenge.seed,reference.seed);
  assert.equal(run.referenceSvg,reference.svg);
  await benchmark.record(dir,run);
  const replay=await benchmark.replay(dir,run.id,run.agentPath);
  assert.equal(replay.identical,true);
  assert.equal(replay.svg,run.svg);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Library Studio renders random-only challenge and mutually exclusive relationship/editor panes',()=>{
 assert.match(html,/id="libraryImageDifficulty"/);
 assert.match(html,/id="libraryImageSeed"/);
 assert.match(html,/id="libraryImageNewChallenge"/);
 assert.doesNotMatch(html,/id="libraryImageCase"/);
 assert.match(ui,/libraryImageChallenge/);
 assert.match(ui,/function setRelationOpen\(open\)/);
 assert.match(ui,/\$\('libraryEditorWorkspace'\)\.classList\.toggle\('hidden',open\)/);
 assert.match(html,/id="libraryEditorWorkspace"/);
 assert.match(css,/\.library-code-source-frame #libraryImageCode\{[^}]*white-space:pre-wrap/s);
 assert.match(css,/overflow-wrap:anywhere/);
});
