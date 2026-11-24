'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {readFileSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const reset=require('../src/architect-stack-reset');
const root=path.join(__dirname,'..');
const host=readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=readFileSync(path.join(root,'media/start.js'),'utf8');
const css=readFileSync(path.join(root,'media/start.css'),'utf8');
function git(folder,...args){return execFileSync('git',['-C',folder,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
async function repo(fn){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v286-'));
 try{
  execFileSync('git',['init','-b','main',folder],{stdio:'ignore'});
  git(folder,'config','user.name','ATGV Test');git(folder,'config','user.email','test@example.invalid');
  await fs.writeFile(path.join(folder,'README.md'),'clean main\n');git(folder,'add','.');git(folder,'commit','-m','baseline');
  const base=git(folder,'rev-parse','main');git(folder,'switch','-c','bootstrap/react-reset-1');
  await fs.writeFile(path.join(folder,'atgv.bootstrap.json'),JSON.stringify({source:'github-main-catalog',stacks:['react']}));
  git(folder,'add','.');git(folder,'commit','-m','bootstrap');
  const bootstrap=git(folder,'rev-parse','HEAD');
  const project={techStackId:'react',techStackGeneration:1,techStackPrepared:{stackId:'react',branch:'bootstrap/react-reset-1',root:folder,baseBranch:'main'}};
  await fn({folder,base,bootstrap,project});
 }finally{await fs.rm(folder,{recursive:true,force:true});}
}
test('v286 force reset from verified feature branch preserves commits, stash and main',()=>repo(async({folder,base,bootstrap,project})=>{
 git(folder,'switch','-c','feature/tc-400-br-007-manage-person-names');
 await fs.writeFile(path.join(folder,'feature.js'),'committed feature code\n');git(folder,'add','.');git(folder,'commit','-m','keep developer changes');
 const feature=git(folder,'rev-parse','HEAD');
 await fs.writeFile(path.join(folder,'feature.js'),'unstaged feature edits\n');
 await fs.writeFile(path.join(folder,'untracked note.txt'),'also important\n');
 await assert.rejects(reset.plan({root:folder,project,force:true}),/Switch to the saved stack branch/);
 const plan=await reset.plan({root:folder,project,force:true,allowFeatureRecovery:true});
 assert.equal(plan.preservedWorkBranch,'feature/tc-400-br-007-manage-person-names');
 assert.equal(plan.dirtyCount,2);
 const done=await reset.reset({root:folder,project,force:true,allowFeatureRecovery:true,expectedPlan:plan});
 assert.equal(done.currentBranch,'main');assert.equal(git(folder,'rev-parse','HEAD'),base);
 assert.equal(git(folder,'rev-parse','bootstrap/react-reset-1'),bootstrap);
 assert.equal(git(folder,'rev-parse','feature/tc-400-br-007-manage-person-names'),feature);
 assert.ok(done.recoveryStash);
 git(folder,'switch','feature/tc-400-br-007-manage-person-names');git(folder,'stash','apply','stash@{0}');
 assert.equal(await fs.readFile(path.join(folder,'feature.js'),'utf8'),'unstaged feature edits\n');
 assert.equal(await fs.readFile(path.join(folder,'untracked note.txt'),'utf8'),'also important\n');
}));
test('v286 refuses feature recovery without verified recorded bootstrap checkout',()=>repo(async({folder,project})=>{
 git(folder,'switch','-c','feature/unrelated');
 const bad={...project,techStackPrepared:{...project.techStackPrepared,root:folder+'/other'}};
 await assert.rejects(reset.plan({root:folder,project:bad,force:true,allowFeatureRecovery:true}),/not the checkout that prepared/);
 assert.equal(git(folder,'branch','--show-current'),'feature/unrelated');
}));
test('v286 Jira inventory has stable column widths and compact human-readable time',()=>{
 assert.match(ui,/root\.classList\.add\('ba-jira-project-table','atgv-jira-common-table'\)/);
 assert.match(css,/atgv-jira-common-table \.atgv-datatable-table\{min-width:1850px;table-layout:fixed/);
 assert.match(css,/atgv-jira-common-table \.atgv-datatable-table th:nth-child\(2\)\{width:5%\}/);
 assert.match(css,/atgv-jira-common-table \.atgv-datatable-table th:nth-child\(4\)\{width:22%\}/);
 assert.match(ui,/new Intl\.DateTimeFormat\(undefined,\{day:'numeric',month:'short'/);
});
test('v286 deletion shows animated progress and refreshes all role caches only on completed deletion',()=>{
 for(const id of ['brDeletionProgress','brDeletionProgressText','brDeletionProgressCount','brDeletionFill','brDeletionTrack'])assert.ok(host.includes(`id="${id}"`));
 assert.match(css,/@keyframes atgv-br-delete-spin/);
 assert.match(ui,/function requestBRDeletion\(payload\)/);
 assert.match(ui,/showBRDeletionProgress\('running'/);
 assert.match(host,/type:'brDeletionProgress',projectId:deletionProjectId/);
 assert.match(host,/await deletionComplete\(ids,plan\.jira\.map/);
 assert.match(host,/await refreshDashboard\(\)/);
 assert.match(ui,/roleJiraRequest\+\+;roleJiraLoaded=false;roleJiraLoading=false;roleJiraItems=\[\]/);
 assert.match(ui,/if\(activeId&&projectConnectionsSnapshot\.jira\?\.key\)searchJiraInventory\(\)/);
 assert.match(ui,/if\(view==='work'&&\['software-developer','ux-designer'\]\.includes\(selectedRole\)\)loadRoleJiraIssues\(true\)/);
 assert.match(ui,/msg\.requestId===roleJiraRequest/);
});
