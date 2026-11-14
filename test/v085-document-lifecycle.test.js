'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64),d='d'.repeat(64);
const source=(name,digest)=>({name,digest,storedName:digest+'.pdf',characters:100,uploadedBy:'BA'});
const fixture=async(fn)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv85-lifecycle-'));
 try{const registry=new ProjectRegistry(dir);await registry.create({id:'demo',name:'Demo'});return await fn(registry);}finally{await fs.rm(dir,{recursive:true,force:true});}
};
const prepared=async(registry,sourceDigests=[a])=>{
 let state=await br.load(registry,'demo');state=await br.addSources(registry,'demo',state.revision,sourceDigests.map((digest,i)=>source(`source${i}.pdf`,digest)));
 state=await br.selectSources(registry,'demo',state.revision,sourceDigests);
 state=await br.discoverySaved(registry,'demo',state.revision,'D1');
 state=await br.reviewed(registry,'demo',state.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Ready',suggestions:[]})});
 return state;
};
test('unused source may be deleted without changing discovery or Jira',()=>fixture(async(registry)=>{
 let state=await br.load(registry,'demo');state=await br.addSources(registry,'demo',state.revision,[source('unused.pdf',a)]);
 const before=state.reviewRevision;
 assert.equal(br.sourceLifecycle(state,a).action,'delete');
 state=await br.removeSource(registry,'demo',state.revision,{digest:a});
 assert.equal(state.sourceDocuments.length,0);assert.equal(state.reviewRevision,before);
 assert.equal(state.sourceVersions[a].status,'deleted-unused');assert.deepEqual(state.synced,{});
}));
test('mapped source cannot be deleted; archive retains discovery and is restorable',()=>fixture(async(registry)=>{
 let state=await prepared(registry);
 assert.equal(br.sourceLifecycle(state,a).action,'archive');
 await assert.rejects(br.removeSource(registry,'demo',state.revision,{digest:a}),/Archived or Replaced/);
 const before={discovery:state.discoveryRevision,review:state.reviewRevision};
 state=await br.archiveSource(registry,'demo',state.revision,{digest:a});
 assert.equal(state.sourceDocuments.length,0);assert.equal(state.archivedSources[0].status,'archived');
 assert.equal(state.sourceVersions[a].status,'archived');assert.equal(state.discoveryRevision,before.discovery);assert.equal(state.reviewRevision,before.review);
 state=await br.restoreSource(registry,'demo',state.revision,{digest:a});
 assert.equal(state.archivedSources.length,0);assert.equal(state.sourceDocuments[0].digest,a);
 assert.equal(state.sourceVersions[a].status,'active');assert.equal(state.reviewRevision,'D1');
}));
test('processed document replacement retains original evidence and does not invalidate BR history',()=>fixture(async(registry)=>{
 let state=await prepared(registry);
 const content={title:'Requirement',objective:'Objective',scope:'Scope',acceptanceCriteria:'Acceptance',features:[]};
 state=await br.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[content]});
 state=await br.edit(registry,'demo',state.revision,{brId:'BR-001',content,actor:'BA'});
 state=await br.approve(registry,'demo',state.revision,{brId:'BR-001',actor:'BA'});
 const oldApproved=JSON.stringify(state.brs[0].approvedContent);
 const changed=await br.addSources(registry,'demo',state.revision,[source('source0.pdf',b)]);
 assert.equal(changed.brs[0].status,'approved');assert.equal(changed.brs[0].needsRefresh,false);
 assert.equal(JSON.stringify(changed.brs[0].approvedContent),oldApproved);
 assert.equal(changed.sourceDocuments[0].digest,b);
 assert.equal(changed.archivedSources[0].digest,a);assert.equal(changed.archivedSources[0].status,'superseded');
 assert.equal(changed.sourceVersions[a].status,'superseded');assert.equal(changed.sourceVersions[b].status,'active');
 assert.equal(changed.reviewRevision,'');assert.deepEqual(changed.processedSources,[]);
}));
test('archiving all processed sources preserves independently approved BR and does not trigger Jira plan',()=>fixture(async(registry)=>{
 let state=await prepared(registry,[a,b]);
 const content={title:'Requirement',objective:'Objective',scope:'Scope',acceptanceCriteria:'Acceptance',features:[]};
 state=await br.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[content]});
 state=await br.edit(registry,'demo',state.revision,{brId:'BR-001',content,actor:'BA'});
 state=await br.approve(registry,'demo',state.revision,{brId:'BR-001',actor:'BA'});
 state=await br.archiveSource(registry,'demo',state.revision,{digest:a});
 state=await br.archiveSource(registry,'demo',state.revision,{digest:b});
 state=await br.load(registry,'demo');
 assert.equal(state.sourceDocuments.length,0);assert.equal(state.archivedSources.length,2);
 assert.equal(state.brs[0].status,'approved');assert.equal(state.brs[0].needsRefresh,false);
 assert.equal(br.plan(state).filter(item=>item.action==='retire').length,0);
}));
test('restoring archived version refuses filename collisions with newer active revision',()=>fixture(async(registry)=>{
 let state=await prepared(registry);
 state=await br.addSources(registry,'demo',state.revision,[source('source0.pdf',b)]);
 await assert.rejects(br.restoreSource(registry,'demo',state.revision,{digest:a}),/same filename or content/);
 const after=await br.load(registry,'demo');assert.equal(after.archivedSources.length,1);assert.equal(after.sourceDocuments[0].digest,b);
}));
test('restoring archived version enforces active source capacity',()=>fixture(async(registry)=>{
 let state=await br.load(registry,'demo');state=await br.addSources(registry,'demo',state.revision,[source('original.pdf',a)]);
 state=await br.archiveSource(registry,'demo',state.revision,{digest:a});
 const ten=Array.from({length:10},(_,i)=>source(`active${i}.pdf`,require('node:crypto').createHash('sha256').update(`active-${i}`).digest('hex')));
 state=await br.addSources(registry,'demo',state.revision,ten);
 await assert.rejects(br.restoreSource(registry,'demo',state.revision,{digest:a}),/Maximum 10/);
}));
test('stale requests cannot archive or restore a source after concurrent registry change',()=>fixture(async(registry)=>{
 let state=await br.load(registry,'demo');state=await br.addSources(registry,'demo',state.revision,[source('a.pdf',a),source('b.pdf',b)]);
 const stale=state.revision;
 state=await br.archiveSource(registry,'demo',state.revision,{digest:a});
 await assert.rejects(br.archiveSource(registry,'demo',stale,{digest:b}),/changed/);
 await assert.rejects(br.restoreSource(registry,'demo',stale,{digest:a}),/changed/);
 assert.equal((await br.load(registry,'demo')).sourceDocuments.length,1);
}));
test('reupload of archived identical digest reactivates instead of duplicating history',()=>fixture(async(registry)=>{
 let state=await br.load(registry,'demo');state=await br.addSources(registry,'demo',state.revision,[source('a.pdf',a)]);
 state=await br.archiveSource(registry,'demo',state.revision,{digest:a});
 state=await br.addSources(registry,'demo',state.revision,[source('a.pdf',a)]);
 assert.equal(state.sourceDocuments.length,1);assert.equal(state.archivedSources.length,0);
 assert.equal(state.sourceVersions[a].status,'active');
}));
test('unsafe digests never mutate document lifecycle',()=>fixture(async(registry)=>{
 let state=await br.load(registry,'demo');state=await br.addSources(registry,'demo',state.revision,[source('a.pdf',a)]);
 for(const invalid of ['../../x','not-hash','','a'.repeat(63)]){
  await assert.rejects(br.archiveSource(registry,'demo',state.revision,{digest:invalid}),/Invalid source fingerprint/);
  await assert.rejects(br.restoreSource(registry,'demo',state.revision,{digest:invalid}),/Invalid source fingerprint/);
 }
 assert.equal((await br.load(registry,'demo')).sourceDocuments.length,1);
}));
test('UI uses direct uploaded-source deletion with confirmation and preserves legacy restoration review',()=>{
 const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(ui,/deleteBREverywhere/);
 assert.doesNotMatch(ui,/Archived & superseded documents/);
 assert.match(host,/case 'restoreDiscoverySource'/);
 assert.match(host,/No active source documents\. Upload or restore evidence/);
 assert.doesNotMatch(host.slice(host.indexOf('async function removeDiscoverySource'),host.indexOf('async function deleteUploadedDiscoverySource')),/approvedJiraPreviewRevision=null/);
});
