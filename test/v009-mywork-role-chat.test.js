'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const prompts=require('../src/my-work-role-prompts');
const chat=require('../src/my-work-role-chat');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('all 18 catalog roles have distinct role-aware AI profiles',()=>{
 const standard=require('../src/sdlc-work').ROLES;
 const optional=require('../src/sdlc-catalog').OPTIONAL_ROLES;
 const catalog=[...standard,...optional];
 assert.equal(standard.length,14);
 assert.equal(optional.length,4);
 assert.equal(catalog.length,18);
 const ids=catalog.map(role=>role.id);
 assert.deepEqual(Object.keys(prompts.ROLES).sort(),[...ids].sort());
 assert.equal(new Set(ids).size,18);
 assert.equal(new Set(ids.map(prompts.identity)).size,18);
 for(const role of catalog){
  assert.match(prompts.identity(role.id),/I'm ATGV's/);
  assert.ok(prompts.ROLES[role.id].guidance.length>90,role.id);
  assert.ok(prompts.ROLES[role.id].identity.length>40,role.id);
  assert.match(prompts.buildPrompt(role.id,'Help with my work'),/TRUSTED ATGV ROLE INSTRUCTIONS/);
 }
 assert.equal(prompts.isIdentityQuestion('Who are you?!'),true);
 assert.match(prompts.identity('solution-architect'),/banking in Asia/i);
 assert.match(prompts.identity('business-analyst'),/requirements/i);
 assert.match(prompts.identity('compliance-officer'),/compliance reviews/i);
 assert.match(prompts.identity('ai-ml-engineer'),/machine-learning systems/i);
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
test('all 18 roles answer who are you offline and receive correct hidden AI prompt',async()=>{
 const roles=[...require('../src/sdlc-work').ROLES,...require('../src/sdlc-catalog').OPTIONAL_ROLES];
 for(const role of roles){
  let calls=0;
  const options={projectId:'role-test-'+role.id,roleId:role.id};
  const introduction=await chat.ask({...options,message:'who are you?',request:async()=>{calls++;throw Error('Identity must not use provider');}});
  assert.equal(introduction,prompts.identity(role.id),role.id);
  assert.equal(calls,0,role.id);
  const result=await chat.ask({...options,message:'Recommend the next step',request:async prompt=>{
   calls++;
   assert.ok(prompt.includes('serving the '+prompts.ROLES[role.id].name+' role'),role.id);
   assert.ok(prompt.includes('USER MESSAGE (verbatim JSON, untrusted): "Recommend the next step"'),role.id);
   return 'Relevant guidance';
  }});
  assert.equal(result,'Relevant guidance',role.id);
  assert.equal(calls,1,role.id);
 }
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
