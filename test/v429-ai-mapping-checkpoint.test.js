'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {ProjectRegistry}=require('../src/projects');
const checkpoints=require('../src/ba-mapping-checkpoint');
const digest=n=>String(n).repeat(64);
const secret=digest('f');
const meta={sourceDigest:digest('a'),textDigest:digest('b'),modelDigest:digest('c'),revision:'revision-1'};
async function project(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-ai-resume-'));
 try{const registry=new ProjectRegistry(dir);await registry.create({id:'demo',name:'Demo'});return await fn({registry,dir});}
 finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('checkpoint survives reload with section order and validated AI responses',()=>project(async({registry})=>{
 const saved=checkpoints.fresh(meta,['first ','second']);
 saved.preflight[digest('1')]='{"status":"ready","edits":[],"issues":[]}';
 saved.mapping[digest('2')]='{"problem":"Evidence"}';
 await checkpoints.save(registry,'demo',saved,secret);
 assert.deepEqual(await checkpoints.load(registry,'demo',meta,secret),saved);
 const file=path.join(path.dirname(registry.fileFor('demo')),'documents','requirements','ai-resume',meta.sourceDigest+'.json');
 if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o077,0);
 await checkpoints.remove(registry,'demo',meta.sourceDigest);
 assert.equal(await checkpoints.load(registry,'demo',meta,secret),null);
}));
test('changed source, revision or model never reuses a checkpoint',()=>project(async({registry})=>{
 await checkpoints.save(registry,'demo',checkpoints.fresh(meta,['source']),secret);
 for(const changed of [{...meta,textDigest:digest('d')},{...meta,revision:'revision-2'},{...meta,modelDigest:digest('e')}]){
  assert.equal(await checkpoints.load(registry,'demo',changed,secret),null);
 }
 assert.equal(await checkpoints.load(registry,'demo',meta,digest('0')),null);
}));
test('modified checkpoint data fails integrity authentication',()=>project(async({registry})=>{
 const saved=checkpoints.fresh(meta,['source']);saved.mapping[digest('1')]='original';
 await checkpoints.save(registry,'demo',saved,secret);
 const file=path.join(path.dirname(registry.fileFor('demo')),'documents','requirements','ai-resume',meta.sourceDigest+'.json');
 const record=JSON.parse(await fs.readFile(file,'utf8'));record.payload.mapping[digest('1')]='tampered';await fs.writeFile(file,JSON.stringify(record));
 assert.equal(await checkpoints.load(registry,'demo',meta,secret),null);
}));
test('invalid identities, unsafe records, and symlinks cannot be saved',()=>project(async({registry,dir})=>{
 assert.throws(()=>checkpoints.fresh({...meta,sourceDigest:'../unsafe'},['source']),/Invalid/);
 const saved=checkpoints.fresh(meta,['source']);saved.mapping['unsafe']='data';
 await assert.rejects(checkpoints.save(registry,'demo',saved,secret),/Invalid/);
 delete saved.mapping.unsafe;
 const folder=path.join(path.dirname(registry.fileFor('demo')),'documents','requirements','ai-resume');
 await fs.mkdir(path.dirname(folder),{recursive:true});await fs.symlink(dir,folder);
 await assert.rejects(checkpoints.save(registry,'demo',saved,secret),/Unsafe/);
}));
test('the mapping recovery control offers Resume AI Mapping for saved progress',()=>{
 const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 const a=ui.indexOf('function renderMappingRecovery(){'),b=ui.indexOf('function setDiscoveryImportBusy(',a);
 assert.ok(a>0&&b>a);const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,classList:{toggle(){},add(){}}});return nodes.get(id);};
 const vm=require('node:vm');
 const context={$:node,discoveryImportBusy:false,mappingRunPhase:'',mappingRetryAvailable:true,mappingResumeAvailable:true,
  brState:{revision:'R'},sourceSelectedDigests:new Set(['a']),selectedRole:'business-analyst',activeId:'demo',mappingFailureMessage:'Saved',hasDedicatedPreflightRecovery:()=>false};
 vm.runInNewContext(ui.slice(a,b)+'\nrenderMappingRecovery()',context);
 assert.equal(node('baMappingRetry').textContent,'Resume AI Mapping');assert.equal(node('baMappingRetry').disabled,false);
});
