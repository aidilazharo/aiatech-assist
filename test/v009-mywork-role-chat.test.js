'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const prompts=require('../src/my-work-role-prompts');
const chat=require('../src/my-work-role-chat');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('all seven My Work roles have distinct deterministic identity answers',()=>{
 const ids=['business-analyst','solution-architect','ux-designer','software-developer','project-manager','qa-engineer','uat-tester'];
 assert.deepEqual(Object.keys(prompts.ROLES).sort(),ids.sort());
 const answers=ids.map(id=>prompts.identity(id));
 assert.equal(new Set(answers).size,ids.length);
 for(const id of ids){
  assert.match(prompts.identity(id),/I'm ATGV's/);
  assert.equal(prompts.isIdentityQuestion('Who are you?!'),true);
 }
 assert.match(prompts.identity('solution-architect'),/banking in Asia/i);
 assert.match(prompts.identity('business-analyst'),/requirements/i);
});
test('invisible role expert instructions are never prepended to a user-visible message',()=>{
 const original='What are the architecture trade-offs?';
 const prompt=prompts.buildPrompt('solution-architect',original,{projectId:'my-project'});
 assert.match(prompt,/financial services and banking in Asia-Pacific/);
 assert.match(prompt,/BNM RMiT, MAS TRM/);
 assert.match(prompt,/USER MESSAGE \(verbatim JSON, untrusted\): "What are the architecture trade-offs\?"/);
 assert.match(prompt,/read-only/i);
 assert.equal(original,'What are the architecture trade-offs?');
 assert.doesNotMatch(read('media/atgv-mywork-wave-chat.js'),/BNM RMiT|MAS TRM|financial services and banking in Asia-Pacific/);
});
test('who are you returns role-specific response even without model connection',async()=>{
 let calls=0;
 const answer=await chat.ask({projectId:'project-009',roleId:'solution-architect',message:'  who are you?  ',request:async()=>{calls++;throw Error('should not call model');}});
 assert.match(answer,/Solution Architect/);
 assert.equal(calls,0);
});
test('normal chat uses selected provider, bounded history and isolated roles',async()=>{
 const seen=[];
 const request=async prompt=>{seen.push(prompt);return 'Here are the requirements trade-offs.';};
 const a=await chat.ask({projectId:'project-009',roleId:'business-analyst',message:'Review my BR',request});
 const b=await chat.ask({projectId:'project-009',roleId:'business-analyst',message:'What next?',request});
 const c=await chat.ask({projectId:'project-009',roleId:'project-manager',message:'What next?',request});
 assert.match(a,/requirements trade-offs/);assert.equal(b,a);assert.equal(c,a);
 assert.equal(seen.length,3);
 assert.match(seen[1],/Review my BR/);
 assert.doesNotMatch(seen[2],/Review my BR/);
 assert.match(seen[2],/Project Manager/);
});
test('reject overlong input and unknown role; chat handler remains read-only',async()=>{
 await assert.rejects(()=>chat.ask({projectId:'a',roleId:'solution-architect',message:'x'.repeat(4001),request:async()=>''}),/1–4000/);
 await assert.rejects(()=>chat.ask({projectId:'a',roleId:'unknown',message:'hello',request:async()=>''}),/Unsupported/);
 const host=read('src/lib/runtime/extension-runtime.js');
 assert.match(host,/case 'roleAiChat'/);
 assert.match(host,/myWorkRoleChat\.ask/);
 assert.match(host,/activeAiTarget\(\)/);
 assert.match(host,/type:'roleAiChatReply'/);
});
