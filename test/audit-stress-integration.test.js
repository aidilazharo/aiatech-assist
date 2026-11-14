'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const step = require('../src/role-step-engine');

function fixture(t) {
  const pending = fs.mkdtemp(path.join(os.tmpdir(), 'atgv-audit-'));
  t.after(async () => fs.rm(await pending, { recursive: true, force: true }));
  return pending.then(root => ({ root, registry: { fileFor: id => path.join(root, id, 'registry.json') } }));
}
const developer = {id:'software-developer',label:'Developer',tasks:[]};
const architect = {id:'solution-architect',label:'Solution Architect',tasks:[]};

test('stress: parallel output writes retain all items and unique IDs', async t => {
  const {registry} = await fixture(t);
  const projectId = 'project-a';
  const requests = Array.from({length:72},(_,i)=>({roleId:developer.id,scopeId:'TC-101',stepId:'development',kind:'add',title:`Commit evidence ${i+1}`}));
  // Burst concurrency with bounded retries to emulate multiple developer sessions.
  const runs = await Promise.all(requests.map(async request=>{
    for(let attempt=0;attempt<7;attempt++) {
      try { await step.update(registry,projectId,[developer],request);return true; }
      catch(e) { if(!/locked/.test(e.message)) throw e; await new Promise(r=>setTimeout(r,attempt*50+15)); }
    }
    return false;
  }));
  assert.ok(runs.every(Boolean),'all bounded retries should succeed');
  const saved=await step.load(registry,projectId);
  const outputs=saved.scopes['software-developer|TC-101'].development.outputs;
  assert.equal(outputs.length,72);
  assert.equal(new Set(outputs.map(o=>o.id)).size,72);
  assert.equal(new Set(outputs.map(o=>o.title)).size,72);
});

test('stress: repeated same title cannot create duplicate outputs', async t => {
  const {registry} = await fixture(t);
  const request={roleId:developer.id,scopeId:'TC-102',stepId:'tests',kind:'add',title:'Unit test evidence'};
  await step.update(registry,'project-b',[developer],request);
  await assert.rejects(step.update(registry,'project-b',[developer],request),/already exists/);
  const state=await step.load(registry,'project-b');
  assert.equal(state.scopes['software-developer|TC-102'].tests.outputs.length,1);
});

test('integration contract: verified evidence and independent Jira scopes', async t => {
  const {root,registry}=await fixture(t);
  const p='project-c';
  const evidence='documents/testing/unit-results.txt';
  await fs.mkdir(path.join(root,p,'documents','testing'),{recursive:true});
  await fs.writeFile(path.join(root,p,evidence),'Test run 29/29 successful.');
  const act={roleId:developer.id,scopeId:'TC-201',stepId:'tests',kind:'add',title:'Run 29 unit tests',evidence};
  const created=await step.update(registry,p,[developer],act);
  const id=created.steps.find(s=>s.id==='tests').outputs[0].id;
  await assert.rejects(step.update(registry,p,[developer],{...act,kind:'set-status',outputId:id,status:'verified',reviewer:'QA'}),/review/);
  await step.update(registry,p,[developer],{...act,kind:'set-status',outputId:id,status:'in-review'});
  const verified=await step.update(registry,p,[developer],{...act,kind:'set-status',outputId:id,status:'verified',reviewer:'QA'});
  assert.equal(verified.steps.find(s=>s.id==='tests').completed,1);
  assert.equal((await step.overview(registry,p,[developer],'TC-202')).roles[0].steps.find(s=>s.id==='tests').completed,0);
  assert.equal((await step.consolidated(registry,p,[developer,architect])).verifiedEvidence,1);
});

test('security stress: untrusted paths and symlinks are rejected', async t => {
  const {root,registry}=await fixture(t);
  for(const bad of ['../etc/passwd','http://invalid.example/file','file:///etc/passwd','//host/share','./hidden']) {
    assert.throws(()=>step.validEvidence(bad));
  }
  await fs.mkdir(path.join(root,'project-d','documents'),{recursive:true});
  await fs.symlink(os.tmpdir(),path.join(root,'project-d','documents','outside'));
  await assert.rejects(step.verifyEvidence(registry,'project-d','documents/outside/file.txt'),/Symlink/);
});

test('stress: role registry has exactly 18 non-duplicated role plans',()=>{
  const roles=Object.keys(step.CONFIGS);
  assert.equal(roles.length,18);
  assert.equal(new Set(roles).size,18);
  assert.ok(roles.every(role=>step.getPlan({id:role,tasks:[]}).length>0));
});
