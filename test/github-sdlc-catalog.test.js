'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const catalog=require('../src/github-sdlc-catalog');
const commitSha='c'.repeat(40),treeSha='a'.repeat(40);
function mockFiles(){
 const content={
  'catalog.json':JSON.stringify({schema:1,version:'1.2.3',roles:['business-analyst','developer'],techStacks:['react-node','dotnet']})+'\n',
  'roles/business-analyst/SKILL.md':'# Business Analyst\n',
  'roles/developer/SKILL.md':'# Developer\n',
  'tech-stacks/react-node/stack.yaml':'name: React Node\n',
  'tech-stacks/dotnet/stack.yaml':'name: DotNet\n',
  'tech-stacks/react-node/scaffold/package.json':'{}\n',
  'tech-stacks/dotnet/scaffold/Api.csproj':'<Project/>\n',
  'shared/workflows/review.yaml':'name: review\n',
  'shared/document-templates/business-requirements.md':'# Business Requirements\n'
 };
 const bySha=new Map();const tree=Object.entries(content).map(([key,value])=>{
  const buffer=Buffer.from(value),sha=catalog.blobSha(buffer);bySha.set(sha,buffer);
  return {path:key,sha,type:'blob',mode:'100644',size:buffer.length};
 });
 return {tree,bySha};
}
function network({mutate=tree=>tree,treeTruncated=false}={}){
 const {tree,bySha}=mockFiles(),requests=[];
 const route='https://api.github.com/repos/aia/atgv-sdlc-catalog';
 const request=async(url,options={})=>{
  requests.push({url,options});assert.ok(url.startsWith(route));
  assert.ok(!options.method||options.method==='GET','Catalog access must remain strictly read-only');
  if(url===route)return {full_name:'aia/atgv-sdlc-catalog',private:true};
  if(url.startsWith(route+'/commits/'))return {sha:commitSha,commit:{tree:{sha:treeSha}}};
  if(url.startsWith(route+'/git/trees/'))return {truncated:treeTruncated,tree:mutate(tree)};
  if(url.startsWith(route+'/git/blobs/')){
    const hash=url.split('/').at(-1),buffer=bySha.get(hash);
    if(!buffer)throw Error('Unexpected blob');
    return {encoding:'base64',content:buffer.toString('base64')};
  }
  throw Error('Unexpected GitHub API route: '+url);
 };
 return {request,requests,route};
}
const configuration={repositoryUrl:'https://github.com/aia/atgv-sdlc-catalog',ref:'v1.2.3',authentication:'token',autoCheck:true};

test('compares pinned GitHub VERSION and catalog.json before choosing a library',async()=>{
 const route='https://api.github.com/repos/aia/atgv-sdlc-catalog';
 const read=async(url,options={})=>{
  assert.ok(url.startsWith(route));assert.ok(!options.method||options.method==='GET');
  if(url===route)return {full_name:'aia/atgv-sdlc-catalog',private:true};
  if(url===route+'/commits/main')return {sha:commitSha,commit:{tree:{sha:treeSha}}};
  const file=url.split('/contents/')[1];
  const content=file==='VERSION?ref='+commitSha?'1.1.15\n':
    file==='catalog.json?ref='+commitSha?JSON.stringify({schema:1,version:'1.1.15'}):null;
  if(content===null)throw Error('Unexpected request '+url);
  return {type:'file',encoding:'base64',content:Buffer.from(content).toString('base64')};
 };
 const config={...configuration,ref:'main'};
 const current=await catalog.remoteVersion(config,'token',read);
 assert.equal(current.version,'1.1.15');
 assert.equal(current.sha,commitSha);
 const inconsistent=async(url,options)=>{
  const result=await read(url,options);
  if(url.includes('/contents/VERSION?'))return {...result,content:Buffer.from('1.1.14\n').toString('base64')};
  return result;
 };
 await assert.rejects(()=>catalog.remoteVersion(config,'token',inconsistent),/VERSION and catalog.json version do not match/);
});

test('validates central repository and rejects unsafe addresses and refs',()=>{
 assert.deepEqual(catalog.parseRepository('https://github.com/aia/atgv-sdlc-catalog.git'),{owner:'aia',repo:'atgv-sdlc-catalog'});
 for(const value of ['http://github.com/aia/test','https://evil.example/aia/test','https://github.com/aia/test?token=abc','https://github.com/aia/../../evil','https://github.com/aia/.git','https://someone@github.com/aia/test'])assert.throws(()=>catalog.parseRepository(value));
 for(const ref of ['../main','main//test','main?', '', 'a'.repeat(151)])assert.equal(catalog.normalizeConfig({...configuration,ref}).ref,'main');
 assert.equal(catalog.normalizeConfig({...configuration,ref:'main',authentication:'public'}).authentication,'public');
});

test('rejects symlinks, path traversal and overlarge downloaded content',async()=>{
 for(const bad of ['roles/../secrets','roles/\\secret','/etc/shadow','roles/test/./SKILL.md'])assert.throws(()=>catalog.validPath(bad));
 const net=network({mutate:tree=>tree.map(item=>item.path==='roles/developer/SKILL.md'?{...item,mode:'120000'}:item)});
 await assert.rejects(()=>catalog.getTree(configuration,'testtoken',net.request),/Symlinks/);
 const tooLarge=network({mutate:tree=>tree.map(item=>item.path==='catalog.json'?{...item,size:2*1024*1024}:item)});
 await assert.rejects(()=>catalog.getTree(configuration,'testtoken',tooLarge.request),/too large/);
});

test('pulls and pins a validated catalog in an isolated local cache using only read-only requests',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'catalog-pull-'));
 try{
  const net=network();const installed=await catalog.download(configuration,'myToken',root,{request:net.request});
  assert.equal(installed.version,'1.2.3');assert.equal(installed.roleCount,2);assert.equal(installed.stackCount,2);
  assert.equal(installed.workflows,1);assert.equal(installed.templates,1);
  assert.equal(installed.sha,commitSha);
  const saved=await catalog.cached(configuration,root);assert.deepEqual(saved,installed);
  const file=path.join(root,'sdlc-catalog','aia','atgv-sdlc-catalog',commitSha,'roles','developer','SKILL.md');
  assert.match(await fs.readFile(file,'utf8'),/Developer/);
  assert.equal(net.requests.every(req=>req.url.startsWith(net.route)),true);
  assert.deepEqual(await catalog.cached({...configuration,ref:'other'},root),installed); // All catalog references resolve to main.
  assert.equal(await catalog.cached({...configuration,repositoryUrl:'https://github.com/different/repo'},root),null);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('reuses verified installed revision on repeated pulls, without fetching blobs again',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'catalog-reuse-'));
 try{
  const net=network();await catalog.download(configuration,'token',root,{request:net.request});
  const before=net.requests.filter(x=>x.url.includes('/git/blobs/')).length;
  await catalog.download(configuration,'token',root,{request:net.request});
  assert.equal(net.requests.filter(x=>x.url.includes('/git/blobs/')).length,before);
  assert.equal((await catalog.cached(configuration,root)).sha,commitSha);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('refuses corrupted cached revision without overwriting it',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'catalog-integrity-'));
 try{
  const net=network();await catalog.download(configuration,'token',root,{request:net.request});
  const file=path.join(root,'sdlc-catalog','aia','atgv-sdlc-catalog',commitSha,'roles','developer','SKILL.md');
  await fs.writeFile(file,'# Changed!\n');
  await assert.rejects(()=>catalog.download(configuration,'token',root,{request:net.request}),/incomplete or altered/);
  assert.equal(await fs.readFile(file,'utf8'),'# Changed!\n');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('concurrent pulls of the same revision share one installation',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'catalog-race-'));
 try{
  const net=network();const [first,second]=await Promise.all([catalog.download(configuration,'token',root,{request:net.request}),catalog.download(configuration,'token',root,{request:net.request})]);
  assert.equal(first.sha,second.sha);
  assert.equal(net.requests.filter(x=>x.url.includes('/git/blobs/')).length,mockFiles().tree.length);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('rejects truncated GitHub trees and manifest missing required role skills',async()=>{
 await assert.rejects(()=>catalog.getTree(configuration,'token',network({treeTruncated:true}).request),/truncated/);
 const manifest=Buffer.from(JSON.stringify({schema:1,version:'1.0.0',roles:['unknown'],techStacks:['react-node']}));
 assert.throws(()=>catalog.inspectManifest(manifest,new Set(['tech-stacks/react-node/stack.yaml'])),/Missing roles/);
});

test('webview includes independent global catalog settings, controls and update feedback',async()=>{
 const html=await fs.readFile(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
 const script=await fs.readFile(path.join(__dirname,'..','media','start.js'),'utf8');
 for(const id of ['sdlcCatalogSection','catalogRepoUrl','catalogRef','catalogAuth','catalogAutoCheck','catalogTest','catalogPull','catalogCheck'])assert.ok(html.includes(`id="${id}"`),`Missing ${id}`);
 for(const action of ['catalogSave','catalogTest','catalogPull','catalogCheck'])assert.ok(script.includes(`send('${action}'`));
 assert.ok(html.includes('SDLC Catalog (Main)'));assert.ok(html.includes('AIA repository URL is suggested below.'));
});

test('supports catalog.yaml with simple roles and technology-stack identifiers',()=>{
 const content=Buffer.from('schema: 1\nversion: 2.0.0\nroles:\n  - business-analyst\n  - id: developer\ntechStacks:\n  - react-node\n');
 const parsed=catalog.inspectManifest(content,new Set(['roles/business-analyst/SKILL.md','roles/developer/SKILL.md','tech-stacks/react-node/stack.yaml','tech-stacks/react-node/scaffold/package.json']),'yaml');
 assert.deepEqual(parsed.roles,['business-analyst','developer']);assert.deepEqual(parsed.techStacks,['react-node']);
});
