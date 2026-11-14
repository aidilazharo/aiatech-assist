'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vision=require('../src/agent-vision-test');
const images=require('../src/agent-image-test');
function api(){
 const calls=[];
 class TextPart{constructor(value){this.value=value;}}
 const vscode={
  LanguageModelTextPart:TextPart,
  LanguageModelDataPart:{image:(png,mime)=>({png,mime})},
  LanguageModelChatMessage:{User:parts=>({parts})},
  CancellationTokenSource:class{constructor(){this.token={};}cancel(){}dispose(){}}
 };
 return {vscode,calls};
}
function model(calls,response,capabilities){return {
 id:'test-vision',name:'Test Vision',capabilities,
 sendRequest:async messages=>{calls.push(messages);return {text:(async function*(){yield response(messages);})()};}
};}
const seed='known-visual-seed-123';
test('capability detection distinguishes declared, absent and unsupported model image input',()=>{
 const {vscode}=api();
 assert.equal(vision.capability(vscode,{kind:'vscode',model:{capabilities:{imageInput:true}}}).status,'supported');
 assert.equal(vision.capability(vscode,{kind:'vscode',model:{capabilities:{imageInput:false}}}).status,'unsupported');
 assert.equal(vision.capability(vscode,{kind:'vscode',model:{}}).status,'unverified');
 assert.equal(vision.capability(vscode,{kind:'other',model:{capabilities:{imageInput:true}}}).status,'unsupported');
 assert.equal(vision.capability({...vscode,LanguageModelDataPart:{}},{kind:'vscode',model:{capabilities:{imageInput:true}}}).status,'unsupported');
});
test('real PNG probe verifies randomized shape/count; never sends hidden geometry JSON',async()=>{
 const {vscode,calls}=api(),challenge=images.makeRandomChallenge(seed,'medium');
 const left=[...challenge.spec.shapes].sort((a,b)=>a.x-b.x)[0];
 const target={kind:'vscode',model:model(calls,()=>JSON.stringify({count:challenge.spec.shapes.length,leftmostColor:left.fill}),{})};
 const answer=await vision.verify(vscode,target,{seed});
 assert.equal(answer.status,'verified');assert.equal(answer.verified,true);assert.equal(calls.length,1);
 const parts=calls[0][0].parts;
 assert.match(parts[0].value,/ONLY the attached image/);
 assert.doesNotMatch(parts[0].value,/"shapes"|"fill"|"rotationDeg"|"spec"/);
 assert.equal(parts[1].mime,'image/png');
 assert.equal(Buffer.from(parts[1].png).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
});
test('probe never assumes pass from text response alone; known unsupported provider makes no call',async()=>{
 const {vscode,calls}=api();
 const wrong={kind:'vscode',model:model(calls,()=>JSON.stringify({count:100,leftmostColor:'#ffffff'}),{imageInput:true})};
 const rejected=await vision.verify(vscode,wrong,{seed});
 assert.equal(rejected.status,'unverified');assert.equal(rejected.verified,false);
 const unsupported=await vision.verify(vscode,{kind:'vscode',model:model(calls,()=>'{"count":2}',{imageInput:false})},{seed});
 assert.equal(unsupported.status,'unsupported');assert.equal(calls.length,1);
});
test('verified probe permits visual benchmark when provider omitted imageInput declaration',async()=>{
 const {vscode,calls}=api(),ref=images.makeRandomChallenge(seed,'medium'),q=images.visualQuestions(ref);
 const target={kind:'vscode',model:model(calls,()=>JSON.stringify(q.expected),{})};
 const blocked=await vision.evaluate(vscode,target,ref);
 assert.equal(blocked.status,'unsupported');assert.equal(calls.length,0);
 const done=await vision.evaluate(vscode,target,ref,{verifiedImageInput:true});
 assert.equal(done.status,'pass');assert.equal(done.score,100);assert.equal(calls.length,1);
});
test('UI and extension wire user-initiated vision probe, capability status, and versioned API',()=>{
 const root=path.resolve(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
 const client=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
 assert.match(html,/id="libraryImageVerifyVision"/);
 assert.match(html,/case 'libraryImageVisionProbe'/);
 assert.match(html,/verifiedVisionModels/);
 assert.match(client,/send\('libraryImageVisionProbe'/);
 assert.match(client,/libraryImageVisionProbeResult/);
 assert.match(client,/verified image input|Verified image input/i);
});
