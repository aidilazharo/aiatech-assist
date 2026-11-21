'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const store=require('../src/source-store');
const br=require('../src/br-workflow');
const {ConfluenceSourceVault,validateManifest,isSafeRelative,validAttachmentId}=require('../src/confluence-source-vault');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const config={get:key=>({
 'jira.baseUrl':'https://example.atlassian.net','jira.email':'ba@example.com',
 'confluence.baseUrl':'https://example.atlassian.net/wiki','confluence.spaceKey':'QA',
 'confluence.spaceId':'55','confluence.parentPageId':''
})[key]||''};
function fakeConfluence(){
 const objects=new Map(),calls=[],page={id:'99',title:'ATGV · Source Vault · QA · demo',spaceId:'55',status:'current'};
 let pageCreated=false,nextId=100;
 const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 const handle=async(url,options={})=>{
  const u=new URL(url),m=options.method||'GET';
  calls.push({method:m,pathname:u.pathname});
  if(u.pathname==='/wiki/api/v2/spaces/55')return json({id:'55',key:'QA',name:'QA'});
  if(u.pathname==='/wiki/api/v2/pages'&&m==='GET')return json({results:pageCreated?[page]:[]});
  if(u.pathname==='/wiki/api/v2/pages'&&m==='POST'){pageCreated=true;return json(page);}
  if(u.pathname==='/wiki/rest/api/content/99/child/attachment'&&m==='GET')
   return json({results:[...objects.values()].map(x=>({id:x.id,title:x.name,version:{number:x.version}}))});
  if(u.pathname==='/wiki/rest/api/content/99/child/attachment'&&m==='POST'){
   assert.equal(options.headers['X-Atlassian-Token'],'nocheck');
   const file=options.body.get('file');assert.ok(file);
   const name=file.name,bytes=Buffer.from(await file.arrayBuffer());
   const prior=objects.get(name);
   objects.set(name,{id:prior?.id||'att'+String(nextId++),name,bytes,version:(prior?.version||0)+1});
   return json({results:[{id:objects.get(name).id,title:name}]});
  }
  const match=u.pathname.match(/^\/wiki\/rest\/api\/content\/99\/child\/attachment\/(att\d+|\d+)\/download$/);
  if(match){const obj=[...objects.values()].find(x=>x.id===match[1]);
   if(!obj)return new Response('Not found',{status:404});
   return new Response(obj.bytes,{status:200});
  }
  throw Error('Unexpected Confluence API call '+m+' '+u.pathname);
 };
 return {handle,objects,calls};
}
async function fixture(fn){
 const local=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-confluence-vault-a-'));
 const other=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-confluence-vault-b-'));
 try{
  const a=new ProjectRegistry(local),b=new ProjectRegistry(other);
  await a.create({id:'demo',name:'Demo'});await b.create({id:'demo',name:'Demo'});
  return await fn({a,b,local,other});
 }finally{
  await fs.rm(local,{recursive:true,force:true});
  await fs.rm(other,{recursive:true,force:true});
 }
}
test('Confluence vault uploads every original and related project upload, then auto-restores on a second computer',async()=>fixture(async({a,b,other})=>{
 const remote=fakeConfluence(),previous=global.fetch;
 global.fetch=remote.handle;
 try{
  const original=Buffer.from('%PDF-1.4\nATGV test original source\n%%EOF');
  const textDigest=sha('Extracted project BR source');
  const document={name:'project.pdf',digest:textDigest,characters:400,uploadedBy:'BA'};
  const originalPath=path.join(os.tmpdir(),'atgv-confluence-original-'+crypto.randomUUID()+'.pdf');
  await fs.writeFile(originalPath,original);
  try{document.storedName=await store.store(a,'demo',document,originalPath);}
  finally{await fs.rm(originalPath,{force:true});}
  let state=await br.load(a,'demo');
  state=await br.addSources(a,'demo',state.revision,[document],{singleSourceCycle:true});
  state=await br.write(a,'demo',state.revision,next=>{
   next.brs=[{id:'BR-012',status:'approved',title:'Project BR',approvedRevision:1,approvedContent:{
    title:'Project BR',objective:'Approve project',scope:'Portfolio',acceptanceCriteria:'Approved and recorded',features:[]},
    evidence:[{name:'project.pdf',digest:textDigest,verified:true}],source:{name:'project.pdf',digest:textDigest}}];
   next.synced={'BR-012':{key:'TC-712',kind:'Epic',hash:'f'.repeat(64)}};
  });
  const extra=path.join(path.dirname(a.fileFor('demo')),'documents','ux','prototype.png');
  await fs.mkdir(path.dirname(extra),{recursive:true});await fs.writeFile(extra,Buffer.from('PNGFIXTURE'));
  const first=new ConfluenceSourceVault({registry:a,projectId:'demo',config,token:'test-token'});
  const pushed=await first.sync();
  assert.equal(pushed.conflicts.length,0,JSON.stringify(pushed.conflicts));
  assert.equal(pushed.uploaded,3,'original PDF, UI/UX image, metadata manifest');
  assert.ok([...remote.objects.values()].every(x=>/^att\d+$/.test(x.id)),'test must use actual Cloud-style att-prefixed attachment IDs');
  const manifestName='ATGV-project-demo-source-state.json';
  assert.ok(remote.objects.has(manifestName));
  assert.ok(remote.objects.has(document.storedName));
  const second=new ConfluenceSourceVault({registry:b,projectId:'demo',config,token:'test-token'});
  const pulled=await second.sync();
  assert.equal(pulled.conflicts.length,0,JSON.stringify(pulled.conflicts));
  assert.equal(pulled.downloaded,2);
  assert.equal(pulled.restored,true);
  const restored=await br.load(b,'demo');
  assert.equal(restored.brs[0].id,'BR-012');
  assert.equal(restored.synced['BR-012'].key,'TC-712');
  assert.equal(restored.sourceDocuments[0].byteDigest,sha(original));
  const downloaded=await store.originalBytes(b,'demo',restored.sourceDocuments[0]);
  assert.deepEqual(downloaded,original);
  const extraCopy=await fs.readFile(path.join(other,'projects','demo','documents','ux','prototype.png'));
  assert.deepEqual(extraCopy,Buffer.from('PNGFIXTURE'));
  const secondTime=await second.sync();
  assert.equal(secondTime.conflicts.length,0);
  assert.equal(secondTime.downloaded,0,'unchanged local originals must not be downloaded again');
  assert.equal(secondTime.uploaded,0);
  // Verify a locally edited document is never overwritten by cloud data.
  await fs.writeFile(path.join(other,'projects','demo','documents','ux','prototype.png'),'LOCAL CHANGE');
  const conflicted=await second.sync();
  assert.ok(conflicted.conflicts.some(x=>/prototype/.test(x)));
  assert.equal(await fs.readFile(path.join(other,'projects','demo','documents','ux','prototype.png'),'utf8'),'LOCAL CHANGE');
 }finally{global.fetch=previous;}
}));
test('manifest rejects cross-project, cross-space, path traversal, and mismatched attachment identities',()=>{
 const raw={schema:1,projectId:'demo',spaceId:'55',register:{schema:1,brs:[],synced:{},links:{}},
  discovery:null,documents:[],files:[]};
 assert.deepEqual(validateManifest(raw,'demo','55'),raw);
 assert.throws(()=>validateManifest(raw,'other','55'),/invalid|another project/);
 assert.throws(()=>validateManifest(raw,'demo','99'),/invalid|another project/);
 assert.equal(isSafeRelative('../escape.png'),false);
 assert.equal(isSafeRelative('ux/a.png'),true);
 assert.throws(()=>validateManifest({...raw,files:[{relative:'../unsafe.png',byteDigest:'a'.repeat(64),attachment:'ATGV-'+'a'.repeat(64)+'.png'}]},'demo','55'),/invalid/);
});
test('Confluence attachment IDs support numeric and att-prefixed forms without accepting arbitrary paths',()=>{
 for(const id of ['123','000123','att123','att000123'])assert.equal(validAttachmentId(id),true,id);
 for(const id of ['',null,undefined,'att','attABC','ATT123','123/download','../123','att123?version=1','123%2F456','att-123',' 123 ','att123\\n'])assert.equal(validAttachmentId(id),false,String(id));
});
test('attachment download rejects malformed IDs before any network request',async()=>fixture(async({a})=>{
 let requests=0;
 const vault=new ConfluenceSourceVault({registry:a,projectId:'demo',config,token:'test-token',
  fetchImpl:async()=>{requests++;throw Error('Network should not be used for invalid IDs');}});
 await assert.rejects(()=>vault.download('99',{id:'att123/download'}),/Invalid Confluence attachment ID/);
 assert.equal(requests,0);
}));
test('runtime wires Confluence upload, new-machine recovery, five-minute retry and user-visible status',()=>{
 const host=require('node:fs').readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(host,/const \{ConfluenceSourceVault\}=require/);
 assert.match(host,/syncConfluenceSourceVault\(project\.id,'project-open'\)/);
 assert.match(host,/syncConfluenceSourceVault\(projectId,'uploaded-source'\)/);
 assert.match(host,/sourceVaultTimer=setInterval/);
 assert.match(host,/300000/);
 assert.match(host,/if\(result\.restored\)\{/);
 assert.match(ui,/m\.type==='confluenceSourceVault'/);
});

test('missing local Confluence baseline is reconstructed from identical verified content, not an invented hash',async()=>fixture(async({a,b})=>{
 const remote=fakeConfluence(),previous=global.fetch;global.fetch=remote.handle;
 try{
  const register=await br.load(a,'demo');
  await br.write(a,'demo',register.revision,next=>{
   next.brs=[{id:'BR-001',status:'draft',title:'Baseline test',features:[]}];
  });
  const localFile=path.join(path.dirname(a.fileFor('demo')),'documents','ux','reference.png');
  await fs.mkdir(path.dirname(localFile),{recursive:true});
  await fs.writeFile(localFile,Buffer.from('VERIFIED BASELINE IMAGE'));
  const first=new ConfluenceSourceVault({registry:a,projectId:'demo',config,token:'test-token'});
  const initial=await first.sync();
  assert.equal(initial.conflicts.length,0,JSON.stringify(initial.conflicts));
  const second=new ConfluenceSourceVault({registry:b,projectId:'demo',config,token:'test-token'});
  const downloaded=await second.sync();
  assert.equal(downloaded.restored,true);
  // Simulate an upgrade/reinstall losing only the local journal. The verified
  // content is still present, even though the restore audit event differs.
  await fs.rm(second.stateFile);
  const beforeWrites=remote.calls.filter(x=>x.method==='POST').length;
  const recovered=await second.sync();
  assert.equal(recovered.baselineRecovered,true,JSON.stringify(recovered));
  assert.deepEqual(recovered.conflicts,[]);
  assert.equal(recovered.uploaded,0);
  assert.equal(remote.calls.filter(x=>x.method==='POST').length,beforeWrites,'recovery is read-only');
  assert.ok(JSON.parse(await fs.readFile(second.stateFile,'utf8')).remoteHash);
  const next=await second.sync();
  assert.equal(next.conflicts.length,0,'recovered history prevents repeat false alarms');
  assert.equal(next.uploaded,0);
 }finally{global.fetch=previous;}
}));
test('genuinely different Confluence and local BRs remain protected without history',async()=>fixture(async({a,b})=>{
 const remote=fakeConfluence(),previous=global.fetch;global.fetch=remote.handle;
 try{
  let state=await br.load(a,'demo');
  state=await br.write(a,'demo',state.revision,next=>{
   next.brs=[{id:'BR-001',status:'draft',title:'REMOTE TITLE',features:[]}];
  });
  const proof=path.join(path.dirname(a.fileFor('demo')),'documents','ux','proof.png');
  await fs.mkdir(path.dirname(proof),{recursive:true});await fs.writeFile(proof,'REMOTE ORIGINAL');
  const first=new ConfluenceSourceVault({registry:a,projectId:'demo',config,token:'test-token'});
  await first.sync();
  const second=new ConfluenceSourceVault({registry:b,projectId:'demo',config,token:'test-token'});
  assert.equal((await second.sync()).restored,true);
  await fs.rm(second.stateFile);
  state=await br.load(b,'demo');
  await br.write(b,'demo',state.revision,next=>{next.brs[0].title='LOCAL EDIT';});
  const prior=Buffer.from(remote.objects.get('ATGV-project-demo-source-state.json').bytes);
  const conflicts=await second.sync();
  assert.equal(conflicts.baselineRecovered,undefined);
  assert.ok(conflicts.conflicts.some(x=>/Business Requirements/.test(x)),JSON.stringify(conflicts));
  assert.equal((await br.load(b,'demo')).brs[0].title,'LOCAL EDIT');
  assert.deepEqual(remote.objects.get('ATGV-project-demo-source-state.json').bytes,prior);
  assert.equal(await fs.readFile(proof,'utf8'),'REMOTE ORIGINAL');
 }finally{global.fetch=previous;}
}));
