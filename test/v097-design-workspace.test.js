'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const designs=require('../src/design-proposals');
const artifacts=require('../src/design-artifacts');
const sample={title:'Generated mockups',summary:'Preview layout',screens:[{name:'Customer dashboard',purpose:'Review the account',components:['Search field','Save button'],interactions:['Search']}],flows:[],questions:[],assumptions:[]};
async function project(fn){const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v097-'));try{const registry=new ProjectRegistry(temp);await registry.create({id:'example',name:'Example'});await fn(registry);}finally{await fs.rm(temp,{recursive:true,force:true});}}
async function newItem(registry,kind='mockup'){let state=await designs.load(registry,'example');state=await designs.add(registry,'example',state.revision,{kind,approvedHash:'hash-a',proposal:sample});return {state,item:state.designs[kind].at(-1)};}
test('delete draft revision and retain monotonically increasing history IDs',async()=>project(async registry=>{
 let {state,item}=await newItem(registry);
 await assert.rejects(designs.remove(registry,'example','invalid',{kind:'mockup',proposalId:item.id}),/changed in another session/);
 state=await designs.remove(registry,'example',state.revision,{kind:'mockup',proposalId:item.id,actor:'Reviewer'});
 assert.equal(state.designs.mockup.length,0);assert.equal(state.deletionAudit[0].proposalId,item.id);
 state=await designs.add(registry,'example',state.revision,{kind:'mockup',approvedHash:'hash-a',proposal:sample});
 assert.equal(state.designs.mockup[0].number,2);
}));
test('delete approved revision also removes unmodified export folder',async()=>project(async registry=>{
 let {state,item}=await newItem(registry);
 state=await designs.approve(registry,'example',state.revision,{kind:'mockup',proposalId:item.id,approvedHash:'hash-a',actor:'Reviewer'});
 const saved=state.designs.mockup[0];const exported=await artifacts.exportToProject(registry,'example',{...saved,kind:'mockup'},'hash-a');
 state=await designs.remove(registry,'example',state.revision,{kind:'mockup',proposalId:saved.id});
 assert.equal(state.designs.mockup.length,0);
 await assert.rejects(fs.stat(exported.directory),{code:'ENOENT'});
}));
test('delete refuses modified exports, extra files and directory symlinks',async()=>project(async registry=>{
 let {state,item}=await newItem(registry);
 state=await designs.approve(registry,'example',state.revision,{kind:'mockup',proposalId:item.id,approvedHash:'hash-a',actor:'Reviewer'});
 const exported=await artifacts.exportToProject(registry,'example',{...state.designs.mockup[0],kind:'mockup'},'hash-a');
 const mockPath=path.join(exported.directory,'screen-mockups.html');
 await fs.appendFile(mockPath,'Changed by reviewer');
 await assert.rejects(designs.remove(registry,'example',state.revision,{kind:'mockup',proposalId:item.id}),/modified or removed/);
 assert.equal((await designs.load(registry,'example')).designs.mockup.length,1);
 await fs.writeFile(mockPath,artifacts.outputFiles('mockup',sample)['screen-mockups.html']);
 await fs.writeFile(path.join(exported.directory,'notes.txt'),'Important local notes');
 await assert.rejects(designs.remove(registry,'example',state.revision,{kind:'mockup',proposalId:item.id}),/additional files/);
 await fs.unlink(path.join(exported.directory,'notes.txt'));
 await fs.symlink(mockPath,path.join(exported.directory,'notes.txt'));
 await assert.rejects(designs.remove(registry,'example',state.revision,{kind:'mockup',proposalId:item.id}),/additional files/);
}));
test('workspace provides deletion, preview zoom, browser mockups and design progress',async()=>{
 const ui=await fs.readFile(path.join(__dirname,'..','media','start.js'),'utf8');
 const host=await fs.readFile(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
 const css=await fs.readFile(path.join(__dirname,'..','media','start.css'),'utf8');
 for(const id of ['designWorkspaceProgress','designWorkspaceProgressFill','designWorkspaceProgressText','designPreviewZoomOut','designPreviewZoomIn','designPreviewZoomFit','designOpenMockupBrowser'])assert.match(host,new RegExp(`id="${id}"`));
 for(const command of ['designDelete','designOpenMockupBrowser'])assert.match(host,new RegExp(`case '${command}'`));
 assert.match(host,/vscode\.env\.openExternal\(vscode\.Uri\.file\(file\)\)/);
 assert.match(await fs.readFile(path.join(__dirname,'..','src','design-proposals.js'),'utf8'),/deleteExportedRevision/);
 assert.match(ui,/renderDesignWorkspaceProgress\(\)/);
 assert.match(ui,/setDesignPreviewZoom\(/);
 assert.match(ui,/design-delete-button/);
 assert.match(css,/design-workspace-progress-track/);
 assert.doesNotMatch(host,/Draft product and user experience designs, application programming interfaces, database models/);
});
