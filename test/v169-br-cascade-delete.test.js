'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function fixture(run){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v169-cascade-'));
 try{const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});return await run(registry,root);}
 finally{await fs.rm(root,{recursive:true,force:true});}
}
function record(id,name,digest){return {id,title:name,objective:name,scope:'Test scope',acceptanceCriteria:'Test criterion',features:[],status:'approved',approvedRevision:1,approvedContent:{title:name,objective:name,scope:'Test scope',acceptanceCriteria:'Test criterion',features:[]},source:{name:name+'.pdf',digest},evidence:[{name:name+'.pdf',digest,verified:true}],needsRefresh:false};}
async function seed(registry){
 const one=sha('visitor'),two=sha('equipment');let state=await br.load(registry,'demo');
 state=await br.write(registry,'demo',state.revision,next=>{
  next.sourceDocuments=[{name:'Equipment.pdf',digest:two,storedName:two+'.pdf'}];
  next.archivedSources=[{name:'Visitor.pdf',digest:one,storedName:one+'.pdf',status:'archived'}];
  next.brs=[record('BR-007','Visitor',one),record('BR-008','Equipment',two)];
  next.synced={'BR-007':{key:'TC-274',hash:'hash1',kind:'Epic'},'BR-007/F-1':{key:'TC-275',hash:'hash2',kind:'Feature'},'BR-008':{key:'TC-300',hash:'hash3',kind:'Epic'}};
  next.completedCycles=[{id:'CYCLE-TEST',requirements:[{id:'BR-007',title:'Visitor',approvedContent:{title:'Visitor'}},{id:'BR-008',title:'Equipment',approvedContent:{title:'Equipment'}}]}];
  next.lastBrSequence=8;
 });
 return {state,one,two};
}
test('archived source deletion cascades only to linked BR, preserving other BR and remote Jira audit',()=>fixture(async registry=>{
 const {state,one}=await seed(registry);const impact=br.sourceDeletionImpact(state,one);
 assert.deepEqual(impact.requirements.map(item=>item.id),['BR-007']);
 assert.deepEqual(impact.jiraKeys.sort(),['TC-274','TC-275']);
 const updated=await br.forceDeleteArchivedSource(registry,'demo',state.revision,{digest:one,actor:'BA',expectedBrIds:['BR-007']});
 assert.deepEqual(updated.brs.map(x=>x.id),['BR-008']);
 assert.equal(updated.synced['BR-007'],undefined);assert.equal(updated.synced['BR-007/F-1'],undefined);
 assert.equal(updated.synced['BR-008'].key,'TC-300');
 assert.deepEqual(updated.completedCycles[0].requirements.map(x=>x.id),['BR-008']);
 assert.equal(updated.deletedRequirements.at(-1).id,'BR-007');
 assert.deepEqual(updated.deletedRequirements.at(-1).jiraIssues.map(x=>x.key).sort(),['TC-274','TC-275']);
 assert.equal(br.plan(updated).some(item=>item.path.startsWith('BR-007/')),false);
}));
test('source deletion rejects stale linked BR preview and pending Jira operations',()=>fixture(async registry=>{
 const {state,one}=await seed(registry);
 await assert.rejects(br.forceDeleteArchivedSource(registry,'demo',state.revision,{digest:one,expectedBrIds:[]}),/Linked BR list changed/);
 let modified=await br.write(registry,'demo',state.revision,next=>{next.pending['BR-007']={action:'create',hash:'x'};});
 await assert.rejects(br.forceDeleteArchivedSource(registry,'demo',modified.revision,{digest:one,expectedBrIds:['BR-007']}),/Jira publication is pending/);
 assert.equal((await br.load(registry,'demo')).brs.length,2);
}));
test('superseded earlier source does not delete BR tied to a newer verified revision',()=>fixture(async registry=>{
 const {state,one,two}=await seed(registry);
 const newer=sha('visitor-new');
 const next=await br.write(registry,'demo',state.revision,reg=>{
  reg.brs[0].evidence=[{name:'Visitor.pdf',digest:newer,verified:true}];
  reg.brs[0].source={name:'Visitor.pdf',digest:newer};
  reg.sourceDocuments.push({name:'Visitor.pdf',digest:newer,sourceId:'source-v',storedName:newer+'.pdf'});
  reg.archivedSources[0].sourceId='source-v';
 });
 const impact=br.sourceDeletionImpact(next,one);assert.deepEqual(impact.requirements,[]);
 const updated=await br.forceDeleteArchivedSource(registry,'demo',next.revision,{digest:one,expectedBrIds:[]});
 assert.equal(updated.brs.length,2);assert.equal(updated.synced['BR-007'].key,'TC-274');
 assert.equal(updated.sourceDocuments.some(x=>x.digest===newer),true);
 assert.equal(updated.sourceDocuments.some(x=>x.digest===two),true);
}));
test('published BR explicit deletion requires confirmed Jira list and removes its completed history only',()=>fixture(async registry=>{
 const {state}=await seed(registry);
 await assert.rejects(br.forceDeleteBusinessRequirement(registry,'demo',state.revision,{brId:'BR-007',expectedJiraKeys:[]}),/Linked Jira issues changed/);
 const updated=await br.forceDeleteBusinessRequirement(registry,'demo',state.revision,{brId:'BR-007',actor:'BA',expectedJiraKeys:['TC-274','TC-275']});
 assert.deepEqual(updated.brs.map(x=>x.id),['BR-008']);
 assert.equal(updated.deletedRequirements.at(-1).jiraIssues.length,2);
 assert.equal(updated.synced['BR-008'].key,'TC-300');
 assert.equal(updated.completedCycles[0].requirements.length,1);
}));
test('force deletion removes local BR exports without deleting unrelated BR export',()=>fixture(async registry=>{
 const {state}=await seed(registry);
 const folder=path.join(path.dirname(registry.fileFor('demo')),'documents','requirements');
 for(const rel of ['draft-brs/BR-007.md','approved-brs/BR-007-revision-1.md','approved-brs/BR-008-revision-1.md']){
  await fs.mkdir(path.dirname(path.join(folder,rel)),{recursive:true});await fs.writeFile(path.join(folder,rel),'test');
 }
 await br.forceDeleteBusinessRequirement(registry,'demo',state.revision,{brId:'BR-007',expectedJiraKeys:['TC-274','TC-275']});
 await br.removeBRExports(registry,'demo',['BR-007']);
 await assert.rejects(fs.stat(path.join(folder,'draft-brs/BR-007.md')),{code:'ENOENT'});
 await assert.rejects(fs.stat(path.join(folder,'approved-brs/BR-007-revision-1.md')),{code:'ENOENT'});
 assert.equal(await fs.readFile(path.join(folder,'approved-brs/BR-008-revision-1.md'),'utf8'),'test');
}));
test('Business Requirements deletion controls are present in webview and extension handler',()=>{
 const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 const ext=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(ui,/deleteBREverywhere/);assert.doesNotMatch(ui,/forceDeletePublishedBR/);
 assert.match(ext,/case 'forceDeletePublishedBR'/);assert.match(ext,/expectedBrIds:impact.requirements.map/);
});
test('AI repeats an unknown historical BR ID: draft records receive unique stable IDs and do not recycle deleted IDs',()=>fixture(async registry=>{
 let state=await br.load(registry,'demo');
 state=await br.imported(registry,'demo',state.revision,{name:'source.pdf',digest:'a'.repeat(64)});
 state=await br.discoverySaved(registry,'demo',state.revision,'D1');
 state=await br.skipReview(registry,'demo',state.revision,{discoveryRevision:'D1',actor:'BA'});
 state=await br.write(registry,'demo',state.revision,next=>{next.lastBrSequence=7;next.deletedRequirements=[{id:'BR-007',title:'Deleted',at:'previous'}];});
 state=await br.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[
  {id:'BR-007',title:'Visitor admission',objective:'Visitors must register before arrival',scope:'Visitor registration',acceptanceCriteria:'Each visitor can check in',features:[]},
  {id:'BR-007',title:'Equipment loan tracking',objective:'Employees must request loans',scope:'Asset checkout',acceptanceCriteria:'Equipment return is recorded',features:[]}
 ]});
 assert.deepEqual(state.brs.map(x=>x.id),['BR-008','BR-009']);
 assert.equal(state.deletedRequirements[0].id,'BR-007');
}));
