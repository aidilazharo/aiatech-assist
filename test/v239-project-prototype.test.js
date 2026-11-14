'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const pipeline=require('../src/ux-design-pipeline');
const project=require('../src/project-ux-prototype');
const flow={title:'Browse',nodes:[{id:'a',label:'Start'},{id:'b',label:'End'}],edges:[{from:'a',to:'b'}]};
function screens(name){return {title:name,summary:name,screens:[{name,purpose:'Details <img onerror=alert(1)>',components:['Search'],interactions:['Open']}],assumptions:[],questions:[]};}
const meta={designer:'Test Designer',sourceBRHash:'a'.repeat(64),jiraUpdated:'2026-11-09',designFramework:'aia-qi'};
async function rootTest(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-project-prototype-'));try{return await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
async function create(root,key,name,sourceStoryKey=key){const draft=await pipeline.generate(root,key,{flow,wireframe:screens(name),mockup:screens(name)},'',{...meta,sourceStoryKey});return draft;}
async function approve(root,draft){return pipeline.decide(root,draft.key,'approved',draft.revision,'Reviewer');}
test('all approved Jira UI/UX screens share one project folder, with traceability to Jira task and parent Story',()=>rootTest(async root=>{
 const a=await create(root,'TC-392','Dashboard','TC-390');
 const pending=await project.openable(root,a);
 assert.match(pending.file,/project-prototype[/\\]preview-TC-392\.html$/);
 assert.equal((await project.load(root)).tickets['TC-392'],undefined);
 const approvedA=await approve(root,a);await project.update(root,approvedA);
 const b=await create(root,'TC-401','Settings','TC-399');await project.update(root,await approve(root,b));
 const manifest=await project.load(root);assert.equal(Object.keys(manifest.tickets).length,2);
 const view=await project.openable(root,approvedA);
 assert.match(view.file,/documents[/\\]project-prototype[/\\]index.html$/);
 const html=await fs.readFile(view.file,'utf8');
 assert.match(html,/TC-392/);assert.match(html,/TC-401/);assert.match(html,/TC-390/);assert.match(html,/TC-399/);
 assert.doesNotMatch(html,/<img onerror=alert\(1\)>/);
 assert.match(html,/data-jira-source/);
 assert.equal(project.combined(manifest).screenCount,2);
}));
test('rejecting another task does not erase a previous approved Jira contribution',()=>rootTest(async root=>{
 const a=await create(root,'TC-392','Loan Form');await project.update(root,await approve(root,a));
 const b=await create(root,'TC-401','App Settings');await project.update(root,await approve(root,b));
 await project.retract(root,'TC-401');
 const state=await project.load(root);assert.deepEqual(Object.keys(state.tickets),['TC-392']);
 assert.match(await fs.readFile(project.paths(root).html,'utf8'),/Loan Form/);
 assert.doesNotMatch(await fs.readFile(project.paths(root).html,'utf8'),/App Settings/);
}));
test('same-name screens from different tickets are not silently overwritten',()=>rootTest(async root=>{
 for(const key of ['TC-392','TC-401']){const draft=await create(root,key,'Dashboard');await project.update(root,await approve(root,draft));}
 const result=project.combined(await project.load(root));assert.equal(result.screenCount,2);
 assert.equal(result.potentialDuplicateScreens[0],'dashboard');
 assert.notEqual(result.screens[0].id,result.screens[1].id);
}));
test('repeat approval is idempotent; draft preview does not change approved manifest',()=>rootTest(async root=>{
 const a=await create(root,'TC-392','Dashboard');const approved=await approve(root,a);
 await project.update(root,approved);await project.update(root,approved);
 const before=await project.load(root);
 const draft=await create(root,'TC-401','Settings');await project.openable(root,draft);
 assert.deepEqual(await project.load(root),before);
}));
test('path traversal is rejected',()=>rootTest(async root=>{
 assert.throws(()=>project.contribution({exists:true,status:'approved',key:'../../TC-1',prototype:{screens:[{name:'Foo'}]}}));
}));
