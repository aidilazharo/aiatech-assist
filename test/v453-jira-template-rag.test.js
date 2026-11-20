'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const k=require('../src/jira-template-knowledge');
test('TRM checklist starts unapproved and cannot be silently applied as a GATE DoD',()=>{
 const draft=k.template();assert.equal(draft.status,'proposed');assert.equal(draft.items.length,9);
 assert.match(draft.items[2],/99%/);
 const s=k.suggest(draft,{kind:'Story',title:'Contingency',description:'GATE shall reject contingency above 5%.'});
 assert.match(s.acceptanceCriteria,/contingency above 5%/);assert.equal(s.definitionOfDone,'');
});
test('Business Analyst approval writes project-scoped searchable knowledge and authorizes story DoD',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-jira-template-'));
 try{
  const approved=await k.approve(tmp,'Verified Business Analyst');assert.equal(approved.status,'approved');
  const loaded=await k.load(tmp);assert.equal(loaded.items.length,9);
  assert.match(await fs.readFile(path.join(tmp,'knowledge','jira-approved-trm-story-template.md'),'utf8'),/Approved by/);
  const s=k.suggest(loaded,{kind:'Story',description:'Given a project, when saved, then it is retained.'});
  assert.match(s.definitionOfDone,/test is written first/);
  assert.match(s.acceptanceCriteria,/Given a project/);
  assert.equal(k.suggest(loaded,{kind:'Epic'}).definitionOfDone,'');
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
