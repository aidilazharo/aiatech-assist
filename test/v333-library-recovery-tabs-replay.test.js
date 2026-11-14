'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const image=require('../src/agent-image-test');const related=require('../src/agent-resource-tabs');
const fsSync=require('node:fs');
async function write(root,p,data){const file=path.join(root,p);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof data==='string'?data:JSON.stringify(data));}
test('agent tabs follow its role skill, workflow and precisely referenced specialist instructions',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-tabs-'));
 try{
  const agent={id:'git-agent',roleSkill:'roles/software-developer/SKILL.md',workflows:['library-contribution']};
  await write(dir,'ai-harness/agents/git-agent.json',agent);
  await write(dir,'roles/software-developer/SKILL.md','# Developer');
  await write(dir,'ai-harness/workflows/library-contribution.json',{id:'library-contribution',agent:'git-agent',steps:[{skills:['git-pull-request']}]});
  await write(dir,'ai-harness/skills/git-pull-request/SKILL.md','# Git PR');
  await write(dir,'ai-harness/skills/git-pull-request/skill.json',{id:'git-pull-request',version:'1.0.0'});
  await write(dir,'ai-harness/policies/guardrails.json',{schema:1});
  const list=await related.relatedFiles({root:dir,relative:'ai-harness/agents/git-agent.json',content:JSON.stringify(agent)});
  for(const expected of ['ai-harness/agents/git-agent.json','roles/software-developer/SKILL.md','ai-harness/workflows/library-contribution.json','ai-harness/skills/git-pull-request/SKILL.md','ai-harness/skills/git-pull-request/skill.json','ai-harness/policies/guardrails.json'])assert.ok(list.some(x=>x.path===expected),expected);
  assert.equal(new Set(list.map(x=>x.path)).size,list.length);
  assert.deepEqual(await related.relatedFiles({root:dir,relative:'docs/bad.md'}),[]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('replay executes only the trusted sanitized SVG renderer and records an exact match',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-replay-'));
 try{
  const result=image.makeRecord({agentPath:'ai-harness/agents/git-agent.json',prompt:'blue circle',model:'Model A',target:{kind:'vscode',vendor:'test'},spec:image.parseSpec('{"shape":"circle","color":"blue","background":"white"}'),startedAt:new Date().toISOString(),durationMs:21});
  await image.record(dir,result);
  const attempt=await image.replay(dir,result.id,result.agentPath);
  assert.equal(attempt.svg,result.svg);assert.ok(attempt.result.codeReplay.matched);
  assert.match(attempt.result.codeReplay.sha256,/^[a-f0-9]{64}$/);
  await assert.rejects(image.replay(dir,result.id,'ai-harness/agents/another.json'),/not found/);
  const history=await image.history(dir);history[0].svg='<svg>altered</svg>';
  await fs.writeFile(path.join(dir,'agent-image-tests/history.json'),JSON.stringify(history));
  await assert.rejects(image.replay(dir,result.id,result.agentPath),/no longer matches/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('extension verifies CodeMirror readiness, self-repairs once, and reports actual cache error',()=>{
 const host=fsSync.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const client=fsSync.readFileSync(path.join(__dirname,'../media/library-studio.js'),'utf8');
 const vendor=fsSync.readFileSync(path.join(__dirname,'../src/catalog-vendor-libraries.js'),'utf8');
 assert.match(client,/send\('libraryWebviewBoot',\{hasCodeMirror:!!cm,loadErrors:window\.atgvLibraryAssetFailures\|\|\[\]\}\)/);
 assert.match(host,/vendorWebviewReady=!!msg\.hasCodeMirror/);
 assert.match(host,/vendorBootRecoveryCount<1/);
 assert.match(host,/type:'libraryEditorHealth'/);
 assert.match(vendor,/\.invalid-.*crypto\.randomUUID/);
 assert.match(client,/CodeMirror unavailable/);
 assert.doesNotMatch(host,/Optional editor libraries are not active in this window/);
});
test('agent tabs and safe image-source replay are present in the webview and require trusted host mediation',()=>{
 const host=fsSync.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const ui=fsSync.readFileSync(path.join(__dirname,'../media/library-studio.js'),'utf8');
 for(const s of ['id="libraryRelatedTabs"','id="libraryImageReplay"','Run image-generation code'])assert.ok(host.includes(s),s);
 assert.match(ui,/function showRelatedTabs\(\)/);
 assert.match(ui,/rootPath:state\.relatedRoot/);
 assert.match(ui,/send\('libraryImageReplay',\{path:state\.selected\.path,id:result\.id,svgDraft:/);
 assert.match(host,/imageBenchmark\.replay\(/);
 assert.doesNotMatch(ui,/new Function\(|eval\(/);
});
