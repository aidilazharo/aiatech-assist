'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fss=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const runtime=require('../src/developer-br-pipeline');
const source=fss.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const client=fss.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const css=fss.readFileSync(path.join(__dirname,'../media/start.css'),'utf8');

test('BR-first UI exposes approved BR selection, 8 stages, actions, code, tests and logs',()=>{
 for(const id of ['developerBrSelect','developerBrStart','developerBrStop','developerBrOpenWorktree','developerBrOpenPreview','developerBrOutput'])assert.match(source,new RegExp('id="'+id+'"'));
 for(const label of ['Analyze BR','RED','GREEN','Refactor','Unit Tests','Build','Run Local','Verify'])assert.ok(source.includes(label));
 for(const tab of ['code','tests','logs'])assert.ok(source.includes('data-developer-br-tab="'+tab+'"'));
 assert.match(source,/id="developerManualTickets"/);
 assert.match(client,/brState\?\.brs/);
 assert.match(client,/send\('developerBrRun',\{brId:developerBrSelected\}\)/);
 assert.match(client,/onDeveloperBrMessage\(msg\)/);
 assert.match(css,/developer-br-steps\{grid-template-columns:repeat\(8/);
});
test('approved BR gate rejects drafts, stale revisions, missing content and invalid identities',()=>{
 const ok={id:'BR-007',status:'approved',needsRefresh:false,approvedRevision:1,approvedContent:{title:'Names'}};
 assert.equal(runtime.approvedBr({brs:[ok]},'BR-007'),ok);
 for(const change of [{status:'draft'},{needsRefresh:true},{approvedContent:null},{approvedRevision:0}])assert.throws(()=>runtime.approvedBr({brs:[{...ok,...change}]},'BR-007'));
 assert.throws(()=>runtime.approvedBr({brs:[ok]},'TC-400'));
});
test('generated files are strict UTF-8 JSON, deduplicated and path safe',()=>{
 const good=runtime.parseFileResponse(JSON.stringify({summary:'implemented',files:[{path:'src/names.ts',content:'export default 1;'}, {path:'tests/names.test.ts',content:'test("names",()=>{});'}]}));
 assert.equal(good.files.length,2);
 for(const bad of ['../x','/tmp/bad','C:/bad','.git/config','node_modules/evil.js','src/../../x','.env','.env.local','src/../api.js','credentials/token','foo\\..\\evil'])assert.throws(()=>runtime.safeRelative(bad),bad);
 assert.throws(()=>runtime.parseFileResponse('{broken'),/valid JSON/);
 assert.throws(()=>runtime.parseFileResponse(JSON.stringify({files:[{path:'src/feature.js',content:'export default true;'}]})),/unit-test file/);
 assert.throws(()=>runtime.parseFileResponse(JSON.stringify({files:[{path:'one.js',content:'a'},{path:'ONE.js',content:'b'}]})),/duplicate/);
 assert.throws(()=>runtime.parseFileResponse(JSON.stringify({files:[{path:'huge.txt',content:'x'.repeat(190000)}]})),/too large/);
 assert.equal(runtime.allowedPreviewUrl('https://external-site.example/'),'');
 assert.equal(runtime.allowedPreviewUrl('file:///tmp/secret'),'');
 assert.equal(runtime.allowedPreviewUrl('http://127.0.0.1:5173/'),'http://127.0.0.1:5173/');
});
test('isolated worktree writes do not modify approved checkout, and symlink overwrite is denied',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br55-'));
 const original=path.join(base,'repo');await fs.mkdir(original);
 const git=(...args)=>execFileSync('git',['-C',original,...args],{encoding:'utf8'}).trim();
 try{
  git('init','-b','main');git('config','user.email','test@example.invalid');git('config','user.name','Test User');
  await fs.writeFile(path.join(original,'app.txt'),'approved\n');git('add','app.txt');git('commit','-m','approved baseline');
  const sha=git('rev-parse','HEAD');
  const generated=await runtime.createWorktree({root:original,approvedSha:sha,baseDirectory:path.join(base,'trees'),brId:'BR-007'});
  await runtime.writeGenerated(generated.worktree,[{path:'app.txt',content:'generated\n'},{path:'src/name.js',content:'export const name=1;\n'}]);
  assert.equal(await fs.readFile(path.join(original,'app.txt'),'utf8'),'approved\n');
  assert.equal(await fs.readFile(path.join(generated.worktree,'app.txt'),'utf8'),'generated\n');
  assert.match(generated.branch,/^feature\/br-007-ai-/);
  await fs.symlink(path.join(original,'app.txt'),path.join(generated.worktree,'src','linked'));
  await assert.rejects(runtime.writeGenerated(generated.worktree,[{path:'src/linked',content:'danger'}]),/regular file/);
  assert.equal(await fs.readFile(path.join(original,'app.txt'),'utf8'),'approved\n');
 }finally{await fs.rm(base,{recursive:true,force:true});}
});
