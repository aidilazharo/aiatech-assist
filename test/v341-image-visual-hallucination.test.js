'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const bench=require('../src/agent-image-test');
const vision=require('../src/agent-vision-test');
function challenge(){return bench.makeRandomChallenge('mixed-seed-20261115','medium');}
test('seeded random challenge gives identical PNG and one true + one false-premise question',()=>{
 const ref=challenge(),same=challenge();
 assert.equal(ref.svg,same.svg);
 const png=bench.pngFromGeometry(ref.spec);
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
 assert.equal(png.toString('hex'),bench.pngFromGeometry(same.spec).toString('hex'));
 const q=bench.visualQuestions(ref);
 assert.equal(q.questions.length,2);assert.match(q.questions[1],/shape/);
 assert.equal(q.expected.missingColor,'none');
 assert.ok(ref.spec.shapes.some(x=>x.fill===q.expected.existingColor));
});
test('false premise is rejected; guessed non-existent color fails even if true answer correct',()=>{
 const q=bench.visualQuestions(challenge());
 assert.deepEqual({status:bench.gradeVisualAnswer(JSON.stringify(q.expected),q).status,score:bench.gradeVisualAnswer(JSON.stringify(q.expected),q).score},{status:'pass',score:100});
 const failure=bench.gradeVisualAnswer(JSON.stringify({...q.expected,missingColor:'#ff0000'}),q);
 assert.equal(failure.score,50);assert.equal(failure.falsePremiseRejected,false);
 assert.equal(bench.gradeVisualAnswer(JSON.stringify({existingColor:'#121212',missingColor:'none'}),q).score,50);
 assert.equal(bench.gradeVisualAnswer('not json',q).status,'fail');
});
test('vision test passes image bytes, not hidden shapes; unsupported provider never returns synthetic pass',async()=>{
 const ref=challenge(),q=bench.visualQuestions(ref),requests=[];
 class TextPart{constructor(value){this.value=value;}}
 const api={LanguageModelTextPart:TextPart,LanguageModelDataPart:{image:(data,mime)=>({data,mime})},LanguageModelChatMessage:{User:parts=>({parts})},CancellationTokenSource:class{constructor(){this.token={}}cancel(){}dispose(){}}};
 const model={capabilities:{imageInput:true},sendRequest:async(messages)=>{requests.push(messages);return {text:(async function*(){yield JSON.stringify(q.expected);})()};}};
 const answer=await vision.evaluate(api,{kind:'vscode',model},ref);
 assert.equal(answer.status,'pass');assert.equal(answer.score,100);assert.equal(requests.length,1);
 const parts=requests[0][0].parts;assert.equal(parts.length,2);assert.equal(parts[1].mime,'image/png');
 assert.ok(Buffer.from(parts[1].data).length>100);
 assert.doesNotMatch(parts[0].value,/rotationDeg|\"shapes\"|\"spec\"|\"fill\"/);
 const unsupported=await vision.evaluate(api,{kind:'vscode',model:{capabilities:{imageInput:false}}},ref);
 assert.equal(unsupported.status,'unsupported');
});
test('trusted SVG replay accepts whitelisted position/color edits and rejects injections',async()=>{
 const ref=challenge(),original=ref.spec,svg=bench.svgFromGeometry(original);
 const fill=original.shapes[0].fill;const next=fill==='#ff0000'?'#0000ff':'#ff0000';
 const changed=svg.replace('fill="'+fill+'"','fill="'+next+'"');
 const spec=bench.replaySpecFromEditedSvg(changed,original);
 assert.equal(spec.shapes[0].fill,next);
 assert.equal(bench.svgFromSpec(spec),changed);
 assert.throws(()=>bench.replaySpecFromEditedSvg(changed+'<script>alert(1)</script>',original),/approved shapes/);
 assert.throws(()=>bench.replaySpecFromEditedSvg(changed.replace('<svg','<svg onclick="alert(1)"'),original),/approved shapes/);
 assert.throws(()=>bench.replaySpecFromEditedSvg('javascript:alert(1)',original),/SVG/);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-visual-v341-'));
 try{
  const record=bench.makeRecord({prompt:ref.prompt,agentPath:'ai-harness/agents/git-agent.json',model:'Vision X',target:{kind:'vscode',model:{id:'vision-x'}},spec:original,challenge:ref,startedAt:new Date().toISOString(),durationMs:15});
  await bench.record(folder,record);
  const replay=await bench.replay(folder,record.id,record.agentPath,changed);
  assert.equal(replay.identical,false);assert.equal(replay.svg,changed);
  const other='ai-harness/agents/business-analyst.json';await bench.record(folder,{...record,id:'other',agentPath:other});
  assert.equal(await bench.clearHistory(folder,record.agentPath),1);
  assert.equal((await bench.history(folder)).length,1);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('Library Studio exposes two dropdowns, clear results, editable source/prompt and open-only relationships',()=>{
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8'),ui=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
 assert.match(html,/id="libraryClearResults"[^>]*aria-label="Clear results"/);
 assert.match(html,/class="library-selection-row"/);
 assert.match(html,/id="libraryImageCode"[^>]*aria-label="Editable image-generation code"/);
 assert.match(html,/id="libraryImagePrompt" rows="3" maxlength="2000" aria-describedby=/);
 assert.match(ui,/placeholder\.textContent='-- Please select --'/);
 assert.match(ui,/setRelationOpen\(true\)/);
 assert.match(ui,/libraryImageClearHistory/);
 assert.match(html,/id="libraryVisualQuestions"/);
 assert.doesNotMatch(ui,/Matching image regenerated and verified\./);
 assert.doesNotMatch(ui,/Execution unavailable for this language\./);
});
