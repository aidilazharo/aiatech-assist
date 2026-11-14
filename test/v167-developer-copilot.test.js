'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {sortIssues,priorityRank,normalizeIssue,artifactGroups}=require('../src/developer-copilot');
const {readinessFlags,checkReadiness,readArtifactFiles,findLocalStoryBranch}=require('../src/developer-git');
const root=path.join(__dirname,'..');
const issue=(key,priority,status='In Progress',dueDate='')=>({key,summary:key,priority,status,category:status==='Done'?'done':'indeterminate',dueDate});
function git(cwd,...args){return execFileSync('git',['-C',cwd,...args],{encoding:'utf8',stdio:'pipe'}).trim();}

test('prioritizes highest and high Jira tasks first, with completed tasks last',()=>{
 const rows=sortIssues([issue('TC-103','Medium'),issue('TC-104','High'),issue('TC-105','Highest'),issue('TC-101','High','Done'),issue('TC-102','Low')]);
 assert.deepEqual(rows.map(x=>x.key),['TC-105','TC-104','TC-103','TC-102','TC-101']);
 assert.equal(priorityRank('Critical'),0);assert.equal(priorityRank('High'),1);assert.equal(priorityRank('Not set'),5);
 assert.equal(sortIssues([issue('TC-5','High','To Do','2026-12-31'),issue('TC-3','High','To Do','2026-11-02')])[0].key,'TC-3');
});

test('Jira API fields are normalized without invented story points or sprint',()=>{
 const actual=normalizeIssue({key:'TC-123',fields:{summary:'Acceptance testing',priority:{name:'High'},status:{name:'To Do',statusCategory:{key:'new'}},duedate:'2026-12-01',assignee:{displayName:'Developer A'}}});
 assert.equal(actual.key,'TC-123');assert.equal(actual.priority,'High');assert.equal(actual.points,null);assert.equal(actual.sprint,'');assert.equal(actual.dueDate,'2026-12-01');
 assert.equal(normalizeIssue({key:'BAD_KEY',fields:{}}),null);
});

test('stack and repository gates block unsafe branch creation; tests have their own readiness',()=>{
 assert.deepEqual(readinessFlags({}).blockers.slice(0,2),['Solution Architect has not selected a technology stack','Local Git repository is not selected']);
 let status=readinessFlags({stackId:'react',hasRepo:true,clean:true,matched:true,baseFound:true,targets:[]});
 assert.equal(status.readyBranch,true);assert.equal(status.readyTest,false);
 status=readinessFlags({stackId:'react',hasRepo:true,clean:true,matched:true,baseFound:true,targets:[{kind:'npm',scripts:['test'],installed:true}]});
 assert.equal(status.readyBranch,true);assert.equal(status.readyTest,true);
 for(const bad of [{clean:false,matched:true,baseFound:true},{clean:true,matched:false,baseFound:true},{clean:true,matched:true,baseFound:false}])
  assert.equal(readinessFlags({stackId:'nestjs',hasRepo:true,...bad}).readyBranch,false);
});

test('read-only artifact inspection reflects changed files, not invented file records',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v167-artifacts-'));
 try{
  git(dir,'init','-b','main');git(dir,'config','user.email','tester@example.invalid');git(dir,'config','user.name','Test');
  await fs.writeFile(path.join(dir,'README.md'),'# Test\n');git(dir,'add','README.md');git(dir,'commit','-m','init');
  const empty=await checkReadiness(dir,{stackId:'react',owner:'some-owner',name:'demo',base:'main'});
  assert.equal(empty.readyBranch,false);assert.ok(empty.blockers.some(x=>x.includes('origin')));
  git(dir,'switch','-c','feature/tc-123-login');
  await fs.mkdir(path.join(dir,'src'),{recursive:true});await fs.writeFile(path.join(dir,'src','Login.tsx'),'export const Login=()=>null;\n');
  await fs.mkdir(path.join(dir,'tests'),{recursive:true});await fs.writeFile(path.join(dir,'tests','login.test.ts'),'test();\n');
  const files=await readArtifactFiles(dir,'main');assert.equal(files.files.length,2);
  const groups=artifactGroups(files.files,files.updated);
  assert.ok(groups.find(g=>g.name==='Frontend').files.includes('src/Login.tsx'));
  assert.ok(groups.find(g=>g.name==='Testing').files.includes('tests/login.test.ts'));
  assert.equal(await findLocalStoryBranch(dir,'TC-123'),'feature/tc-123-login');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('Developer Copilot and duplicate workbench are removed, while the Jira role table remains',()=>{
 const ext=fsSync.readFileSync(path.join(root,'test','generated','extension-source.txt'),'utf8');
 const ui=fsSync.readFileSync(path.join(root,'media','start.js'),'utf8');
 assert.doesNotMatch(ext,/\$\{devMarkup\}|id="developerWorkbench"|id="workGithub"/);
 assert.match(ext,/id="roleJiraTable"/);
 assert.match(ext,/id="roleJiraRefresh"/);
 assert.match(ext,/id="settingsLocalRepoPath"/);
 assert.match(ext,/id="architectStackSelect"/);
 assert.match(ui,/ATGVDataTables\.mount\(root,rows/);
 assert.match(ui,/send\('roleJiraAssign'/);
});
