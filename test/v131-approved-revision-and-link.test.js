'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const repo=require('../src/unified-document-repository'),{DocumentSync}=require('../src/confluence-docsync');
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-131rev-')),reg={fileFor:()=>path.join(root,'projects','sample','atgv.project.json')},folder=path.dirname(reg.fileFor());const rel='documents/development/sprint-plan.md',file=path.join(folder,rel),text='# Project Plan\n\nA project-level plan for the approved BR with meaningful assumptions.\n';await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,text);try{await repo.reconcile(reg,'sample',{roles:[{id:'project-manager',tasks:[{id:'plan',label:'Project Plan',document:'development/sprint-plan.md'}]}]});return await fn({root,reg,folder,rel,file,text});}finally{await fs.rm(root,{recursive:true,force:true});}}
test('approved document creates new editable revision only when verified owner explicitly requests it, and retains snapshot',()=>fixture(async f=>{
 await repo.recordDocumentSave(f.reg,'sample','project-manager','plan',f.text+'\nHuman reviewed content.\n',repo.sha(f.text+'\nHuman reviewed content.\n'),'writer');await fs.writeFile(f.file,f.text+'\nHuman reviewed content.\n');
 await repo.approveDocument(f.reg,'sample','project-manager','plan',{actor:'reviewer',reviewerRole:'project-manager',expectedDigest:repo.sha(f.text+'\nHuman reviewed content.\n')});
 let x=await repo.load(f.reg,'sample'),doc=x.documents['sample:role:project-manager/plan'];const approved=doc.approval,oldRev=doc.contentRevision,oldText=await fs.readFile(path.join(f.folder,approved.snapshot),'utf8');
 await assert.rejects(repo.propose(f.reg,'sample',{roleId:'project-manager',taskId:'plan',markdown:'AI changed',baseDigest:doc.digest,actor:'ai'}),/new draft revision/);
 await assert.rejects(repo.beginDocumentRevision(f.reg,'sample','project-manager','plan',{actor:''}),/owner/);
 await repo.beginDocumentRevision(f.reg,'sample','project-manager','plan',{actor:'verified owner'});
 x=await repo.load(f.reg,'sample');doc=x.documents['sample:role:project-manager/plan'];assert.equal(doc.status,'draft');assert.equal(doc.contentRevision,oldRev+1);assert.equal(doc.approval,null);assert.equal(await fs.readFile(path.join(f.folder,approved.snapshot),'utf8'),oldText);assert.ok(doc.history.some(h=>h.approval?.digest===approved.digest));
 const proposalId=(await repo.propose(f.reg,'sample',{roleId:'project-manager',taskId:'plan',markdown:oldText+'\nAI-proposed section.\n',baseDigest:doc.digest,actor:'ai'})).result;assert.ok(proposalId);
}));
test('Business Analyst placeholder resolves to approved BR canonical link, not a second editable BR',()=>fixture(async f=>{
 const br={id:'BR-001',approvedContent:{title:'Approved BR'},approvedRevision:4};
 await repo.reconcile(f.reg,'sample',{roles:[{id:'business-analyst',tasks:[{id:'requirements',label:'Business Requirements',document:'requirements/business-requirement.md'}]}],brs:[br]});
 const state=await repo.load(f.reg,'sample');const alias=state.documents['sample:alias:business-analyst/requirements'];
 assert.equal(alias.kind,'alias');assert.equal(alias.status,'reference-only');assert.deepEqual(alias.sourceRefs,[{id:'BR-001',revision:4}]);assert.equal(state.documents['sample:br:BR-001'].status,'approved');
 assert.throws(()=>repo.resolveTarget(state,'sample','business-analyst','requirements'),/not registered/);
}));
test('Confluence approved BR publishing keeps same mapped page on a later BR revision',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-131brsync-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'approved-brs'),{recursive:true});
 const path1='approved-brs/BR-001-revision-1.md',path2='approved-brs/BR-001-revision-2.md';
 const content=rev=>'# Approved BR-001\n\nThis is a test of the approved project BR, with recorded content version '+rev+' and important project business rules that must remain preserved.\n';
 await fs.writeFile(path.join(dir,path1),content(1));await fs.writeFile(path.join(dir,path2),content(2));
 const config={get:key=>({'jira.baseUrl':'https://example.atlassian.net','jira.email':'user@example.invalid','confluence.baseUrl':'https://example.atlassian.net/wiki','confluence.spaceId':'42','confluence.spaceKey':'TEST'})[key]||''};
 const orig=global.fetch;let version=1,remoteHtml='',creates=0,updates=0;
 const okay=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});
 global.fetch=async(uri,opt)=>{const url=String(uri);if(url.includes('/api/v2/spaces/42'))return okay({id:'42',key:'TEST'});if(url.includes('/api/v2/pages?'))return okay({results:[]});if(url.endsWith('/api/v2/pages')&&opt.method==='POST'){creates++;remoteHtml=JSON.parse(opt.body).body.value;return okay({id:'300',version:{number:1}});}if(url.includes('/api/v2/pages/300')&&opt.method==='GET')return okay({id:'300',version:{number:version},body:{storage:{value:remoteHtml}}});if(url.includes('/api/v2/pages/300')&&opt.method==='PUT'){updates++;const json=JSON.parse(opt.body);remoteHtml=json.body.value;version++;return okay({id:'300',version:{number:version}});}throw Error('Unexpected URL '+url+' '+opt.method);};
 try{const sync=new DocumentSync({folder:dir,config,token:'test-token'});
 const run=(relative)=>sync.sync({immutable:true,only:[],additional:[{path:relative,key:'approved-brs/BR-001.md'}]});
 const first=await run(path1);assert.deepEqual(first.created,['approved-brs/BR-001.md']);
 const second=await run(path2);assert.deepEqual(second.pushed,['approved-brs/BR-001.md']);assert.equal(creates,1);assert.equal(updates,1);
 const state=await sync.read();assert.equal(Object.keys(state.entries).length,1);assert.equal(state.entries['approved-brs/BR-001.md'].pageId,'300');assert.equal(state.entries['approved-brs/BR-001.md'].version,2);
 }finally{global.fetch=orig;}
});
