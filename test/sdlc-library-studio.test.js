'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const library=require('../src/sdlc-library-studio');
const repo='https://github.com/example/shared-sdlc';
const role='roles/software-developer/SKILL.md';
const skill='ai-harness/skills/dev-tdd-repair/SKILL.md';
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-library-'));const catalog=path.join(root,'catalog'),storage=path.join(root,'private'),workspace=path.join(root,'workspace');await fs.mkdir(path.join(catalog,'roles','software-developer'),{recursive:true});await fs.mkdir(path.join(catalog,'ai-harness','skills','dev-tdd-repair'),{recursive:true});await fs.mkdir(workspace);await fs.writeFile(path.join(catalog,role),'# Developer\nDo not weaken locked acceptance tests.\n');await fs.writeFile(path.join(catalog,skill),'# Repair\nFollow approved BR and preserve passing source.\n');try{await fn({root,catalog,storage,workspace});}finally{await fs.rm(root,{recursive:true,force:true});}}
const opts=({catalog,storage,workspace})=>({root:catalog,storage,workspace,repositoryUrl:repo});
test('library paths are constrained to known data resources and reject traversal',()=>{
 for(const bad of ['../../a','/etc/passwd','roles/../secret.md','roles\\developer\\SKILL.md','test/generated/extension-source.txt','roles/.git/config','roles/demo/.evil','roles/x/no.exe','roles//SKILL.md'])assert.throws(()=>library.validResource(bad));
 assert.equal(library.validResource(role),role);
 assert.equal(library.customResource('ai-harness/skills/custom/team-tdd/SKILL.md'),true);
 assert.equal(library.customResource('roles/software-developer/SKILL.md'),false);
});
test('lists catalog SDLC role and harness skills, without including unsafe files',async()=>fixture(async ctx=>{
 const {items,categories}=await library.listing({...opts(ctx),type:'All'});
 assert.ok(items.some(i=>i.path===role&&i.category==='SDLC Skills'));
 assert.ok(items.some(i=>i.path===skill&&i.category==='AI Skills'));
 assert.ok(categories.includes('SDLC Templates'));
 const filtered=await library.listing({...opts(ctx),query:'repair'});
 assert.equal(filtered.total,1);
}));
test('isolated local override saves, reports updates and restores without changing shared source',async()=>fixture(async ctx=>{
 const base=opts(ctx);const original=await library.resource({...base,relative:skill,scope:'user'});
 assert.equal(original.hasLocal,false);
 const improved='# Repair\nDiagnose real Express POST routes and keep locked test files.\n';
 const changed=await library.save({...base,relative:skill,scope:'user',content:improved,expectedHash:original.hash});
 assert.equal(changed.hasLocal,true);assert.equal(changed.content,improved);
 assert.match(await fs.readFile(path.join(ctx.catalog,skill),'utf8'),/Follow approved BR/);
 assert.equal((await library.resolvedText({...base,relative:skill})).source,'user');
 await assert.rejects(library.save({...base,relative:skill,scope:'user',content:'# Longer content to test optimistic concurrency conflict.\n',expectedHash:original.hash}),/changed since opening/);
 await fs.writeFile(path.join(ctx.catalog,skill),'# New shared version\nNew upstream workflow guidance.\n');
 const update=await library.resource({...base,relative:skill,scope:'user'});
 assert.equal(update.updateAvailable,true);
 const restored=await library.revert({...base,relative:skill,scope:'user',expectedHash:update.hash});
 assert.equal(restored.hasLocal,false);
}));
test('user and project overrides are isolated and project takes precedence',async()=>fixture(async ctx=>{
 const base=opts(ctx);const v=await library.resource({...base,relative:role,scope:'user'});
 await library.save({...base,relative:role,scope:'user',expectedHash:v.hash,content:'# User\nMy user-level BA instructions.\n'});
 const project=await library.resource({...base,relative:role,scope:'project'});
 await library.save({...base,relative:role,scope:'project',expectedHash:project.hash,content:'# Project\nMy project-level instructions.\n'});
 const resolved=await library.resolvedText({...base,relative:role});
 assert.match(resolved.text,/Project/);assert.equal(resolved.source,'project');
 const list=await library.listing({...base});assert.ok(list.items.find(i=>i.path===role).projectOverride);
}));
test('validates JSON and rejects symlinked override directories',async()=>fixture(async ctx=>{
 assert.throws(()=>library.validateBody('ai-harness/agents/git-agent.json','{not-json}'),/Invalid JSON/);
 assert.throws(()=>library.validateBody(skill,' '),/empty/);
 const base=opts(ctx),state=await library.resource({...base,relative:skill,scope:'user'});
 const override=library.storageRoot({...base,scope:'user'});await fs.mkdir(override,{recursive:true});
 await fs.symlink(ctx.catalog,path.join(override,'ai-harness'));
 await assert.rejects(library.save({...base,relative:skill,scope:'user',content:'# Test\nA useful developer skill with guardrails.\n',expectedHash:state.hash}),/Unsafe/);
}));
test('Git Agent creates isolated draft PR without mutating main or logging token',async()=>fixture(async ctx=>{
 const original=await fs.readFile(path.join(ctx.catalog,skill),'utf8');const baseHash=library.hash(original);
 const calls=[],originalFetch=global.fetch;
 global.fetch=async(url,options)=>{
  calls.push({url,method:options.method,body:options.body?JSON.parse(options.body):null,auth:options.headers.Authorization});
  let value={};const endpoint=url.replace('https://api.github.com/repos/example/shared-sdlc','');
  if(endpoint==='')value={default_branch:'main'};
  else if(endpoint.startsWith('/contents/')&&options.method==='GET')value={type:'file',sha:'blob1',content:Buffer.from(original).toString('base64')};
  else if(endpoint==='/git/ref/heads/main')value={object:{sha:'a'.repeat(40)}};
  else if(endpoint==='/git/refs')value={ref:options.body};
  else if(endpoint.startsWith('/contents/')&&options.method==='PUT')value={commit:{sha:'b'.repeat(40)}};
  else if(endpoint==='/pulls')value={html_url:'https://github.com/example/shared-sdlc/pull/42',number:42};
  else throw Error('Unexpected GitHub request: '+endpoint);
  return {ok:true,status:200,text:async()=>JSON.stringify(value)};
 };
 try{
  const pr=await library.githubPullRequest({repositoryUrl:repo,relative:skill,content:'# Repair\nA revised prompt with additional route diagnostics.\n',baseHash,token:'test-token',title:'Improve repair'});
  assert.equal(pr.number,42);assert.equal(pr.status,'draft');assert.equal(calls.some(c=>c.method==='PUT'&&c.body.branch!==undefined),true);
  assert.equal(calls.some(c=>c.method==='POST'&&c.url.endsWith('/pulls')&&c.body.draft===true),true);
  assert.equal(calls.some(c=>c.method==='PUT'&&c.body.branch==='main'),false);
 }finally{global.fetch=originalFetch;}
}));
