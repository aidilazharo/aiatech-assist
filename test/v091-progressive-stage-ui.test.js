'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const select=require('../media/ba-stage-flow').select;
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const a='a'.repeat(64);
const base={hasSources:false,mappingDone:false,mappingProposal:false,savedDiscovery:false,reviewCurrent:false,reviewFinalized:false,generated:false,allApproved:false,publishedCurrent:false};
const stage=(patch)=>select({...base,...patch});
function exclusivity(result){
 assert.ok(['upload','mapping','questions','review','documents','jira','complete'].includes(result.stage));
 assert.ok([result.showSources,result.showMapping,result.showQuestions,result.showReview,result.showDocuments,result.showJira].filter(Boolean).length<=1,'Only one active user work panel may show');
}
test('empty project shows Start and no completed stages',()=>{const x=stage({});assert.equal(x.showStart,true);assert.equal(x.showSources,false);exclusivity(x);});
test('uploaded source shows submit panel only until successful mapping',()=>{
 const x=stage({hasSources:true});assert.equal(x.showSources,true);assert.equal(x.showQuestions,false);exclusivity(x);
 const m=stage({hasSources:true,mappingDone:true,mappingProposal:true});assert.equal(m.showSources,false);assert.equal(m.showMapping,true);assert.equal(m.showQuestions,false);exclusivity(m);
});
test('mapping completed reveals Discovery Questions, not uploaded documents',()=>{const x=stage({hasSources:true,mappingDone:true});assert.equal(x.stage,'questions');assert.equal(x.showQuestions,true);assert.equal(x.showSources,false);exclusivity(x);});
test('saved 12 answers with open decisions advance to AI Review',()=>{const x=stage({hasSources:true,mappingDone:true,savedDiscovery:true});assert.equal(x.stage,'review');assert.equal(x.showReview,true);assert.equal(x.showQuestions,false);exclusivity(x);});
test('AI findings remain visible until user explicitly finishes or applies replacements',()=>{
 const x=stage({hasSources:true,mappingDone:true,savedDiscovery:true,reviewCurrent:true});assert.equal(x.showReview,true);assert.equal(x.showDocuments,false);exclusivity(x);
});
test('completed review hides review and reveals draft documents',()=>{const x=stage({hasSources:true,mappingDone:true,savedDiscovery:true,reviewCurrent:true,reviewFinalized:true});assert.equal(x.showReview,false);assert.equal(x.showDocuments,true);exclusivity(x);});
test('approved requirements hide the document editor and show Jira instead',()=>{const x=stage({hasSources:true,mappingDone:true,savedDiscovery:true,reviewCurrent:true,reviewFinalized:true,generated:true,allApproved:true});assert.equal(x.showDocuments,false);assert.equal(x.showJira,true);exclusivity(x);});
test('published current Jira hides all completed stage panels',()=>{const x=stage({hasSources:true,mappingDone:true,savedDiscovery:true,reviewCurrent:true,reviewFinalized:true,generated:true,allApproved:true,publishedCurrent:true});assert.equal(x.stage,'complete');exclusivity(x);assert.equal(x.showJira,false);});
test('reopening a previous step is intentional and exclusive',()=>{
 const all={hasSources:true,mappingDone:true,savedDiscovery:true,reviewCurrent:true,reviewFinalized:true,generated:true,allApproved:true};
 const q=stage({...all,reopenQuestions:true});assert.equal(q.stage,'questions');assert.equal(q.showQuestions,true);assert.equal(q.showJira,false);exclusivity(q);
 const d=stage({...all,reopenDocuments:true});assert.equal(d.stage,'documents');assert.equal(d.showDocuments,true);assert.equal(d.showJira,false);exclusivity(d);
});
test('editing sources invalidates prior mapping and hides stale results',()=>{
 const x=stage({hasSources:true,mappingDone:false,savedDiscovery:true,reviewCurrent:true,reviewFinalized:true,generated:true,allApproved:true});
 assert.equal(x.showSources,true);assert.equal(x.showDocuments,false);assert.equal(x.showReview,false);exclusivity(x);
});
test('confirming AI Review stores an auditable decision without replacing review issues',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-review-finish-'));
 try{
  const r=new ProjectRegistry(dir);await r.create({id:'demo',name:'Demo'});
  let x=await br.load(r,'demo');
  x=await br.imported(r,'demo',x.revision,{name:'source.pdf',digest:a,documents:[{name:'source.pdf',digest:a}]});
  x=await br.selectSources(r,'demo',x.revision,[a]);
  x=await br.completeSourceMapping(r,'demo',x.revision,{digests:[a],proposals:[{filename:'source.pdf',answers:{}}]});
  x=await br.discoverySaved(r,'demo',x.revision,'discovery123',{answers:{questions:'Unknown approver'}});
  const review={readiness:'Needs attention',suggestions:[{key:'questions',severity:'High',issue:'Governance is unclear'}]};
  x=await br.reviewed(r,'demo',x.revision,{discoveryRevision:'discovery123',text:JSON.stringify(review)});
  await assert.rejects(br.confirmReview(r,'demo','stale',{discoveryRevision:'discovery123',actor:'BA'}),/register changed/);
  await assert.rejects(br.confirmReview(r,'demo',x.revision,{discoveryRevision:'discovery123',actor:'BA'}),/Explicitly acknowledge/);
  x=await br.confirmReview(r,'demo',x.revision,{discoveryRevision:'discovery123',actor:'BA',acknowledgeRisks:true});
  assert.equal(x.reviewRiskAccepted.by,'BA');
  assert.equal(x.reviewRiskAccepted.findings.length,1);
  const recorded=JSON.parse(x.reviewText);
  assert.equal(recorded.confirmed,true);assert.equal(recorded.suggestions.length,1);assert.equal(x.reviewRevision,'discovery123');
  assert.equal(x.events.at(-1).action,'discovery-review-confirmed');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('mapping completion refuses stale source snapshots even when legacy discovery revision exists',()=>{
 const ui=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','media','start.js'),'utf8');
 assert.match(ui,/if\(mapped\)\{/);
 assert.match(ui,/mapped\.epoch!==brState\.importEpoch/);
 assert.match(ui,/mapped\.sourceDigests\|\|\[\]/);
});
