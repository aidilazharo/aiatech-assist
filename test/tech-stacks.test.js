'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {listStacks,loadStack,ensureWorkspaceLibrary,scaffoldProject,removeManagedWorkspaceLibrary,stackMarkdown}=require('../src/tech-stacks');
const {ProjectRegistry,normalizeProjectInput}=require('../src/projects');
const fixture=require('./catalog-fixture');
const temp=()=>fs.mkdtemp(path.join(os.tmpdir(),'atgv-tech-stacks-'));
test('five stack definitions are supplied only by activated remote catalog',async()=>{
 const root=await temp();try{
  assert.deepEqual(await listStacks(),[]);assert.deepEqual(await listStacks(root),[]);
  await assert.rejects(()=>loadStack('react'),/pull/i);
  await fixture.activate(root);
  const stacks=await listStacks(root);
  assert.deepEqual(stacks.map(s=>s.id),['spring-boot','nestjs','dotnet','react','angular']);
  assert.deepEqual(stacks.map(s=>s.runtime),['Java 25','Node.js 26','.NET 10','React 19','Angular 22']);
  assert.equal(stacks[0].orm,'Spring Data JPA / Hibernate');
  assert.equal(stacks[3].database,'SQLite');assert.match(stacks[3].apiBaseUrl,/3001/);
  assert.ok(stacks.every(s=>s.templateRepository.includes('github.com')));
  assert.match(stackMarkdown(stacks[3]),/Testing Library/);
  assert.throws(()=>normalizeProjectInput({name:'Bad',techStackId:'../../evil'}),/Invalid|tech stack/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('workspace library is project-owned but stacks and skills are remote and not editable local copies',async()=>{
 const root=await temp();try{
  await ensureWorkspaceLibrary(root);
  assert.equal(await fs.stat(path.join(root,'.atgv','skills')).then(()=>true,()=>false),false);
  assert.equal(await fs.stat(path.join(root,'.atgv','library','templates','tech-stacks')).then(()=>true,()=>false),false);
  await fixture.activate(root);
  const registry=new ProjectRegistry(root);
  const p=await registry.create({name:'Cockpit SDLC',techStackId:'react',settings:{jira:{projectKey:'CSDLC'}}});
  await scaffoldProject(root,p);
  const home=path.join(root,'projects',p.id);
  const config=JSON.parse(await fs.readFile(path.join(home,'atgv.project.json'),'utf8'));
  assert.equal(config.schema,4);assert.equal(config.techStackId,'react');assert.equal(config.settings.jira.projectKey,'CSDLC');
  const selected=JSON.parse(await fs.readFile(path.join(home,'tech-stack.json'),'utf8'));
  assert.equal(selected.framework,'React 19');
  assert.match(await fs.readFile(path.join(home,'documents','architecture','tech-stack.md'),'utf8'),/Playwright/);
  for(const folder of ['sdlc/processes','sdlc/roles','sdlc/workflows','documents/requirements','documents/deployment','documents/meetings','knowledge','overrides/branding','overrides/templates','overrides/skills'])
   assert.ok((await fs.stat(path.join(home,folder))).isDirectory(),folder);
  assert.equal(await fs.stat(path.join(root,'.atgv','library','templates','user-story.md')).then(()=>true,()=>false),false);
  assert.equal(await fs.stat(path.join(root,'.atgv','library','sdlc','roles')).then(()=>true,()=>false),false);
  assert.ok(await fs.stat(path.join(root,'.atgv','branding','theme.json')));
  const override=path.join(root,'.atgv','overrides','templates','tech-stacks','react.json');
  await fs.mkdir(path.dirname(override),{recursive:true});await fs.writeFile(override,JSON.stringify({...selected,notes:'untrusted local override'}));
  assert.notEqual((await loadStack('react',root)).notes,'untrusted local override','pinned remote asset must win');
  await ensureWorkspaceLibrary(root);
  const authored=path.join(home,'documents','architecture','tech-stack.md');
  await fs.writeFile(authored,'Human decisions');await scaffoldProject(root,p);
  assert.equal(await fs.readFile(authored,'utf8'),'Human decisions');
  assert.ok(!(await fs.readFile(path.join(home,'tech-stack.json'),'utf8')).includes('secret'));
  assert.equal(await removeManagedWorkspaceLibrary(root),true);
  await assert.rejects(()=>fs.access(path.join(root,'.atgv')),{code:'ENOENT'});assert.ok(await fs.stat(home));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('malformed remote stack files are rejected; symlinked workspace library is rejected',async()=>{
 const root=await temp();try{
  await ensureWorkspaceLibrary(root);await fixture.activate(root);
  const stack=path.join(root,'.atgv','catalog-assets',fixture.SHA,'tech-stacks','angular','stack.json');
  const value=JSON.parse(await fs.readFile(stack,'utf8'));value.id='../other';
  await fs.writeFile(stack,JSON.stringify(value));
  await assert.rejects(()=>loadStack('angular',root),/ID does not match/);
  await fs.rm(path.join(root,'.atgv'),{recursive:true,force:true});
  await fs.symlink(path.join(root,'elsewhere'),path.join(root,'.atgv'));
  await assert.rejects(()=>ensureWorkspaceLibrary(root),/real directory/);
  await assert.rejects(()=>removeManagedWorkspaceLibrary(root),/normal directory/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('legacy projects acquire pinned stack metadata after catalog activation',async()=>{
 const root=await temp();try{
  const reg=new ProjectRegistry(root);await reg.create({name:'Old project'});
  const p=await reg.update('old-project',{name:'Old project',techStackId:'dotnet',settings:{}});
  await ensureWorkspaceLibrary(root);await scaffoldProject(root,p);
  assert.equal(await fs.stat(path.join(root,'projects','old-project','tech-stack.json')).then(()=>true,()=>false),false);
  await fixture.activate(root);await scaffoldProject(root,p);
  assert.equal((await reg.read('old-project')).techStackId,'dotnet');
  assert.match(await fs.readFile(path.join(root,'projects','old-project','documents','architecture','tech-stack.md'),'utf8'),/Project placeholder/,'existing project docs must not be overwritten');
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'projects','old-project','tech-stack.json'),'utf8')).id,'dotnet');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
