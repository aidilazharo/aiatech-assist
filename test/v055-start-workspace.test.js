'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {workspaceForFolder,chooseProject,hintedProjectFromFile}=require('../src/project-discovery');
const {ProjectRegistry}=require('../src/projects');

async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-start055-'));
 try{return await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}
}
async function project(root,id){
 const registry=new ProjectRegistry(root);
 await registry.create({id,name:id});
 return registry;
}
test('ATGV Start locates a project opened directly or from a nested folder',async()=>fixture(async root=>{
 await project(root,'claims');
 const dir=path.join(root,'projects','claims');
 assert.deepEqual(await workspaceForFolder(dir),{root,projectId:'claims',source:'project-folder'});
 await fs.mkdir(path.join(dir,'documents','requirements'),{recursive:true});
 assert.deepEqual(await workspaceForFolder(path.join(dir,'documents','requirements')),{root,projectId:'claims',source:'project-folder'});
 assert.deepEqual(await workspaceForFolder(root),{root,projectId:null,source:'workspace'});
}));
test('selects the only registered project without network dependency',async()=>fixture(async root=>{
 const registry=await project(root,'claims');
 const all=await registry.list();
 assert.equal(chooseProject(all,{root})?.id,'claims');
 assert.equal(await fs.readdir(root).then(a=>a.includes('.atgv')),false);
}));
test('selects active editor project rather than stale last-opened project',async()=>fixture(async root=>{
 const registry=await project(root,'claims');await registry.create({id:'digital',name:'Digital'});
 const all=await registry.list();
 const picked=chooseProject(all,{root,preferredId:'claims',activeFile:path.join(root,'projects','digital','documents','requirements','new.md')});
 assert.equal(picked.id,'digital');
 assert.equal(hintedProjectFromFile(root,all.map(p=>p.id),path.join(root,'projects','digital-sibling','x')),null);
}));
test('multiple projects without a hint are not automatically opened',async()=>fixture(async root=>{
 const registry=await project(root,'claims');await registry.create({id:'digital',name:'Digital'});
 const all=await registry.list();
 assert.equal(chooseProject(all,{root}),null);
 assert.equal(chooseProject(all,{root,folderId:'digital'})?.id,'digital');
 assert.equal(chooseProject(all,{root,preferredId:'missing'}),null);
}));
test('does not follow symlinked project manifests when scanning workspace folders',async()=>fixture(async root=>{
 const outside=path.join(root,'outside');await fs.mkdir(outside);
 await fs.writeFile(path.join(outside,'atgv.project.json'),'{}');
 await fs.mkdir(path.join(root,'projects'));await fs.symlink(outside,path.join(root,'projects','claims'));
 assert.equal((await workspaceForFolder(path.join(root,'projects','claims'))).source,'workspace');
}));
test('renders a progressive search UI and keeps an explicit current project choice',()=>{
 const fsSync=require('node:fs');const root=path.resolve(__dirname,'..');
 const html=fsSync.readFileSync(path.join(root,'test','generated','extension-source.txt'),'utf8');
 const script=fsSync.readFileSync(path.join(root,'media','start.js'),'utf8');
 const styles=fsSync.readFileSync(path.join(root,'media','start.css'),'utf8');
 assert.match(html,/aria-valuemin="0"[^>]+id="workspaceSearchTrack"/);
 assert.match(html,/id="workspaceSearchMessage"/);
 assert.match(script,/function renderWorkspaceSearch\(scan\)/);
 assert.match(script,/if\(m.type==='startupScan'\)/);
 assert.match(styles,/\.workspace-search-fill/);
 assert.match(html,/openingFlow\.opened\(\)/);
});
