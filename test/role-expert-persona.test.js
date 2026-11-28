'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const profiles=require('../src/my-work-role-prompts'),chat=require('../src/my-work-role-chat'),router=require('../src/my-work-role-skill-router');
test('all 18 built-in roles share a specialist persona with honest AI identity',()=>{
 assert.equal(Object.keys(profiles.ROLES).length,18);
 for(const [id,role] of Object.entries(profiles.ROLES)){
  const persona=profiles.expertPersona(id);
  assert.ok(persona.includes(JSON.stringify(role.name)));
  assert.match(persona,/30 years/);assert.match(persona,/PhD-level/);assert.match(persona,/professor and senior industry consultant/);
  assert.match(persona,/not an actual personal biography/);
  assert.equal(profiles.buildPrompt(id,'Help').split(persona).length,2);
  assert.doesNotMatch(profiles.identity(id),/PhD|30 years/);
 }
});
test('host-verified custom role gets same expert persona and role boundaries',async()=>{
 const role={id:'custom-service-reviewer',label:'Service Reviewer'};
 assert.throws(()=>profiles.expertPersona(role.id),/Unsupported/);
 const result=await chat.ask({projectId:'custom-test',roleId:role.id,projectRole:role,message:'Help with my work',request:async prompt=>{
  assert.match(prompt,/Service Reviewer/);assert.match(prompt,/30 years/);assert.match(prompt,/read-only/);return 'Review service evidence.';
 }});
 assert.equal(result,'Review service evidence.');
 assert.match(router.response(router.route(role.id,'Create a wireframe',role)),/Service Reviewer/);
});
