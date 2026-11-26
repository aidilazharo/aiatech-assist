'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const pipeline=require('../src/ux-design-pipeline');
const source=require('../src/ux-ticket-designs');
const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const css=require('node:fs').readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
const sample={title:'Loan app',summary:'Asset loans',screens:[{name:'Equipment loan form',purpose:'Submit a request',components:['Equipment ID input','Submit button'],interactions:['Submit request','Show validation errors']},{name:'Status',purpose:'Track approved requests',components:['Status table','Back button'],interactions:['Return to request']}],flows:['Request','Submit'],questions:[],assumptions:[]};
const flow={title:'Equipment loan',nodes:[{id:'start',label:'Start',kind:'start'},{id:'enter',label:'Enter equipment details',kind:'action'},{id:'done',label:'Submission result',kind:'end'}],edges:[{from:'start',to:'enter'},{from:'enter',to:'done',label:'Valid'}]};
const meta=(name='First Designer')=>({designer:name,aiModel:'Test model',sourceBRHash:'a'.repeat(64),designReferenceHash:'b'.repeat(64),wireframeRevision:'w',mockupRevision:'m',jiraUpdated:'2026-11-09T01:00:00Z'});
async function withRoot(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v231-'));try{return await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('empty UI/UX design includes six real ordered stages',()=>withRoot(async(root)=>{
 const empty=await pipeline.read(root,'TC-392');assert.equal(empty.status,'not-started');assert.equal(empty.exists,false);assert.equal(empty.steps.length,6);
 assert.deepEqual(empty.steps,['Upload Design Reference','User Flow','Wireframe','UI Mockup','Interactive Prototype','Developer Handoff']);
}));
test('generation creates local prototype, draft handoff and durable revision metadata',()=>withRoot(async(root)=>{
 const v1=await pipeline.generate(root,'TC-392',{flow,wireframe:sample,mockup:sample},'',meta());
 assert.equal(v1.revisionNumber,1);assert.equal(v1.status,'review');assert.equal(v1.designer,'First Designer');
 assert.match(v1.generatedAt,/^\d{4}-\d{2}-\d{2}T/);
 assert.equal(v1.prototype.screens.length,2);assert.equal(v1.prototype.screens[0].next,'screen-2');
 assert.equal(v1.handoff.status,'draft-pending-designer-approval');
 assert.equal(v1.handoff.jiraKey,'TC-392');assert.equal(v1.handoff.screenNames[0],'Equipment loan form');
 assert.equal((await pipeline.read(root,'TC-392')).revision,v1.revision);
 assert.equal(JSON.parse(await fs.readFile(path.join(root,'documents/jira-designs/TC-392/ui-ux-workflow-v1.json'),'utf8')).designer,'First Designer');
}));
test('approval requires a human reviewer, and handoff is only ready after approval',()=>withRoot(async(root)=>{
 const initial=await pipeline.generate(root,'TC-392',{flow,wireframe:sample,mockup:sample},'',meta());
 await assert.rejects(pipeline.decide(root,'TC-392','approved',initial.revision,''),/verified reviewer identity/);
 const approved=await pipeline.decide(root,'TC-392','approved',initial.revision,'Design Reviewer');
 assert.equal(approved.status,'approved');assert.equal(approved.reviewedBy,'Design Reviewer');assert.equal(approved.handoff.status,'approved-ready-for-developer-handoff');
 assert.equal(approved.revisionNumber,1);
 await assert.rejects(pipeline.decide(root,'TC-392','approved',initial.revision,'Other Designer'),/changed/);
}));
test('disapproval requires a reason and allows regeneration as a new immutable version',()=>withRoot(async(root)=>{
 const v1=await pipeline.generate(root,'TC-392',{flow,wireframe:sample,mockup:sample},'',meta());
 await assert.rejects(pipeline.decide(root,'TC-392','rejected',v1.revision,'Reviewer',''),/reason/);
 const denied=await pipeline.decide(root,'TC-392','rejected',v1.revision,'Reviewer','Improve empty state');
 assert.equal(denied.status,'rejected');assert.match(denied.reviewReason,/Improve empty state/);
 const v2=await pipeline.generate(root,'TC-392',{flow,wireframe:sample,mockup:sample},denied.revision,meta('Second Designer'));
 assert.equal(v2.revisionNumber,2);assert.equal(v2.status,'review');assert.equal(v2.designer,'Second Designer');
 assert.deepEqual(v2.history.map(x=>[x.version,x.status,x.designer]),[[1,'rejected','First Designer']]);
 assert.equal(JSON.parse(await fs.readFile(path.join(root,'documents/jira-designs/TC-392/ui-ux-workflow-v1.json'),'utf8')).designer,'First Designer');
}));
test('flow validation prevents invalid graph and storage path traversal',async()=>{
 assert.throws(()=>pipeline.validFlow({nodes:[{id:'s',label:'Start'},{id:'s',label:'Another'}],edges:[]}),/unique/);
 assert.throws(()=>pipeline.validFlow({nodes:[{id:'start',label:'Start'}],edges:[{from:'start',to:'missing'}]}),/missing/);
 await withRoot(root=>assert.rejects(pipeline.generate(root,'../../elsewhere',{flow,wireframe:sample,mockup:sample},'',meta())));
});
test('stale versions are rejected for regenerate and review actions',()=>withRoot(async(root)=>{
 const v1=await pipeline.generate(root,'TC-392',{flow,wireframe:sample,mockup:sample},'',meta());
 await assert.rejects(pipeline.generate(root,'TC-392',{flow,wireframe:sample,mockup:sample},'',meta()),/changed/);
 await assert.rejects(pipeline.decide(root,'TC-392','approved','bad','Reviewer'),/changed/);
 assert.equal((await pipeline.read(root,'TC-392')).revision,v1.revision);
}));
test('host enforces current Jira ownership, approved BR/reference checks and no automatic publishing',()=>{
 const generation=host.slice(host.indexOf("case 'uxPipelineGenerate':"),host.indexOf("case 'uxPipelineDecide':"));
 const approval=host.slice(host.indexOf("case 'uxPipelineDecide':"),host.indexOf("case 'uxDesignRead':"));
 for(const needle of [/issue\.fields\?\.assignee\?\.accountId!==self\.accountId/,/approved\.hash/,/latestRef\.sha256/,/uxDesignPipeline\.generate/,/uxDesignPipeline\.validFlow/,/progress\(6/])assert.match(generation,needle);
 for(const needle of [/uxDesignPipeline\.decide/,/designProposals\.approvedInputs/,/current\.wireframeRevision!==wire\.revision/,/current\.jiraUpdated/])assert.match(approval,needle);
 assert.doesNotMatch(approval,/jiraCreateIssue|jiraUpdateIssue|writeConfluence/);
});
test('UI provides six progress stages, single generation button, clickable preview and approve or disapprove',()=>{
 assert.match(ui,/const UX_STAGES=\[/);assert.match(ui,/uxGenerateUIUX.*addEventListener/);
 assert.match(ui,/uxApproveDesign.*addEventListener/);assert.match(ui,/uxRejectDesign.*addEventListener/);
 assert.match(ui,/uxRejectReason/);assert.match(ui,/renderUxFlow/);assert.match(ui,/uxPrototypeOpenBrowser/);
 assert.match(css,/\.ux-design-workflow\{display:grid/);
 assert.match(host,/id="uxDesignPreviewPage"/);assert.match(host,/id="uxFlowDiagram"/);assert.match(host,/id="uxDeveloperHandoff"/);
 assert.doesNotMatch(host,/id="uxGenerateWireframe"|id="uxGenerateMockup"|class="ux-design-definitions"/);
});
