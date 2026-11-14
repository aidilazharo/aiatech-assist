'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const {ensureWorkspaceLibrary,scaffoldProject}=require('../src/tech-stacks');
const root=()=>fs.mkdtemp(path.join(os.tmpdir(),'atgv-folder-v041-'));

test('registers uppercase existing folders without deleting existing files or root resources',async()=>{
 const workspace=await root();
 try{
  const registry=new ProjectRegistry(workspace);await registry.ensureRoot();
  for(const folder of ['COC','ECMS']){
   await fs.mkdir(path.join(registry.root,folder));
   await fs.mkdir(path.join(registry.root,folder,'documents'));
   await fs.writeFile(path.join(registry.root,folder,'documents','important.md'),folder+' preserved');
  }
  for(const dir of ['.aia','docs','.vscode'])await fs.mkdir(path.join(workspace,dir));
  assert.deepEqual(await registry.list(),[]);
  assert.deepEqual((await registry.unmanagedFolders()).map(x=>x.folder),['COC','ECMS']);
  const project=await registry.importExistingFolder('COC');
  assert.equal(project.id,'coc');assert.equal(project.name,'COC');
  await ensureWorkspaceLibrary(workspace);await scaffoldProject(workspace,project);
  assert.equal(await fs.readFile(path.join(registry.root,'coc','documents','important.md'),'utf8'),'COC preserved');
  assert.equal((await registry.list()).length,1);
  assert.deepEqual((await registry.unmanagedFolders()).map(x=>x.folder),['ECMS']);
  for(const dir of ['.aia','docs','.vscode'])assert.ok((await fs.stat(path.join(workspace,dir))).isDirectory());
 }finally{await fs.rm(workspace,{recursive:true,force:true});}
});

test('migrates an existing uppercase ATGV manifest and preserves integration settings',async()=>{
 const workspace=await root();
 try{
  const registry=new ProjectRegistry(workspace);await registry.ensureRoot();
  const dir=path.join(registry.root,'ECMS');await fs.mkdir(dir);
  const data={schema:4,id:'ECMS',name:'Existing Content Management',techStackId:'',createdAt:'2025-01-01T00:00:00Z',updatedAt:'2025-01-01T00:00:00Z',settings:{jira:{projectKey:'ECMS'},confluence:{spaceKey:'ECMS'},github:{owner:'team',repo:'ecms-docs'}},customProperty:'retained'};
  await fs.writeFile(path.join(dir,'atgv.project.json'),JSON.stringify(data));
  await fs.writeFile(path.join(dir,'contents.txt'),'retain this file');
  const project=await registry.importExistingFolder('ECMS');
  assert.equal(project.id,'ecms');assert.equal(project.createdAt,data.createdAt);
  assert.equal(project.settings.jira.projectKey,'ECMS');assert.equal(project.customProperty,'retained');
  assert.equal(await fs.readFile(path.join(registry.root,'ecms','contents.txt'),'utf8'),'retain this file');
 }finally{await fs.rm(workspace,{recursive:true,force:true});}
});

test('blocks case-insensitive collisions and prevents creating duplicate IDs',async()=>{
 const workspace=await root();
 try{
  const registry=new ProjectRegistry(workspace);await registry.ensureRoot();
  await fs.mkdir(path.join(registry.root,'COC'));
  assert.equal((await registry.unmanagedFolders())[0].blocked,false);
  await assert.rejects(()=>registry.create({id:'coc',name:'Another'}),{code:'EEXIST'});
  await fs.mkdir(path.join(registry.root,'coc'));
  assert.equal((await registry.unmanagedFolders()).every(x=>x.blocked),true);
  await assert.rejects(()=>registry.importExistingFolder('COC'),/same ID/i);
 }finally{await fs.rm(workspace,{recursive:true,force:true});}
});

test('does not overwrite mismatched project manifests and does not follow symlinks',async()=>{
 const workspace=await root();
 try{
  const registry=new ProjectRegistry(workspace);await registry.ensureRoot();
  const d=path.join(registry.root,'COC');await fs.mkdir(d);
  await fs.writeFile(path.join(d,'atgv.project.json'),JSON.stringify({schema:4,id:'wrong-id',name:'Wrong',settings:{}}));
  const candidate=(await registry.unmanagedFolders())[0];assert.equal(candidate.blocked,true);
  await assert.rejects(()=>registry.importExistingFolder('COC'),/does not match/i);
  assert.equal((await fs.readdir(registry.root))[0],'COC');
  await fs.rm(path.join(d,'atgv.project.json'));
  const external=path.join(workspace,'elsewhere');await fs.writeFile(external,'safe');
  await fs.symlink(external,path.join(d,'atgv.project.json'));
  const linked=(await registry.unmanagedFolders())[0];assert.equal(linked.blocked,true);
  assert.equal(await fs.readFile(external,'utf8'),'safe');
 }finally{await fs.rm(workspace,{recursive:true,force:true});}
});

test('imports an existing lowercase folder missing a manifest without destroying its data',async()=>{
 const workspace=await root();
 try{
  const registry=new ProjectRegistry(workspace);await registry.ensureRoot();
  const dir=path.join(registry.root,'existing-project');await fs.mkdir(dir);
  await fs.writeFile(path.join(dir,'readme.md'),'Existing source');
  const [candidate]=await registry.unmanagedFolders();assert.equal(candidate.folder,'existing-project');
  const project=await registry.importExistingFolder('existing-project');
  assert.equal(project.id,'existing-project');
  assert.equal(await fs.readFile(path.join(dir,'readme.md'),'utf8'),'Existing source');
  assert.deepEqual(await registry.unmanagedFolders(),[]);
 }finally{await fs.rm(workspace,{recursive:true,force:true});}
});
