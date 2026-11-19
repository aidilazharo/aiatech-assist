'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const fsAsync=require('node:fs/promises');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const preflight=require('../src/ba-document-preflight');
const code=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const SHA='a'.repeat(64);
const SRC='Create a person name using exactly 100 characters. Add namme using keyboard Tab, then press Enter. Records must persist after refresh.';
const ai=data=>JSON.stringify(data);
test('BA AI preflight checks RED/GREEN testability but does not claim to execute TDD',()=>{
 const p=preflight.prompt({text:SRC,name:'person.docx'});
 assert.match(p,/RED\/GREEN/);
 assert.match(p,/acceptance criteria/i);
 assert.match(p,/contradictions/i);
 assert.match(p,/keyboard/i);
 assert.match(p,/persistence/i);
 assert.match(p,/untrusted data/i);
 assert.match(p,/Never fabricate a requirement/i);
 assert.match(p,/do not claim that this preflight executes/i);
});
test('verified spelling corrections update the working copy, not the original',()=>{
 const response=ai({status:'ready',summary:'Source can be mapped',edits:[{before:'Add namme',after:'Add name',reason:'Obvious spelling correction'}],issues:[]});
 const result=preflight.parse(response,SRC);
 assert.equal(result.ready,true);
 assert.equal(result.applied.length,1);
 assert.equal(result.effectiveText,SRC.replace('Add namme','Add name'));
 assert.match(SRC,/Add namme using keyboard/);
 assert.equal(result.skipped.length,0);
 assert.deepEqual(result.applied[0],{before:'Add namme',after:'Add name',reason:'Obvious spelling correction'});
 assert.equal(preflight.evidence(result,SHA).originalPreserved,true);
});
test('ambiguous matches and unrecognized changes are never applied',()=>{
 assert.equal(preflight.safeEdit('namme','name','namme and namme'),false);
 assert.equal(preflight.safeEdit('active','inactive','active status'),false);
 assert.equal(preflight.safeEdit('must','may','must approve'),false);
 assert.equal(preflight.safeEdit('namme','name','different source'),false);
 assert.equal(preflight.safeEdit('namme','name','Enter namme'),true);
});
test('unsafe AI proposals changing requirements, limits, negation, identifiers or ambiguous text are ignored',()=>{
 const rows=[['100 characters','200 characters'],['must persist','may persist'],['press Enter','press Escape'],['Add namme','Add full name with passwords and role policies']];
 for(const [before,after] of rows)assert.equal(preflight.safeEdit(before,after,SRC),false,before);
 const result=preflight.parse(ai({status:'ready',summary:'Review warnings',edits:[{before:'100 characters',after:'200 characters',reason:'AI guessed a new limit'}],issues:[]}),SRC);
 assert.equal(result.applied.length,0);
 assert.equal(result.skipped.length,1);
 assert.match(result.effectiveText,/exactly 100 characters/);
 assert.match(result.issues.at(-1).detail,/not applied/i);
});
test('unresolved contradictions stop automatic progression; missing evidence is never invented',()=>{
 const result=preflight.parse(ai({status:'needs-input',summary:'Conflicting data retention',edits:[],issues:[{severity:'blocker',category:'contradiction',detail:'Delete both retains and removes the record',suggestion:'Ask BA to choose deletion behavior'}]}),SRC);
 assert.equal(result.ready,false);assert.equal(result.blockers.length,1);
 assert.equal(result.effectiveText,SRC);
 assert.equal(preflight.evidence(result,SHA).status,'needs-input');
});
test('invalid or oversized preflight AI response cannot corrupt source',()=>{
 for(const bad of ['{}','```json\nnot-json\n```',JSON.stringify({status:'ready',edits:[],issues:null})])assert.throws(()=>preflight.parse(bad,SRC));
});
test('preflight evidence atomically follows source mapping with original source digest',async()=>{
 const home=await fsAsync.mkdtemp(path.join(os.tmpdir(),'atgvba-preflight-'));
 try{
  const registry=new ProjectRegistry(home);await registry.create({id:'pf',name:'Preflight'});
  let state=await br.load(registry,'pf');
  state=await br.addSources(registry,'pf',state.revision,[{name:'person.pdf',digest:SHA,storedName:SHA+'.pdf',characters:235,uploadedBy:'BA'}]);
  const passed=preflight.parse(ai({status:'ready',summary:'TDD readiness checked',edits:[],issues:[]}),SRC);
  state=await br.commitSourceMapping(registry,'pf',state.revision,{digests:[SHA],proposals:[{filename:'person.pdf',answers:{problem:'Person name CRUD'}}],preflights:[preflight.evidence(passed,SHA)]});
  assert.equal(state.mappingCompleted.preflights.length,1);
  assert.equal(state.mappingCompleted.preflights[0].digest,SHA);
  assert.equal(state.mappingCompleted.preflights[0].originalPreserved,true);
  assert.equal(state.sourceDocuments[0].digest,SHA);
 }finally{await fsAsync.rm(home,{recursive:true,force:true});}
});
test('upload starts automatic preflight, bounded repair and mapping; UI continues to Map & Save 12',()=>{
 const host=code('test/generated/extension-source.txt'),ui=code('media/start.js');
 const importFn=host.slice(host.indexOf('async function importDiscoveryDocument'),host.indexOf('const successfulSourceMappings'));
 const mappingFn=host.slice(host.indexOf('async function processSelectedDiscoverySources'),host.indexOf('async function removeDiscoverySource'));
 assert.match(importFn,/autoMap=updatedDocuments\.length>0/);
 assert.match(importFn,/await processSelectedDiscoverySources\(/);
 assert.match(mappingFn,/baDocumentPreflight\.prompt/);
 assert.match(mappingFn,/if\(!result\?\.ready\)/);
 assert.match(mappingFn,/commitSourceMapping\(registry,run\.projectId,original\.revision,\{digests:selected,proposals:mappedProposals,preflights\}\)/);
 assert.match(ui,/m\.automatic&&view==='discovery'/);
 assert.match(ui,/openBAWorkflowStep\('mapping'\)/);
 assert.match(host,/id="baSourcePreflight"/);
 assert.doesNotMatch(importFn,/writeFile\([^)]*originalPath/);
});
