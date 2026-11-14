'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/library-studio.css'),'utf8');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');

test('overall agent benchmark score is on the resource title row, right-aligned',()=>{
 assert.match(html,/class="section-title library-resource-title-row"/);
 assert.match(html,/id="libraryResourceTitle"[\s\S]*id="libraryOverallScore"/);
 assert.match(css,/\.library-resource-title-row\{align-items:center;flex-wrap:nowrap\}/);
 assert.match(ui,/function showOverallScore\(result\)/);
});
test('unsupported or incomplete visual grading cannot silently become an overall percentage',()=>{
 assert.match(ui,/const visualValid=\(vision\?\.status==='pass'\|\|vision\?\.status==='fail'\)/);
 assert.match(ui,/value\.textContent=overall\.status==='complete'\?/);
 assert.match(ui,/value\.setAttribute\('data-status',overall\.status\)/);
 assert.match(ui,/Visible-shape color/);
 assert.match(ui,/False premise/);
 assert.doesNotMatch(ui,/library-vision-score/);
});
test('model-level visual score still follows two independent groundedness checks',()=>{
 const bench=require('../src/agent-image-test');
 const challenge=bench.makeRandomChallenge('score-position-regression','medium');
 const qs=bench.visualQuestions(challenge);
 const partial=bench.gradeVisualAnswer(JSON.stringify({existingColor:'#990099',missingColor:'none'}),qs);
 assert.equal(partial.falsePremiseRejected,true);
 if(qs.expected.existingColor!=='#990099'){
  assert.equal(partial.score,50);
  assert.equal(partial.groundedAnswer,false);
 }
});
