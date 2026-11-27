'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const artifacts=require('../src/project-artifacts');
async function fixture(t){
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-artifacts-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 const meta=path.join(workspace,'.atgv'),storage=path.join(meta,'memory'),root=path.join(workspace,'projects','demo');
 await fs.mkdir(storage,{recursive:true});await fs.mkdir(root,{recursive:true});
 await fs.writeFile(path.join(meta,'atgv.workspace.json'),JSON.stringify({managedBy:'aia-my.atgv-aiatech-assist'}));
 await fs.writeFile(path.join(root,'atgv.project.json'),JSON.stringify({id:'demo'}));
 return {workspace,storage,root};
}
test('project artifact layout initializes all standard and custom roles without overwriting originals',async t=>{
 const {root}=await fixture(t),base=await artifacts.ensure(root,['custom-role']);
 for(const dir of ['logs','context','roles/business-analyst','roles/software-developer','roles/custom-role'])assert.ok((await fs.stat(path.join(base,dir))).isDirectory());
 assert.match(await fs.readFile(path.join(base,'.gitignore'),'utf8'),/\*/);
 assert.equal(await artifacts.ensure(root),base);
});
test('canonical indexes distinguish drafts, approvals and unsafe paths',async t=>{
 const {root}=await fixture(t),digest='a'.repeat(64);
 await artifacts.indexCanonical(root,{revision:3,documents:{a:{id:'a',roleId:'ux-designer',title:'Flow',status:'draft',path:'documents/design.md',digest},b:{id:'b',roleId:'software-developer',title:'Code',status:'approved',path:'../other',digest,approval:{digest}}}});
 const index=JSON.parse(await fs.readFile(path.join(root,'artifacts','context','artifact-index.json'),'utf8'));
 assert.equal(index.records[0].approvalRecorded,false);assert.equal(index.records[1].approvalRecorded,true);assert.equal(index.records[1].path,'');
 const doc=await artifacts.contextDocument(root);assert.match(doc.text,/Logs and drafts are not business rules/);assert.match(doc.text,/Flow/);
});
test('journal mirror is scoped to verified workspace and removes common credentials',async t=>{
 const {workspace,storage,root}=await fixture(t);
 assert.equal(await artifacts.locateProject(storage,'demo'),root);
 assert.equal(await artifacts.locateProject(storage,'other'),null);
 assert.equal(await artifacts.mirrorJobs(storage,'demo',[{projectId:'demo',role:'Developer',command:'developerBrRun',status:'failed',error:'Bearer SECRET01234'},{projectId:'other',error:'other project'}]),true);
 await artifacts.appendDiagnostic(storage,'demo','software-developer',{stage:'green',status:'failed',details:'password=secret123'});
 const data=await fs.readFile(path.join(root,'artifacts','logs','workflow-jobs.json'),'utf8');assert.doesNotMatch(data,/SECRET01234|other project/);
 const log=await fs.readFile(path.join(root,'artifacts','logs','software-developer.json'),'utf8');assert.doesNotMatch(log,/secret123/);
 assert.match((await artifacts.contextDocument(root)).text,/developerBrRun/);
});
test('unsafe artifact symlink is rejected',async t=>{
 const {root}=await fixture(t);await fs.writeFile(path.join(root,'not-a-folder'),'x');
 await fs.rename(path.join(root,'not-a-folder'),path.join(root,'artifacts'));
 await assert.rejects(artifacts.ensure(root),/Unsafe project artifact directory/);
});
