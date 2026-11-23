'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {ProjectRegistry}=require('../src/projects');
const cache=require('../src/jira-local-store');
async function fixture(run){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-jira-cache-'));
 try{
  await fs.mkdir(path.join(root,'.atgv'));
  await fs.writeFile(path.join(root,'.atgv','atgv.workspace.json'),
   JSON.stringify({schema:1,managedBy:'aia-my.atgv-aiatech-assist'}));
  const registry=new ProjectRegistry(root);
  await registry.create({id:'demo',name:'Demo'});
  await run({root,registry,projectId:'demo'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
const site='https://example.atlassian.net';
const issue=(id,key,status='To Do')=>({id,key,summary:'Requirement',
 type:'Epic',status,parentKey:'',updated:'2026-11-23T09:15:00.000+0000'});
test('Jira inventory cache is private, project-scoped SQLite with stable IDs',()=>fixture(async({root,registry,projectId})=>{
 const file=path.join(root,'.atgv','memory','project-demo.sqlite');
 assert.equal(cache.saveIssuePage(registry,projectId,{site,projectKey:'TC',issues:[issue('10101','TC-100')]}).stored,1);
 let rows=cache.snapshot(registry,projectId,site,'TC');
 assert.equal(rows.issues[0].id,'10101');
 assert.equal(rows.issues[0].key,'TC-100');
 await fs.access(file);
 // The issue may be moved or renamed; the Jira numeric ID is unchanged.
 cache.saveIssuePage(registry,projectId,{site,projectKey:'TC',issues:[issue('10101','TC-199','In Progress')]});
 rows=cache.snapshot(registry,projectId,site,'TC');
 assert.equal(rows.issues.length,1);
 assert.equal(rows.issues[0].key,'TC-199');
 assert.equal(rows.issues[0].status,'In Progress');
 assert.equal(cache.snapshot(registry,projectId,'https://another.atlassian.net','TC').issues.length,0);
}));
test('BR-to-Jira mapping index never edits the BR source register',()=>fixture(async({registry,projectId})=>{
 const register={synced:{'BR-001':{key:'TC-100'},'BR-001/F-1':{key:'TC-101'}},roleTaskMappings:{}};
 cache.saveIssuePage(registry,projectId,{site,projectKey:'TC',issues:[issue('10001','TC-100'),issue('10002','TC-101')]});
 const before=JSON.stringify(register);
 const saved=cache.saveMappings(registry,projectId,{site,register});
 assert.equal(saved.stored,2);
 let snap=cache.snapshot(registry,projectId,site,'TC');
 assert.equal(snap.mappings.length,2);
 assert.equal(snap.mappings.find(row=>row.node_path==='BR-001').jira_id,'10001');
 assert.equal(JSON.stringify(register),before);
 const next={synced:{'BR-001':{key:'TC-100'}},roleTaskMappings:{}};
 cache.saveMappings(registry,projectId,{site,register:next});
 snap=cache.snapshot(registry,projectId,site,'TC');
 assert.equal(snap.mappings.find(row=>row.node_path==='BR-001/F-1').active,0);
 assert.equal(snap.mappings.find(row=>row.node_path==='BR-001').active,1);
}));
test('Jira scan completeness is recorded without deleting cached records',()=>fixture(async({registry,projectId})=>{
 cache.saveIssuePage(registry,projectId,{site,projectKey:'TC',issues:[issue('10001','TC-100')]});
 cache.finishScan(registry,projectId,{site,projectKey:'TC',count:1,completed:false});
 let snap=cache.snapshot(registry,projectId,site,'TC');
 assert.equal(snap.state.completed,0);
 cache.finishScan(registry,projectId,{site,projectKey:'TC',count:0,completed:true});
 snap=cache.snapshot(registry,projectId,site,'TC');
 assert.equal(snap.state.completed,1);
 assert.equal(snap.issues.length,1);
}));
test('invalid Jira cache site and project identity fail closed',()=>fixture(async({registry,projectId})=>{
 assert.throws(()=>cache.saveIssuePage(registry,projectId,{site:'http://localhost',projectKey:'TC',issues:[]}),/Invalid Jira Cloud/);
 assert.throws(()=>cache.saveIssuePage(registry,projectId,{site,projectKey:'TC',issues:[issue('10001','OTHER-100')]}),/Cross-project/);
 assert.equal(cache.snapshot(registry,projectId,site,'TC').issues.length,0);
}));
