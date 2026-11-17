'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const reset=require('../src/architect-stack-reset');
function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
async function fixture(t){
 const tmp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v398-reset-')));t.after(()=>fs.rm(tmp,{recursive:true,force:true,maxRetries:5}));
 const workspace=path.join(tmp,'workspace'),projectFolder=path.join(workspace,'projects','demo'),root=path.join(projectFolder,'repository','app');
 await fs.mkdir(path.join(projectFolder,'documents','architecture'),{recursive:true});await fs.mkdir(root,{recursive:true});
 await fs.writeFile(path.join(projectFolder,'tech-stack.json'),'original stack metadata\n');
 await fs.writeFile(path.join(projectFolder,'documents','architecture','tech-stack.md'),'original architecture notes\n');
 execFileSync('git',['init','-b','main',root],{stdio:'ignore'});git(root,'config','user.name','ATGV Test');git(root,'config','user.email','atgv@example.invalid');
 await fs.writeFile(path.join(root,'README.md'),'base\n');git(root,'add','.');git(root,'commit','-m','main');const main=git(root,'rev-parse','HEAD');
 const branch='migration/react-catalog-1-1-12-79dd9b01';git(root,'switch','-c',branch);await fs.writeFile(path.join(root,'app.txt'),'starter\n');git(root,'add','.');git(root,'commit','-m','stack');const sha=git(root,'rev-parse','HEAD');
 const project={id:'demo',techStackId:'react',techStackGeneration:0,techStackPrepared:{stackId:'react',branch,root,baseBranch:'main',sha,remotePushed:true}};
 const alias=path.join(tmp,'workspace-alias');await fs.symlink(workspace,alias,process.platform==='win32'?'junction':'dir');
 return {tmp,workspace,projectFolder,root,main,branch,sha,project,alias,aliasProject:path.join(alias,'projects','demo')};
}
function options(f,extra={}){return {projectFolder:f.aliasProject,workspaceRoot:f.alias,projectId:'demo',stackId:'react',root:f.root,project:f.project,force:true,allowFeatureRecovery:true,...extra};}
async function originalDocuments(f){return [await fs.readFile(path.join(f.projectFolder,'tech-stack.json'),'utf8'),await fs.readFile(path.join(f.projectFolder,'documents','architecture','tech-stack.md'),'utf8')];}

test('reset accepts a workspace alias, archives project records and preserves Git work',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.root,'local.txt'),'user changes');
 const plan=await reset.plan({root:f.root,project:f.project,force:true,allowFeatureRecovery:true});
 const archivePlan=await reset.planProjectStackArchive(f.aliasProject,'react',{workspaceRoot:f.alias,projectId:'demo'});
 const {result,archive}=await reset.resetWithProjectArchive(options(f,{expectedPlan:plan,expectedArchivePlan:archivePlan}));
 assert.equal(git(f.root,'branch','--show-current'),'main');assert.equal(git(f.root,'rev-parse','HEAD'),f.main);assert.equal(git(f.root,'rev-parse',f.branch),f.sha);
 assert.ok(result.recoveryStash);assert.equal(git(f.root,'rev-parse','stash@{0}'),result.recoveryStash);
 assert.deepEqual(archive.archived,['tech-stack.json','documents/architecture/tech-stack.md']);
 assert.equal(await fs.readFile(path.join(archive.folder,'tech-stack.json'),'utf8'),'original stack metadata\n');
 assert.equal(await fs.readFile(path.join(archive.folder,'documents','architecture','tech-stack.md'),'utf8'),'original architecture notes\n');
 assert.equal(await fs.stat(path.join(f.projectFolder,'tech-stack.json')).then(()=>true,()=>false),false);
});
test('retry completes when an earlier failed archive already left Git on main',async t=>{
 const f=await fixture(t);git(f.root,'switch','main');
 const plan=await reset.plan({root:f.root,project:f.project,force:true,allowFeatureRecovery:true});assert.equal(plan.currentBranch,'main');
 const archivePlan=await reset.planProjectStackArchive(f.aliasProject,'react',{workspaceRoot:f.alias,projectId:'demo'});
 const {result,archive}=await reset.resetWithProjectArchive(options(f,{expectedPlan:plan,expectedArchivePlan:archivePlan}));
 assert.equal(result.currentBranch,'main');assert.equal(result.nextGeneration,1);assert.equal(archive.archived.length,2);assert.equal(git(f.root,'rev-parse',f.branch),f.sha);
});
test('unsafe linked project documents or archive are blocked before Git changes',async t=>{
 const f=await fixture(t),outside=path.join(f.tmp,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'tech-stack.md'),'outside untouched');
 await fs.rm(path.join(f.projectFolder,'documents','architecture'),{recursive:true});await fs.symlink(outside,path.join(f.projectFolder,'documents','architecture'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(reset.resetWithProjectArchive(options(f)),/Unsafe project stack document directory/);
 assert.equal(git(f.root,'branch','--show-current'),f.branch);assert.equal(git(f.root,'stash','list'),'');assert.equal(await fs.readFile(path.join(outside,'tech-stack.md'),'utf8'),'outside untouched');
 const second=await fixture(t),outsideArchive=path.join(second.tmp,'outside-archive');await fs.mkdir(outsideArchive);
 await fs.symlink(outsideArchive,path.join(second.projectFolder,'stack-history'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(reset.planProjectStackArchive(second.aliasProject,'react',{workspaceRoot:second.alias,projectId:'demo'}),/Unsafe project stack archive directory/);
 assert.equal(git(second.root,'branch','--show-current'),second.branch);
});
test('a linked project folder or a path outside the selected project is rejected',async t=>{
 const f=await fixture(t),outside=path.join(f.tmp,'outside');await fs.mkdir(outside);
 await fs.symlink(outside,path.join(f.workspace,'projects','linked'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(reset.planProjectStackArchive(path.join(f.alias,'projects','linked'),'react',{workspaceRoot:f.alias,projectId:'linked'}),/Project folder must be a real directory/);
 await assert.rejects(reset.planProjectStackArchive(outside,'react',{workspaceRoot:f.alias,projectId:'demo'}),/outside the selected workspace project/);
 assert.equal(git(f.root,'branch','--show-current'),f.branch);
});
test('an unrelated linked archive directory is not touched when no stack documents exist',async t=>{
 const f=await fixture(t),outside=path.join(f.tmp,'outside');await fs.mkdir(outside);
 await fs.rm(path.join(f.projectFolder,'tech-stack.json'));await fs.rm(path.join(f.projectFolder,'documents','architecture','tech-stack.md'));
 await fs.symlink(outside,path.join(f.projectFolder,'stack-history'),process.platform==='win32'?'junction':'dir');
 const result=await reset.resetWithProjectArchive(options(f));assert.deepEqual(result.archive.archived,[]);
 assert.equal(git(f.root,'branch','--show-current'),'main');assert.deepEqual(await fs.readdir(outside),[]);
});
test('changed project documents are detected before changing Git',async t=>{
 const f=await fixture(t),plan=await reset.plan({root:f.root,project:f.project,force:true}),archivePlan=await reset.planProjectStackArchive(f.aliasProject,'react',{workspaceRoot:f.alias,projectId:'demo'});
 await fs.writeFile(path.join(f.projectFolder,'tech-stack.json'),'changed after confirmation\n');
 await assert.rejects(reset.resetWithProjectArchive(options(f,{expectedPlan:plan,expectedArchivePlan:archivePlan})),/documents changed since reset confirmation/);
 assert.equal(git(f.root,'branch','--show-current'),f.branch);assert.equal(await fs.readFile(path.join(f.projectFolder,'tech-stack.json'),'utf8'),'changed after confirmation\n');
});
test('a changed Git checkout restores archived documents and does not create a stash',async t=>{
 const f=await fixture(t),plan=await reset.plan({root:f.root,project:f.project,force:true}),archivePlan=await reset.planProjectStackArchive(f.aliasProject,'react',{workspaceRoot:f.alias,projectId:'demo'});
 await fs.writeFile(path.join(f.root,'new-user-work.txt'),'preserve me');
 await assert.rejects(reset.resetWithProjectArchive(options(f,{expectedPlan:plan,expectedArchivePlan:archivePlan})),/changed since the reset confirmation.*documents were restored/i);
 assert.deepEqual(await originalDocuments(f),['original stack metadata\n','original architecture notes\n']);
 assert.equal(git(f.root,'branch','--show-current'),f.branch);assert.equal(git(f.root,'stash','list'),'');assert.equal(await fs.readFile(path.join(f.root,'new-user-work.txt'),'utf8'),'preserve me');
});
test('an interrupted archive restores files already moved',async t=>{
 const f=await fixture(t),original=fs.rename;let calls=0;
 t.mock.method(fs,'rename',async(...args)=>{calls++;if(calls===2)throw Object.assign(Error('simulated disk error'),{code:'EIO'});return original(...args);});
 await assert.rejects(reset.archiveProjectStackDocuments(f.aliasProject,'react',{workspaceRoot:f.alias,projectId:'demo'}),/previously moved documents were restored/);
 assert.deepEqual(await originalDocuments(f),['original stack metadata\n','original architecture notes\n']);assert.equal(git(f.root,'branch','--show-current'),f.branch);
});
test('Windows path comparisons ignore casing while POSIX comparisons remain case-sensitive',()=>{
 assert.equal(reset.samePath('C:\\Users\\Aidil\\ATGV','c:\\users\\aidil\\atgv','win32'),true);
 assert.equal(reset.samePath('/home/Aidil/atgv','/home/aidil/atgv','linux'),false);
});
