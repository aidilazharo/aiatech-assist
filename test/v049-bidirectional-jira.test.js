'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');
const br=require('../src/br-workflow');const {ProjectRegistry}=require('../src/projects');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const req=(scope='Staff only')=>({title:'Customer onboarding',objective:'Manage registrations',scope,acceptanceCriteria:'Every successful registration is recorded',features:[{title:'Identity check',description:'Validate account',stories:[{title:'Start registration',description:'Perform enrollment'}]}]});
async function fixture(run){const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv49-'));try{const r=new ProjectRegistry(home);await r.create({id:'demo',name:'Demo'});let s=await br.load(r,'demo');s=await br.imported(r,'demo',s.revision,{name:'r.pdf',digest:'c'.repeat(64)});s=await br.discoverySaved(r,'demo',s.revision,'D1');s=await br.reviewed(r,'demo',s.revision,{discoveryRevision:'D1',text:'Reviewed'});s=await br.generated(r,'demo',s.revision,{discoveryRevision:'D1',requirements:[req()]});s=await br.edit(r,'demo',s.revision,{brId:'BR-001',content:req()});s=await br.approve(r,'demo',s.revision,{brId:'BR-001',actor:'Owner'});const epic=br.plan(s).find(x=>x.path==='BR-001');const current=sha(JSON.stringify({summary:epic.title,description:epic.description}));s=await br.recorded(r,'demo',s.revision,{path:epic.path,action:'create',hash:epic.hash,key:'DEMO-15',kind:'Epic',title:epic.title,remoteDigest:current,issueType:'Epic'});return await run(r,s,current);}finally{await fs.rm(home,{recursive:true,force:true});}}
test('external JIRA edit is staged without overwriting approved BR and blocks dependent work',()=>fixture(async(r,s,current)=>{
 const original=JSON.stringify(s.brs[0].approvedContent);
 const changed=sha(JSON.stringify({summary:'External title',description:'External details'}));
 s=await br.recordInboundJira(r,'demo',s.revision,[{path:'BR-001',key:'DEMO-15',remoteDigest:changed,summary:'External title',description:'External details'}],'DEMO');
 assert.equal(s.inboundJira[0].status,'pending');assert.equal(s.brs[0].externalReviewRequired,true);
 assert.equal(JSON.stringify(s.brs[0].approvedContent),original);assert.equal(s.synced['BR-001'].remoteDigest,current);
 const {calculateReadiness}=require('../src/role-readiness');
 const result=calculateReadiness({enabled:['business-analyst','solution-architect'],roles:[{id:'business-analyst',label:'BA',tasks:[{id:'task'}]},{id:'solution-architect',label:'SA',tasks:[{id:'task'}]}],dependencies:{'solution-architect':['business-analyst']}},{},s,{});
 assert.ok(result.handoffs.find(x=>x.roleId==='solution-architect').items.some(x=>x.blockers.some(b=>/approval required|Revised BR/i.test(b))));
}));
test('external changes in another JIRA project are rejected',()=>fixture(async(r,s)=>{
 const changed='f'.repeat(64);
 await assert.rejects(br.recordInboundJira(r,'demo',s.revision,[{path:'BR-001',key:'OTHER-55',remoteDigest:changed,summary:'Bad'}],'DEMO'),/identity/);
 await assert.rejects(br.recordInboundJira(r,'demo',s.revision,[{path:'BR-001',key:'DEMO-15',remoteDigest:changed,summary:'Bad'}],'OTHER'),/project mismatch/);
}));
test('reconciliation cannot accept remote content inconsistent with an approved BR',()=>fixture(async(r,s)=>{
 const outside=sha('different issue content');s=await br.recordInboundJira(r,'demo',s.revision,[{path:'BR-001',key:'DEMO-15',remoteDigest:outside,summary:'Unapproved edit'}],'DEMO');
 await assert.rejects(br.reconcileApprovedJira(r,'demo',s.revision,{path:'BR-001',remoteDigest:outside,actor:'Owner'}),/does not match/);
 const next=await br.load(r,'demo');assert.equal(next.synced['BR-001'].remoteDigest!==outside,true);
}));
test('approved revision matching the live remote fingerprint can be reconciled without JIRA writes',()=>fixture(async(r,s)=>{
 const proposed=req('Employees and contractors');const desired={...req('Employees and contractors')};
 const summary='BR-001: '+desired.title;const description=[desired.objective,desired.scope,desired.acceptanceCriteria].join('\n\n');
 const outside=sha(JSON.stringify({summary,description}));
 s=await br.recordInboundJira(r,'demo',s.revision,[{path:'BR-001',key:'DEMO-15',remoteDigest:outside,summary,description}],'DEMO');
 s=await br.discoverySaved(r,'demo',s.revision,'D2');s=await br.reviewed(r,'demo',s.revision,{discoveryRevision:'D2',text:'Reviewed'});
 s=await br.generated(r,'demo',s.revision,{discoveryRevision:'D2',requirements:[proposed]});
 s=await br.edit(r,'demo',s.revision,{brId:'BR-001',content:proposed});s=await br.approve(r,'demo',s.revision,{brId:'BR-001',actor:'Owner'});
 s=await br.reconcileApprovedJira(r,'demo',s.revision,{path:'BR-001',remoteDigest:outside,actor:'Owner'});
 assert.equal(s.inboundJira[0].status,'reconciled');assert.equal(s.brs[0].externalReviewRequired,false);
 assert.equal(s.synced['BR-001'].remoteDigest,outside);
 assert.equal(br.plan(s).some(x=>x.path==='BR-001'),false);
}));
test('reverted JIRA edits release the blocked handoff without changing approved BRs',()=>fixture(async(r,s)=>{
 const before=JSON.stringify(s.brs[0].approvedContent);
 s=await br.recordInboundJira(r,'demo',s.revision,[{path:'BR-001',key:'DEMO-15',remoteDigest:'d'.repeat(64),summary:'Changed'}],'DEMO');
 s=await br.reconcileRevertedJira(r,'demo',s.revision,['BR-001']);
 assert.equal(s.brs[0].externalReviewRequired,false);assert.equal(s.inboundJira[0].status,'reverted');assert.equal(JSON.stringify(s.brs[0].approvedContent),before);
}));
test('JIRA UI and live checks protect issue markers, project, issue type and hierarchy',()=>{
 const html=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(html,/verifyLinkedJiraIdentity/);assert.match(html,/JIRA issue type changed/);assert.match(html,/JIRA parent relationship changed/);
 assert.match(html,/id="brJiraScanExternal"/);assert.match(ui,/renderInboundJira/);assert.match(html,/reconcileApprovedJira/);
});
