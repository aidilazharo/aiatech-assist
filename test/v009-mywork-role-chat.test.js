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
test('shared My Work waveform and chat follows every selected role without duplicate panels',()=>{
 const ui=read('media/start.js'),wave=read('media/atgv-mywork-wave-chat.js'),html=read('src/lib/webview/dashboard-html.js');
 assert.match(ui,/window\.ATGVMyWorkAI\?\.update\(\{/);
 assert.match(ui,/projectId:activeId,roleId:role\.id,roleName:visibleRoleLabel\(role\)/);
 assert.match(wave,/snapshot\.roleName\|\|nextRole/);
 assert.match(wave,/roleAiChat/);
 assert.match(wave,/transcript\.replaceChildren\(\)/);
 assert.equal(html.match(/id="atgvMyWorkAiChatForm"/g)?.length,1);
 assert.equal(html.match(/id="atgvMyWorkAiInput"/g)?.length,1);
});
test('AI chat card matches sibling My Work section width and spacing across roles',()=>{
 const css=read('media/atgv-mywork-ai.css');
 const peer=read('media/start.css');
 assert.match(peer,/#workView \.role-jira-work\{border:1px solid var\(--atgv-line\);border-radius:11px;padding:20px;margin:14px 0/);
 assert.match(css,/#workView > #atgvMyWorkAi,/);
 assert.match(css,/#workView\.role-progress-only > #atgvMyWorkAi\.atgv-mywork-ai/);
 assert.match(css,/width:100%;min-width:0;box-sizing:border-box;align-self:stretch/);
 assert.match(css,/min-height:0;padding:20px 24px;margin:14px 0 18px/);
 for(const name of ['atgv-mywork-ai-content','atgv-mywork-ai-chat','atgv-mywork-ai-conversation']){
  const rule=css.match(new RegExp('\\.'+name+'\\{[^}]+\\}'))?.[0]||'';
  assert.match(rule,/max-width:none/,name);
  assert.match(rule,/width:100%/,name);
 }
 assert.match(css,/@media\(max-width:620px\)/);
});
test('My Work and PM pages omit activity captions and chat explanatory text',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const wave=read('media/atgv-mywork-wave-chat.js');
 const css=read('media/atgv-mywork-ai.css');
 const removed=[
  'WAITING FOR ACTIVITY',
  'Enter to send · Shift+Enter for a new line',
  'CHAT WITH ATGV AI',
  'Project-wide Jira delivery activity, team workload and saved role schedules. Jira transitions require confirmation.'
 ];
 for(const phrase of removed){
  assert.equal(html.includes(phrase),false,'HTML contains removed UI text: '+phrase);
  assert.equal(wave.includes(phrase),false,'runtime recreates removed UI text: '+phrase);
 }
 assert.doesNotMatch(html,/id="atgvMyWorkAiWaveState"/);
 assert.doesNotMatch(wave,/atgvMyWorkAiWaveState/);
 assert.doesNotMatch(css,/\.atgv-mywork-ai-wave-state\{/);
 assert.doesNotMatch(html,/<label class="atgv-mywork-ai-chat-label"/);
 assert.doesNotMatch(css,/\.atgv-mywork-ai-chat-label\{/);
 assert.match(html,/id="atgvMyWorkAiChatForm"/);
 assert.match(html,/id="atgvMyWorkAiInput"[^>]*aria-label="Message ATGV AI"/);
 assert.match(wave,/input\.setAttribute\('aria-label'/);
 assert.match(wave,/form\.addEventListener\('submit'/);
 assert.match(wave,/input\.addEventListener\('keydown'/);
 assert.match(css,/clip:rect\(0,0,0,0\)!important/);
 assert.match(html,/id="pmDailyCockpit"/);
 assert.match(html,/id="pmRefreshJira"/);
});
test('waveform still automatically animates, slows, sleeps and awakens without visible activity labels',()=>{
 const wave=read('media/atgv-mywork-wave-chat.js');
 for(const phase of ['SLOWING','LINE ONLY','FADING','SLEEPING'])assert.ok(wave.includes(phase));
 assert.match(wave,/requestAnimationFrame\(frame\)/);
 assert.match(wave,/function pulse\(/);
 assert.match(wave,/function activity\(\)\{pulse\(1\);\}/);
 assert.match(wave,/lastActivity=performance\.now\(\)/);
 assert.doesNotMatch(wave,/label\.textContent/);
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
