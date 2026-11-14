'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const workflow=require('../src/br-workflow');
const store=require('../src/source-store');
const sourceDigest=crypto.createHash('sha256').update('archived-demo').digest('hex');
const otherDigest=crypto.createHash('sha256').update('other-demo').digest('hex');
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-archive-purge-'));
 try{const registry=new ProjectRegistry(root);await registry.create({id:'demo',name:'Demo'});return await fn(registry);}
 finally{await fs.rm(root,{recursive:true,force:true});}
}
function source(digest=sourceDigest){return {name:digest===sourceDigest?'original.pdf':'other.pdf',digest,storedName:digest+'.pdf',characters:99};}
test('force delete removes archived source and its linked approved BR, preserves remote Jira in audit tombstone',()=>fixture(async registry=>{
 let state=await workflow.load(registry,'demo');
 state=await workflow.addSources(registry,'demo',state.revision,[source()]);
 state=await workflow.selectSources(registry,'demo',state.revision,[sourceDigest]);
 state=await workflow.discoverySaved(registry,'demo',state.revision,'D1');
 state=await workflow.reviewed(registry,'demo',state.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Ready',suggestions:[]})});
 const content={title:'Archived evidence BR',objective:'Requirement',scope:'Scope',acceptanceCriteria:'Acceptance',features:[]};
 state=await workflow.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[content]});
 state=await workflow.edit(registry,'demo',state.revision,{brId:'BR-001',content,actor:'BA'});
 state=await workflow.approve(registry,'demo',state.revision,{brId:'BR-001',actor:'BA'});
 const regFile=path.join(path.dirname(registry.fileFor('demo')),'documents','requirements','br-register.json');
 const raw=JSON.parse(await fs.readFile(regFile,'utf8'));
 raw.synced['BR-001']={key:'TC-999',hash:'original',kind:'Epic',title:content.title};
 await fs.writeFile(regFile,JSON.stringify(raw,null,2));
 state=await workflow.load(registry,'demo');
 state=await workflow.archiveSource(registry,'demo',state.revision,{digest:sourceDigest});
 const brBefore=structuredClone(state.brs),jiraBefore=structuredClone(state.synced);
 const impact=workflow.sourceDeletionImpact(state,sourceDigest);
 assert.deepEqual(impact.requirements.map(x=>x.id),['BR-001']);
 const stale=state.revision;
 state=await workflow.forceDeleteArchivedSource(registry,'demo',state.revision,{digest:sourceDigest,actor:'BA User',expectedBrIds:['BR-001']});
 assert.equal(state.archivedSources.length,0);
 assert.equal(Object.hasOwn(state.sourceVersions,sourceDigest),false);
 assert.equal(brBefore.length,1);assert.equal(jiraBefore['BR-001'].key,'TC-999');
 assert.equal(state.brs.length,0);assert.equal(state.synced['BR-001'],undefined);
 assert.equal(state.deletedRequirements[0].id,'BR-001');
 assert.equal(state.deletedRequirements[0].jiraIssues[0].key,'TC-999');
 assert.equal(state.sourceHistory.at(-1).action,'archived-source-and-br-force-deleted');
 assert.equal(state.sourceHistory.at(-1).actor,'BA User');
 assert.equal(workflow.plan(state).filter(x=>x.action==='retire').length,0);
 await assert.rejects(workflow.forceDeleteArchivedSource(registry,'demo',stale,{digest:sourceDigest,expectedBrIds:['BR-001']}),/changed/);
 await assert.rejects(workflow.restoreSource(registry,'demo',state.revision,{digest:sourceDigest}),/changed or restored/);
}));
test('force delete cannot purge an active source or an invalid digest',()=>fixture(async registry=>{
 let state=await workflow.load(registry,'demo');state=await workflow.addSources(registry,'demo',state.revision,[source()]);
 await assert.rejects(workflow.forceDeleteArchivedSource(registry,'demo',state.revision,{digest:sourceDigest,expectedBrIds:[]}),/Archived source was changed/);
 await assert.rejects(workflow.forceDeleteArchivedSource(registry,'demo',state.revision,{digest:'../outside',expectedBrIds:[]}),/Invalid source fingerprint/);
 assert.equal((await workflow.load(registry,'demo')).sourceDocuments.length,1);
}));
test('stored archived copy is physically removed; another active source remains',()=>fixture(async registry=>{
 let state=await workflow.load(registry,'demo');
 state=await workflow.addSources(registry,'demo',state.revision,[source(),source(otherDigest)]);
 const folder=store.sourceDirectory(registry,'demo');await fs.mkdir(folder,{recursive:true});
 const archivedPath=path.join(folder,sourceDigest+'.pdf'),activePath=path.join(folder,otherDigest+'.pdf');
 await fs.writeFile(archivedPath,Buffer.from('archived original bytes'));
 await fs.writeFile(activePath,Buffer.from('active original bytes'));
 state=await workflow.archiveSource(registry,'demo',state.revision,{digest:sourceDigest});
 const old=state.archivedSources[0];
 state=await workflow.forceDeleteArchivedSource(registry,'demo',state.revision,{digest:sourceDigest,expectedBrIds:[]});
 assert.equal((await store.removeStored(registry,'demo',old)).deleted,true);
 await assert.rejects(fs.stat(archivedPath),{code:'ENOENT'});
 assert.equal((await fs.readFile(activePath,'utf8')),'active original bytes');
 assert.equal(state.sourceDocuments.length,1);
}));
test('archived UI routes Delete exclusively through verified remote deletion',()=>{
 const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 const ext=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.doesNotMatch(ui,/Delete Everywhere: delete verified Jira hierarchy/);
 assert.match(ui,/deleteBREverywhere/);
 assert.match(ext,/case 'forceDeleteArchivedDiscoverySource'/);
 assert.match(ext,/Delete now means Delete Everywhere/);
 assert.match(ext,/uiWarning\(message,\{modal:true/);
 assert.match(ext,/remoteBRDeletion\.execute/);
 assert.match(ext,/remote Jira|Remote Jira|REMOTE Jira/);
});
