'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');const {ensureWorkspaceLibrary,scaffoldProject}=require('../src/tech-stacks');
const workflow=require('../src/br-workflow');const progress=require('../media/ba-progress');
const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const frontend=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v145-'));try{const registry=new ProjectRegistry(root);const project=await registry.create({id:'cockpit',name:'Cockpit'});await ensureWorkspaceLibrary(root);await scaffoldProject(root,project);return await fn(registry);}finally{await fs.rm(root,{recursive:true,force:true});}}
const mk=(name,d)=>({name,digest:d,byteDigest:d,characters:150,storedName:d+'.pdf',uploadedBy:'BA'});
const req={title:'Visitor registration',objective:'Visitor registration and arrival',scope:'Visitors and guards',acceptanceCriteria:'Register and check in',features:[]};
test('new start step precedes existing nine steps and preserves all nine gates',()=>{const p=progress.derive({});assert.equal(p.length,10);assert.equal(p[0].key,'start');assert.equal(p[0].state,'warning');assert.equal(p[1].key,'upload');assert.equal(p[1].state,'pending');const started=progress.derive({started:true});assert.equal(started[0].complete,true);assert.equal(started[1].current,true);assert.equal(progress.derive({published:true,started:true}).length,10);});
test('completed record history is flat and keeps controls, Jira references and Start safeguards',()=>{assert.match(host,/<div id="baCompletedSection" class="ba-completed-flat"/);assert.doesNotMatch(host,/Completed Business Requirements<\/strong>/);assert.match(host,/id="discoveryStepStart"/);for(const id of ['baEditDiscovery','baReviewDocuments'])assert.doesNotMatch(host,new RegExp('id="'+id+'"'));assert.doesNotMatch(host,/id="baUpdateSources"/);assert.match(frontend,/function renderBACompletedRecords/);assert.match(frontend,/baPublishedCurrent\(\)\?actions/);assert.match(frontend,/\$\('baNewRequirement'\)\.disabled=displayed!=='start'\|\|!activeId\|\|!brState/);assert.match(frontend,/renderCompletedJiraTable/);});
test('start of a new cycle preserves approved old BR and entire Jira hierarchy without retirement',()=>fixture(async(registry)=>{
 let r=await workflow.load(registry,'cockpit');r=await workflow.addSources(registry,'cockpit',r.revision,[mk('visitor.pdf','a'.repeat(64))]);
 r=await workflow.write(registry,'cockpit',r.revision,next=>{next.importEpoch=1;next.discoveryRevision='discovery-1';next.reviewRevision='discovery-1';next.reviewText='Reviewed';next.discoveryAnswers={problem:'Register visitors'};next.brs=[{id:'BR-001',status:'approved',title:req.title,approvedContent:req,approvedRevision:1,needsRefresh:false,source:{name:'visitor.pdf',digest:'a'.repeat(64)},evidence:[{digest:'a'.repeat(64)}]}];next.synced={'BR-001':{key:'TC-100',hash:'abc',kind:'Epic',title:'Visitor registration'}};});
 assert.equal(workflow.plan(r).length,1,'fixture hash not an actual Jira plan hash is fine before restart');
 r=await workflow.startOrRestart(registry,'cockpit',r.revision,{actor:'Business Analyst'});
 assert.equal(r.completedCycles.length,1);assert.equal(r.completedCycles[0].requirements[0].jiraKey,'TC-100');assert.equal(r.completedCycles[0].sources[0].name,'visitor.pdf');assert.equal(r.completedCycles[0].discoveryAnswers.problem,'Register visitors');assert.equal(r.brs[0].status,'approved');assert.equal(r.brs[0].archivedFromRestart,true);assert.equal(r.brs[0].needsRefresh,false);assert.equal(r.synced['BR-001'].key,'TC-100');assert.equal(r.sourceDocuments.length,0);assert.equal(r.restartPending,true);assert.ok(!workflow.plan(r).some(item=>item.action==='retire'));
 r=await workflow.addSources(registry,'cockpit',r.revision,[mk('equipment.pdf','b'.repeat(64))]);assert.equal(r.brs[0].archivedFromRestart,true);assert.equal(r.sourceDocuments[0].version,1);assert.ok(!workflow.plan(r).some(item=>item.action==='retire'));
}));
test('revised historical source reactivates only its matching approved BR and keeps stable Jira key',()=>fixture(async(registry)=>{
 let r=await workflow.load(registry,'cockpit');r=await workflow.addSources(registry,'cockpit',r.revision,[mk('visitor.pdf','a'.repeat(64))]);r=await workflow.write(registry,'cockpit',r.revision,next=>{next.brs=[{id:'BR-001',status:'approved',approvedContent:req,needsRefresh:false,source:{name:'visitor.pdf'},evidence:[{digest:'a'.repeat(64)}]},{id:'BR-002',status:'approved',approvedContent:{...req,title:'Equipment management'},needsRefresh:false,archivedFromRestart:true,source:{name:'equipment.pdf'}}];next.synced={'BR-001':{key:'TC-100',hash:'abc'}};});
 r=await workflow.startOrRestart(registry,'cockpit',r.revision);
 r=await workflow.addSources(registry,'cockpit',r.revision,[mk('visitor.pdf','b'.repeat(64))]);
 assert.equal(r.brs[0].archivedFromRestart,false);assert.equal(r.brs[0].needsRefresh,true);assert.equal(r.brs[1].archivedFromRestart,true);assert.equal(r.synced['BR-001'].key,'TC-100');assert.ok(!workflow.plan(r).some(x=>x.action==='retire'));
}));
test('independent new document creates a new BR and only a new Jira Epic without changing archived Jira',()=>fixture(async(registry)=>{
 let r=await workflow.load(registry,'cockpit');r=await workflow.addSources(registry,'cockpit',r.revision,[mk('visitor.pdf','a'.repeat(64))]);
 r=await workflow.write(registry,'cockpit',r.revision,next=>{next.brs=[{id:'BR-001',status:'approved',title:req.title,approvedContent:req,needsRefresh:false,source:{name:'visitor.pdf'},evidence:[{digest:'a'.repeat(64)}]}];next.synced={'BR-001':{key:'TC-100',hash:'legacy-but-preserved',kind:'Epic'}};});
 r=await workflow.startOrRestart(registry,'cockpit',r.revision);
 r=await workflow.addSources(registry,'cockpit',r.revision,[mk('equipment.pdf','b'.repeat(64))]);
 r=await workflow.write(registry,'cockpit',r.revision,next=>{next.importEpoch=Math.max(next.importEpoch,1);next.importName='equipment.pdf';next.importDigest='b'.repeat(64);next.discoveryRevision='new-discovery';next.reviewRevision='new-discovery';next.reviewText='Reviewed';});
 const equipment={title:'Equipment loan management',objective:'Loan and return of IT assets',scope:'Employees and device owners',acceptanceCriteria:'Track checkout and return',features:[]};
 r=await workflow.generated(registry,'cockpit',r.revision,{discoveryRevision:'new-discovery',requirements:[equipment]});
 assert.equal(r.brs.length,2);assert.equal(r.brs[0].id,'BR-001');assert.equal(r.brs[0].status,'approved');assert.equal(r.brs[1].id,'BR-002');assert.equal(r.brs[1].status,'draft');
 r=await workflow.edit(registry,'cockpit',r.revision,{brId:'BR-002',content:equipment});
 r=await workflow.approve(registry,'cockpit',r.revision,{brId:'BR-002'});
 assert.deepEqual(workflow.plan(r).map(x=>({path:x.path,action:x.action})),[{path:'BR-002',action:'create'}]);
 assert.equal(r.synced['BR-001'].key,'TC-100');
}));
