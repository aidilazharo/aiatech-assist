 'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const bench=require('../src/agent-image-test');
const root=path.resolve(__dirname,'..');
test('ten unique web-hex reference images have reproducible prompts and valid SVGs',()=>{
 assert.equal(bench.REFERENCE_CASES.length,10);
 assert.equal(new Set(bench.REFERENCE_CASES.map(x=>x.id)).size,10);
 for(const x of bench.REFERENCE_CASES){
  assert.match(x.color,/^#[0-9a-f]{6}$/);
  assert.match(x.background,/^(none|#[0-9a-f]{6})$/);
  assert.match(bench.svgFromSpec(x),/<svg /);
  assert.match(bench.referencePrompt(x),new RegExp(x.color,'i'));
  const match=bench.compareReference(x,x.id);
  assert.equal(match.score,100,x.id);assert.equal(match.shapeOverlap,100,x.id);assert.equal(match.pixelMatch,100,x.id);
 }
});
test('geometry, foreground color, and background mismatches reduce reference accuracy',()=>{
 const ref=bench.referenceCase('blue-circle');
 assert.ok(bench.compareReference({...ref,shape:'square'},ref.id).score<100);
 const wrongColor=bench.compareReference({...ref,color:'#ff0000'},ref.id);
 assert.equal(wrongColor.foregroundMatch,false);assert.ok(wrongColor.score<=75);
 const wrongBg=bench.compareReference({...ref,background:'#ffffff'},ref.id);
 assert.equal(wrongBg.backgroundMatch,false);assert.ok(wrongBg.score<=85);
 assert.throws(()=>bench.compareReference({...ref,color:'<script>'},ref.id),/sanitized|Invalid/);
 assert.throws(()=>bench.compareReference(ref,'not-a-template'),/Unknown reference/);
});
test('image results persist model-specific automated comparison without claiming human pass',()=>{
 const ref=bench.referenceCase('blue-circle');
 const rec=bench.makeRecord({prompt:bench.referencePrompt(ref),referenceId:ref.id,agentPath:'ai-harness/agents/git-agent.json',model:'Model X',target:{kind:'vscode',vendor:'vscode'},spec:ref,startedAt:new Date().toISOString(),durationMs:42});
 assert.equal(rec.accuracy.score,100);assert.match(rec.referenceSvg,/<svg/);
 assert.equal(rec.verdict,'pending');assert.equal(bench.traceChecks(rec)[0].status,'not-tested');
});
test('Library Studio supplies reference selector and overlay without executing generated code',()=>{
 const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
 const ui=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
 assert.match(html,/id="libraryImageDifficulty"/);assert.match(html,/id="libraryImageReferencePreview"/);
 assert.match(ui,/libraryImageChallenge/);assert.match(ui,/library-image-reference-overlay/);
 assert.match(ui,/seed:ref.seed/);assert.doesNotMatch(html,/id="libraryRunHarnessChecks"/);
});
