'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const brWorkflow=require('../src/br-workflow');
const text=relative=>require('node:fs').readFileSync(path.join(__dirname,'..',relative),'utf8');
const marker='atgv-'+'a'.repeat(24);
const digest=crypto.createHash('sha256').update('verified Jira snapshot').digest('hex');
const nodePath='BR-012/F-001/S-001/ROLE-DEVELOPER';
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-jira-link-recovery-'));
 const registry={fileFor:id=>path.join(root,id,'project.json')};
 try{
  let register=await brWorkflow.load(registry,'demo');
  register=await brWorkflow.write(registry,'demo',register.revision,next=>{
   next.brs=[{id:'BR-012',title:'Routing',status:'approved',jiraHierarchyVersion:2,approvedContent:{
    title:'Routing',objective:'Route portfolio work',scope:'Project initiation',acceptanceCriteria:'Projects have approved routing',
    features:[{id:'F-001',title:'Portfolio',description:'Route project',
     stories:[{id:'S-001',title:'Submit project',description:'Submit initiated project for review',tasks:[]}]}]
   }}];
   next.synced={
    'BR-012':{key:'TC-700'},'BR-012/F-001':{key:'TC-701'},'BR-012/F-001/S-001':{key:'TC-702'}
   };
   next.roleTaskMappings={[nodePath]:{key:'TC-715',marker,roleId:'developer',roleLabel:'atgv-role-software-developer'}};
  });
  return await fn({registry,register});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
const lookup=register=>{
 const item=brWorkflow.plan(register).find(x=>x.path===nodePath);
 assert.equal(item?.action,'create');
 return item;
};
const params=item=>({path:nodePath,key:'TC-715',hash:item.hash,kind:item.kind,title:item.title,issueType:'Sub-task',remoteDigest:digest,marker,actor:'Verified Business Analyst'});
test('Fix Jira Link adopts verified existing Developer subtask without creating a Jira operation',()=>fixture(async({registry,register})=>{
 const item=lookup(register);
 const after=await brWorkflow.reconcileExistingJira(registry,'demo',register.revision,params(item));
 assert.equal(after.synced[nodePath].key,'TC-715');
 assert.equal(after.synced[nodePath].remoteDigest,digest);
 assert.equal(after.pending[nodePath],undefined);
 assert.deepEqual(after.roleTaskMappings[nodePath],register.roleTaskMappings[nodePath]);
 assert.equal(brWorkflow.plan(after).some(row=>row.path===nodePath&&row.action==='create'),false);
 assert.ok(after.events.some(event=>event.action==='jira-existing-link-recovered'&&event.key==='TC-715'&&event.actor==='Verified Business Analyst'));
 await assert.rejects(brWorkflow.reconcileExistingJira(registry,'demo',after.revision,params(item)),/preview changed|already recorded/i);
}));
test('Fix Jira Link fails closed if the Jira key belongs to another BR path',()=>fixture(async({registry,register})=>{
 const item=lookup(register);
 const conflicting=await brWorkflow.write(registry,'demo',register.revision,next=>{
  next.synced['BR-999']={key:'TC-715',hash:'legacy'};
 });
 await assert.rejects(brWorkflow.reconcileExistingJira(registry,'demo',conflicting.revision,params(item)),/already linked to a different/i);
 assert.equal((await brWorkflow.load(registry,'demo')).synced[nodePath],undefined);
}));
test('Fix Jira Link refuses stale revisions and unverified markers',()=>fixture(async({registry,register})=>{
 const item=lookup(register);
 await assert.rejects(brWorkflow.reconcileExistingJira(registry,'demo',register.revision,{...params(item),marker:'unverified'}),/verified Jira identity/i);
 await assert.rejects(brWorkflow.reconcileExistingJira(registry,'demo','stale',{...params(item)}),/Refresh and retry/i);
 assert.equal((await brWorkflow.load(registry,'demo')).synced[nodePath],undefined);
}));
test('Jira Preview displays a single recovery action and host never rewrites the Jira issue in this command',()=>{
 const client=text('media/start.js'),host=text('src/lib/runtime/extension-runtime.js');
 assert.match(client,/Fix Jira Link/);
 assert.match(client,/send\('brJiraFixLink'/);
 assert.match(host,/case 'brJiraFixLink':/);
 const section=host.split("case 'brJiraFixLink':")[1].split("case 'brJiraPreview':")[0];
 assert.match(section,/jiraFindIssueByMarker/);
 assert.match(section,/validateRemote/);
 assert.match(section,/brWorkflow\.reconcileExistingJira/);
 assert.doesNotMatch(section,/jiraCreateIssue|jiraUpdateIssue|jiraRetireIssue/);
});


test('Historical role-task content stays pending for explicit Jira UPDATE approval after relinking',()=>fixture(async({registry,register})=>{
 const item=lookup(register);
 const after=await brWorkflow.reconcileExistingJira(registry,'demo',register.revision,{...params(item),contentMatchesApproved:false});
 assert.equal(after.synced[nodePath].key,'TC-715');
 assert.notEqual(after.synced[nodePath].hash,item.hash);
 assert.equal(after.synced[nodePath].remoteDigest,digest);
 const pending=brWorkflow.plan(after).find(row=>row.path===nodePath);
 assert.equal(pending?.action,'update');
 assert.equal(pending?.key,'TC-715');
 assert.equal(after.events.at(-1).requiresJiraReview,true);
}));
