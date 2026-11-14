'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fss=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const tdd=require('../src/developer-tdd');
const pipeline=require('../src/developer-br-pipeline');
const architecture=require('../src/developer-br-architecture');
const cleanup=require('../src/developer-br-cleanup');
const root=path.join(__dirname,'..');
const host=fss.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fss.readFileSync(path.join(root,'media/start.js'),'utf8');
const screen=host.slice(host.indexOf('<section id="developerTaskDashboard"'),host.indexOf('<div id="developerManualTickets"'));
const testManifest=JSON.stringify({summary:'red',files:[{path:'tests/people.test.js',content:'const test=require("node:test"); const assert=require("node:assert"); test("name",()=>{assert.equal(1,2)});'}]});
const codeManifest=JSON.stringify({summary:'green',files:[{path:'src/people.js',content:'module.exports={name:"person"};'}]});
test('strict TDD manifests permit only unit tests in RED and only application code in GREEN/REFACTOR',()=>{
 assert.deepEqual(tdd.guardManifest(testManifest,{kind:'test'}).files.map(x=>x.path),['tests/people.test.js']);
 assert.deepEqual(tdd.guardManifest(codeManifest,{kind:'code'}).files.map(x=>x.path),['src/people.js']);
 assert.throws(()=>tdd.guardManifest(codeManifest,{kind:'test'}),/unit-test|RED/);
 assert.throws(()=>tdd.guardManifest(testManifest,{kind:'code'}),/cannot edit|GREEN/);
 assert.throws(()=>tdd.guardManifest(JSON.stringify({files:[{path:'package.json',content:'{}'}]}),{kind:'code'}),/configuration|package/);
 assert.equal(tdd.guardManifest('{"files":[]}',{kind:'refactor',allowEmpty:true}).files.length,0);
 assert.throws(()=>tdd.verifyBaseline([{passed:false}]),/baseline/);
 assert.throws(()=>tdd.verifyRed([{passed:true,logs:'ok'}]),/passed/);
 assert.throws(()=>tdd.verifyRed([{passed:false,logs:'vitest: not found'}]),/environment/);
 const red=tdd.verifyRed([{passed:false,logs:'AssertionError: expected 2, received 1',operation:'test'}]);
 assert.equal(red[0].expectedFailure,true);
});
test('RED test files remain byte-for-byte protected through GREEN and REFACTOR',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-tdd261-'));
 try{
  await fs.mkdir(path.join(base,'tests'));
  await fs.writeFile(path.join(base,'tests','people.test.js'),'test("name", () => assert(false));');
  const snap=await tdd.snapshotBeforeChanges(base,[{path:'tests/people.test.js'}]);
  await tdd.assertLockedTests(snap);
  await fs.writeFile(path.join(base,'tests','people.test.js'),'test("name", () => assert(true));');
  await assert.rejects(tdd.assertLockedTests(snap),/Protected TDD RED tests changed/);
  await tdd.restoreChanges(snap);
  await tdd.assertLockedTests(snap);
 }finally{await fs.rm(base,{recursive:true,force:true});}
});
test('generated schema and API routes are extracted from real code, never invented',()=>{
 const parsed=architecture.parseArchitecture([
  {path:'server/migrate.mjs',content:'db.exec(`CREATE TABLE IF NOT EXISTS people (id INTEGER PRIMARY KEY, name TEXT NOT NULL);`);'},
  {path:'server/index.mjs',content:'app.get("/api/people", list);\napp.post("/api/people", create);\napp.delete("/api/people/:id", remove);'},
  {path:'src/view.jsx',content:'fetch("/api/people")'}
 ]);
 assert.equal(parsed.tables.length,1);assert.equal(parsed.tables[0].name,'people');
 assert.ok(parsed.tables[0].columns.some(x=>x.includes('name TEXT')));
 assert.ok(parsed.endpoints.some(x=>x.method==='POST'&&x.path==='/api/people'));
 assert.ok(parsed.endpoints.some(x=>x.method==='DELETE'&&x.path==='/api/people/:id'));
 assert.equal(architecture.parseArchitecture([{path:'src/main.jsx',content:'export const nothing=1;'}]).tables.length,0);
});
test('the UI exposes explicit TDD phases, safe ownership toggle, categorized schema/API and revision statuses',()=>{
 for(const step of ['Red','Green','Refactor','Test','Build','Local','Verify'])assert.match(screen,new RegExp('id="developerBrStep'+step+'"'));
 assert.match(screen,/id="developerBrChangeBadge"/);
 assert.doesNotMatch(screen,/id="developerBrAssign"|id="developerBrUnassign"/);
 assert.match(screen,/Unit Test/);
 assert.doesNotMatch(screen,/Generated code runs in an isolated Git worktree\. Jira completion/);
 assert.match(ui,/↻ Restart Development/);
 assert.match(ui,/new:'New'/);assert.match(ui,/updated:'Updated'/);assert.match(ui,/cancelled:'Cancelled'/);assert.match(ui,/'in-progress':'In Progress'/);
 assert.match(ui,/Database schema/);assert.match(ui,/API endpoints/);
 const action=host.slice(host.indexOf('async function runDeveloperBrAutomation('),host.indexOf('async function runDeveloperDeliveryChecks('));
 assert.doesNotMatch(action,/const proceed=await uiWarning/);
 assert.doesNotMatch(action,/askAiSendConsent\(/);
 assert.ok(action.indexOf('verifyBaseline(baseline)')<action.indexOf('testsOnlyPrompt('));
 assert.ok(action.indexOf('verifyRed(red)')<action.indexOf('greenPrompt('));
 assert.match(action,/RED .*could not generate unique test paths after 3 attempts/);
 assert.match(action,/redTestsUnexpectedlyPassed/);
 assert.match(action,/restoreChanges\(beforeRed\)/);
 assert.match(action,/for\(let redAttempt=0;redAttempt<3;redAttempt\+\+\)/);
 assert.ok(action.indexOf('collidingTestPaths(')<action.indexOf('writeGenerated(run.worktree,redManifest.files)'));
 assert.ok(action.indexOf('greenPassed=true')<action.indexOf('refactorPrompt('));
 assert.match(host,/case 'developerBrAssignment'/);
 assert.match(host,/jiraUnassignCurrentUser/);
 assert.match(host,/developerBRCleanup\.removeLocalDevelopment/);
});
test('unassign cleanup removes only the selected BR generated Git worktrees, protects original and other BRs',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-cleanup261-'));
 const repo=path.join(temp,'repo'),projectId='test-project',baseDir=path.join(temp,'developer-br-worktrees',projectId);
 const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
 try{
  await fs.mkdir(repo);git('init','-b','main');git('config','user.email','test@example.invalid');git('config','user.name','ATGV test');
  await fs.writeFile(path.join(repo,'README.md'),'approved original source');git('add','README.md');git('commit','-m','baseline');
  const sha=git('rev-parse','HEAD');
  const victim=await pipeline.createWorktree({root:repo,approvedSha:sha,baseDirectory:baseDir,brId:'BR-007'});
  const other=await pipeline.createWorktree({root:repo,approvedSha:sha,baseDirectory:baseDir,brId:'BR-008'});
  const evidenceDir=path.join(temp,'developer-tdd-evidence',projectId);
  await fs.mkdir(evidenceDir,{recursive:true});await fs.writeFile(path.join(evidenceDir,'BR-007.json'),'proof');
  const result=await cleanup.removeLocalDevelopment({repoRoot:repo,baseDirectory:baseDir,brId:'BR-007',projectId,storageRoot:temp});
  assert.equal(result.deletedWorktrees,1);
  await assert.rejects(fs.access(victim.worktree));
  await fs.access(other.worktree);
  await assert.rejects(fs.access(path.join(evidenceDir,'BR-007.json')));
  assert.equal(await fs.readFile(path.join(repo,'README.md'),'utf8'),'approved original source');
  assert.equal(git('branch','--list',victim.branch),'');
  await assert.rejects(cleanup.removeLocalDevelopment({repoRoot:repo,baseDirectory:path.join(temp,'repo'),brId:'BR-007',projectId,storageRoot:temp}),/Refusing/);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
