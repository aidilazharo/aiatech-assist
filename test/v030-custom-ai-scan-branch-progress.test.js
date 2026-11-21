'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),fsSync=require('node:fs');
const os=require('node:os'),path=require('node:path');
const {promisify}=require('node:util'),{execFile}=require('node:child_process');
const exec=promisify(execFile);
const developer=require('../src/developer-git');
const custom=require('../src/architect-custom-stack');
const repair=require('../src/architect-custom-repair');
const preview=require('../src/stack-mock-preview');
const source=file=>fsSync.readFileSync(path.join(__dirname,'..',file),'utf8');
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-custom-repair-'));
 try {
  await fs.mkdir(path.join(root,'ReactTS_Frontend'));
  await fs.mkdir(path.join(root,'NestJS_Backend'));
  await fs.writeFile(path.join(root,'ReactTS_Frontend','package.json'),JSON.stringify({
   name:'react-frontend',scripts:{dev:'vite',build:'tsc -b && vite build'},
   dependencies:{react:'^19'},devDependencies:{vite:'^8'}
  }));
  await fs.writeFile(path.join(root,'ReactTS_Frontend','vite.config.ts'),"export default {server:{proxy:{'/api':'http://localhost:3000'}}};");
  await fs.writeFile(path.join(root,'NestJS_Backend','package.json'),JSON.stringify({
   name:'nestjs-backend',scripts:{'start:dev':'nest start --watch',build:'nest build'},
   dependencies:{'@nestjs/core':'^12','@mikro-orm/postgresql':'^7','@nestjs/passport':'^12'}
  }));
  await fs.writeFile(path.join(root,'NestJS_Backend','.env.example'),'DB_HOST=localhost\nDB_NAME=sample\nSESSION_JWT_SECRET=mock\n');
  await exec('git',['init','-b','main'],{cwd:root});
  await exec('git',['add','.'],{cwd:root});
  await exec('git',['-c','user.name=ATGV','-c','user.email=dev@preview.invalid','commit','-m','baseline'],{cwd:root});
  return await fn(root);
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
test('scan explains frontend API, missing deps and backend DB/auth integration without real service claims',async()=>{
 await fixture(async root=>{
  const scan=await custom.scan(root);
  const result=await repair.analyse(root,scan);
  assert.equal(scan.targets.length,2);
  assert.equal(result.source,'verified repository manifests and environment-variable names');
  assert.deepEqual(result.services,{frontend:true,backend:true,database:true,auth:true});
  assert.deepEqual(result.actions.map(a=>a.id),['mock-services','mock-database','install-dependencies','fix-branch']);
  assert.ok(result.observations.some(x=>x.code==='database'));
  assert.ok(result.observations.some(x=>x.code==='authentication'));
  assert.ok(result.observations.some(x=>x.code==='environment'));
  assert.ok(!JSON.stringify(result).includes('DB_NAME=sample'));
 });
});
test('createFixBranch writes only isolated mock source and verifies clean main preserved',async()=>{
 await fixture(async root=>{
  const before=await developer.repository(root);
  const result=await repair.createFixBranch(root,{expectedSha:before.sha});
  assert.match(result.branch,/^fix\/atgv-custom-stack-[a-f0-9]{10}$/);
  assert.equal(result.previousBranch,'main');
  assert.match(result.message,/No remote push/);
  assert.equal((await developer.repository(root)).branch,result.branch);
  assert.equal((await developer.repository(root)).clean,true);
  const created=await fs.readdir(path.join(root,'atgv-preview'));
  assert.deepEqual(created.sort(),['README.md','mock-database.json','mock-services.mjs']);
  const server=await fs.readFile(path.join(root,'atgv-preview','mock-services.mjs'),'utf8');
  assert.match(server,/MOCK DATA ONLY/);
  assert.match(server,/127\.0\.0\.1/);
  assert.match(server,/status=501/);
  assert.match(server,/mock-database\.json/);
  const mainFiles=(await exec('git',['ls-tree','-r','--name-only','main'],{cwd:root})).stdout;
  assert.doesNotMatch(mainFiles,/atgv-preview/);
  const refs=await repair.branches(root);
  assert.ok(refs.items.includes('main')&&refs.items.includes(result.branch));
  await repair.switchBranch(root,{branch:'main',expectedSha:result.sha});
  assert.equal((await developer.repository(root)).sha,before.sha);
  assert.equal((await developer.repository(root)).branch,'main');
 });
});
test('dirty checkout, stale commit and unexpected branch are rejected without mutation',async()=>{
 await fixture(async root=>{
  const before=await developer.repository(root);
  await assert.rejects(repair.createFixBranch(root,{expectedSha:'0'.repeat(40)}),/Git revision changed/);
  await assert.rejects(repair.switchBranch(root,{branch:'fake/unknown',expectedSha:before.sha}),/Select an existing local branch/);
  await fs.writeFile(path.join(root,'local-edits.txt'),'preserve me');
  await assert.rejects(repair.createFixBranch(root,{expectedSha:before.sha}),/local changes/);
  assert.equal((await developer.repository(root)).branch,'main');
  assert.equal(await fs.readFile(path.join(root,'local-edits.txt'),'utf8'),'preserve me');
 });
});
test('Mock Database only adds opt-in synthetic responses and never connects to Postgres',()=>{
 const ordinary=preview.render({source:'vite.config.ts',port:5173});
 const db=preview.render({source:'vite.config.ts',port:5173,mockDatabase:true});
 assert.doesNotMatch(ordinary,/APM-MOCK-1/);
 assert.match(db,/APM-MOCK-1/);
 assert.match(db,/GET \/api\/v1\/trm\/applications/);
 assert.match(db,/proxy: \{\}/);
 assert.match(db,/MOCK DATA - LOCAL PREVIEW/);
 assert.match(db,/status = 501/);
});
test('Custom Stack progress and branch/action controls are never hidden by the catalog renderer',()=>{
 const js=source('media/start.js'),html=source('src/lib/webview/dashboard-html.js'),css=source('media/start.css');
 const render=js.slice(js.indexOf("if(stackId==='custom'){",js.indexOf('function renderArchitectRequirements(project){')),js.indexOf("container.classList.toggle('hidden',!stack);",js.indexOf('function renderArchitectRequirements(project){')));
 assert.match(render,/architectCustomProgressPercent/);
 assert.doesNotMatch(render,/style.width='0%'/);
 // A single progress bar belongs in the Technology Stack header.
 assert.equal((html.match(/id="architectStackProgress"/g)||[]).length,1);
 assert.equal((html.match(/id="architectStackProgressFill"/g)||[]).length,1);
 assert.doesNotMatch(html,/id="architectCustomProgress(?:Fill|Text)?"/);
 for(const id of ['architectCustomActions','architectCustomFindings','architectCustomBranch','architectCustomSwitchBranch','architectCustomPull'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/architectCustomSetProgress\(100,'Repository scan \/ preparation complete \(not server startup\)'\)/);
 assert.match(js,/architectCustomFixBranch/);
 assert.match(js,/architectCustomSwitchBranch/);
 assert.match(js,/if\(m.type==='architectCustomProgress'\)/);
 assert.doesNotMatch(css,/\.atgv-custom-progress-wrap/);
 assert.doesNotMatch(js,/\$\('architectCustomProgress(?:Fill|Text)?'\)/);
});
test('Host branch and AI scan handlers require confirmation, SHA pinning and never push user project',()=>{
 const src=source('src/lib/runtime/extension-runtime.js');
 const a=src.slice(src.indexOf("case 'architectCustomScan':{"),src.indexOf("case 'architectCustomRun':{"));
 assert.match(a,/aiAnswer\(model,question/);
 assert.match(a,/roleSkillPrompt\('solution-architect'\)/);
 assert.match(a,/repair\.analyse\(root,detected\)/);
 assert.match(a,/repair\.createFixBranch\(root/);
 assert.match(a,/repair\.switchBranch\(root/);
 assert.match(a,/before\.sha!==msg\.expectedSha/);
 assert.match(a,/uiWarning\(label,\{modal:true\},action\)/);
 assert.match(a,/percent:15/);
 assert.doesNotMatch(a,/git\s+push|pushStory|publishBootstrap/);
});
