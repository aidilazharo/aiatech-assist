'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const hub=require('../src/project-artifact-hub');
async function fixture(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v304-artifacts-'));
 const projectId='sample-project',base=path.join(dir,'projects',projectId);
 await fs.mkdir(path.join(base,'documents','requirements'),{recursive:true});
 await fs.mkdir(path.join(base,'sdlc'),{recursive:true});
 await fs.writeFile(path.join(base,'documents','requirements','notes for project.md'),'This is a BA source document.');
 await fs.writeFile(path.join(base,'sdlc','architecture.md'),'Approved SA architecture.');
 const registry={fileFor(id){assert.equal(id,projectId);return path.join(base,'atgv.project.json');}};
 const br={id:'BR-009',status:'approved',approvedRevision:1,approvedAt:'2026-11-12',approvedContent:{title:'Person Name CRUD',objective:'Create, read, update and delete person names.',scope:'Person names only.',acceptanceCriteria:'User can add and view a person name.',features:[]}};
 const register={brs:[br],sourceDocuments:[],discoveryRevision:'d1',discoveryAnswers:{Q1:'Person name CRUD'},mappingCompleted:null,synced:{'BR-009':{key:'TC-392',kind:'Epic',title:'Person CRUD'},'BR-009/F1':{key:'TC-393',kind:'Task',title:'Add person'},'BR-OTHER':{key:'TC-999',kind:'Epic',title:'Unrelated product'}},designs:{mockup:[{status:'approved',number:1,design:{title:'Approved person mockup'},sourceBusinessRequirements:[{id:'BR-009',revision:1}]},{status:'approved',number:2,design:{title:'Different BR mockup'},sourceBusinessRequirements:[{id:'BR-OTHER',revision:1}]}]}};
 await fs.writeFile(path.join(base,'sdlc','unified-documents.json'),JSON.stringify({schema:1,revision:1,documents:{'role:architect':{id:'role:architect',roleId:'solution-architect',kind:'role',title:'Architecture',path:'sdlc/architecture.md',status:'approved',digest:'x'}},proposals:{},events:[],outbox:[]}));
 const project={techStackId:'react-express',techStackPrepared:{sha:'abcdef',branch:'stack-main'},techStackApproval:{state:'approved'}};
 const readJiraIssue=async key=>({fields:{summary:key+' Person CRUD',description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Use only person names.'}]}]},issuetype:{name:'Task'},status:{name:'To Do'}}});
 return {dir,base,registry,projectId,register,br,project,readJiraIssue};
}
test('all roles share project-level indexed source documents, stack, Jira and registered artifacts',async t=>{
 const x=await fixture();t.after(()=>fs.rm(x.dir,{recursive:true,force:true}));
 const result=await hub.syncProject(x);
 assert.deepEqual(result.manifest.roles.sort(),['business-analyst','developer','solution-architect','ui-ux-designer']);
 assert.ok(result.manifest.files.some(row=>row.source==='sdlc/architecture.md'&&row.role==='solution-architect'));
 assert.ok(result.manifest.files.some(row=>row.source==='documents/requirements/notes for project.md'));
 assert.equal(result.manifest.jira.length,3);
 assert.equal(result.manifest.jira[0].remote.description,'Use only person names.');
 assert.ok((await fs.readFile(path.join(result.current,'roles/solution-architect/registered',result.manifest.files.find(f=>f.source==='sdlc/architecture.md').path.split('/').at(-1)),'utf8')).includes('Approved SA'));
});
test('development plans use verified BR-specific snapshot and exclude other BR designs and Jira',async t=>{
 const x=await fixture();t.after(()=>fs.rm(x.dir,{recursive:true,force:true}));
 const bundle=await hub.prepareDevelopment({...x,approvedDesignHandoff:[{kind:'ux-ticket',sourceTicketKey:'TC-393',screens:[{name:'People'}]}]});
 assert.equal(bundle.manifest.brId,'BR-009');
 assert.ok(bundle.manifest.files.some(f=>f.path.endsWith('mockup-revision-1.json')));
 assert.ok(bundle.manifest.files.some(f=>f.source==='sdlc/architecture.md'&&f.role==='solution-architect'));
 assert.ok(!bundle.manifest.files.some(f=>f.path.endsWith('mockup-revision-2.json')));
 assert.ok(!bundle.manifest.files.some(f=>f.path.endsWith('TC-999.json')));
 await hub.verifyContext(bundle.context,{brId:'BR-009',revision:1,stackSha:'abcdef'});
 const evidence=await hub.contextForPlan(bundle.context,bundle.manifest);
 assert.match(evidence.brText,/Person Name CRUD/);
 assert.equal(evidence.jira.length,2);
 assert.equal(evidence.approvedDesignHandoff[0].sourceTicketKey,'TC-393');
 const plans=await hub.savePlan(bundle.context,[{id:'AC-01',description:'Create person name',acceptance:'Person appears in list',jiraKey:'TC-393'}],{brId:'BR-009',revision:1,contextDigest:bundle.manifest.digest});
 assert.equal(JSON.parse(await fs.readFile(plans.testPlan,'utf8')).tests[0].jiraKey,'TC-393');
});
test('tampered evidence is rejected without overwriting prior plans or approved sources',async t=>{
 const x=await fixture();t.after(()=>fs.rm(x.dir,{recursive:true,force:true}));
 const bundle=await hub.prepareDevelopment({...x,approvedDesignHandoff:[]});
 await fs.writeFile(path.join(bundle.context,bundle.manifest.approvedBrSource),'Different requirements');
 await assert.rejects(()=>hub.verifyContext(bundle.context,{brId:'BR-009',revision:1,stackSha:'abcdef'}),/modified/);
 const original=await fs.readFile(path.join(x.base,'sdlc','architecture.md'),'utf8');assert.equal(original,'Approved SA architecture.');
});
test('missing required Jira details block new development context instead of pretending plan is complete',async t=>{
 const x=await fixture();t.after(()=>fs.rm(x.dir,{recursive:true,force:true}));
 await assert.rejects(()=>hub.prepareDevelopment({...x,readJiraIssue:async key=>{if(key==='TC-393')throw Error('Jira unavailable');return x.readJiraIssue(key);}}),/Unable to extract 1 linked Jira issue/);
 assert.ok(!await fs.stat(path.join(x.base,'unified-artifacts','current')).catch(()=>null));
});
test('folder traversal through a registered role document is rejected',async t=>{
 const x=await fixture();t.after(()=>fs.rm(x.dir,{recursive:true,force:true}));
 const file=path.join(x.base,'sdlc','unified-documents.json');const val=JSON.parse(await fs.readFile(file));val.documents['role:architect'].path='../outside.md';await fs.writeFile(file,JSON.stringify(val));
 await assert.rejects(()=>hub.syncProject(x),/Invalid managed document path/);
});
