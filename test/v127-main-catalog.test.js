'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const catalog=require('../src/github-sdlc-catalog');
const {ensureWorkspaceLibrary,loadStack}=require('../src/tech-stacks');
const design=require('../src/design-proposals');
const fixture=require('./catalog-fixture');
test('default private asset catalog is fixed to main and rejects non-main for canonical repository',()=>{
 assert.equal(catalog.DEFAULT_CONFIG.repositoryUrl,'');
 assert.equal(catalog.CANONICAL_REPO,'https://github.com/example-org/tech-stacks-skills');
 assert.equal(catalog.normalizeConfig({...catalog.DEFAULT_CONFIG,ref:'other'}).ref,'main');
});
test('pinned remote stack, design guidance and role skills are retrieved without project overrides',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-main-catalog-'));
 try{
  await ensureWorkspaceLibrary(workspace);await fixture.activate(workspace);
  assert.match(await catalog.roleSkill(workspace,'business-analyst'),/Business Analyst/i);
  assert.match(await catalog.designGuidance(workspace),/AIA|Qi/i);
  const current=await loadStack('react',workspace);
  assert.equal(current.framework,'React 19');assert.ok(current.templateRepository.includes('github'));
  const draft=design.prompt('mockup',{entries:[{id:'BR-1',revision:1}]},await catalog.designGuidance(workspace));
  assert.match(draft,/AIA|Qi/i);
  const edited=path.join(workspace,'.atgv','library','templates','tech-stacks','react.json');
  await fs.mkdir(path.dirname(edited),{recursive:true});await fs.writeFile(edited,JSON.stringify({...current,notes:'untrusted override'}));
  assert.equal((await loadStack('react',workspace)).notes,current.notes,'workspace defaults may not change pinned verified catalog');
  assert.deepEqual((await catalog.activeManifest(workspace)).techStacks,['spring-boot','nestjs','dotnet','react','angular']);
 }finally{await fs.rm(workspace,{recursive:true,force:true});}
});
