'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const file=name=>require('node:fs').readFileSync(path.join(__dirname,'..',name),'utf8');
const proposal=(name='Claims')=>({title:name,objective:'Process claims',scope:'Claims users',acceptanceCriteria:'Each claim is validated',features:[]});
const reviewed=(readiness='Ready',suggestions=[],applied=false)=>JSON.stringify({readiness,summary:'AI reviewed',suggestions,applied});
const setup=async(fn)=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv81-stress-'));
 try{
  const reg=new ProjectRegistry(home);await reg.create({id:'demo',name:'Demo'});
  let state=await br.load(reg,'demo');state=await br.imported(reg,'demo',state.revision,{name:'requirements.pdf',digest:'a'.repeat(64)});
  state=await br.discoverySaved(reg,'demo',state.revision,'D1');
  return await fn(reg,state);
 }finally{await fs.rm(home,{recursive:true,force:true});}
};
test('BA review has one progress track with action buttons in a bottom row',()=>{
 const html=file('test/generated/extension-source.txt'),css=file('media/start.css');
 const section=html.slice(html.indexOf('<details id="discoveryReviewPanel"'),html.indexOf('</details>',html.indexOf('<details id="discoveryReviewPanel"')));
 for(const id of ['discoveryCopilot','discoveryReviewApply','baReviewApplyStop','baReviewRetry','baReviewSkip'])assert.equal((section.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
 assert.ok(section.indexOf('id="discoveryReviewApply"')<section.indexOf('id="baReviewSkip"'));
 assert.equal((html.match(/id="reviewHeadingProgress"/g)||[]).length,0);
 assert.equal((html.match(/id="baRunning"/g)||[]).length,1);
 assert.ok(!html.includes('id="aiReviewProgress"'));
 assert.ok(css.includes('#discoveryView .ba-review-footer .ba-review-options button:disabled'));
});
test('document checkbox selection is retained through mapping and saved per project',()=>{
 const ui=file('media/start.js'),host=file('test/generated/extension-source.txt');
 assert.ok(ui.includes("send('baSourceSelection',{digests:[...sourceSelectedDigests]})"));
 assert.ok(ui.includes("sourceSelectedDigests=new Set(Array.isArray(msg.baSelectedSources)?msg.baSelectedSources:[])"));
 assert.ok(!ui.includes("if(m.type==='discoveryImportDone'){sourceSelectedDigests.clear()"));
 assert.ok(!ui.includes("if(m.type==='discoverySourceRemoved'){sourceSelectedDigests.clear()"));
 assert.ok(host.includes("case 'baSourceSelection':"));
 assert.ok(host.includes("context.workspaceState.update('atgvAssist.baSelectedSources.'+activeProject.id"));
 assert.ok(host.includes('baSelectedSources,delivery'));
});
test('review apply stop retry skip have state-dependent visible and disabled actions',()=>{
 const ui=file('media/start.js');
 assert.match(ui,/stop\.classList\.toggle\('hidden',!applying\);stop\.disabled=!canStop/);
 assert.match(ui,/retry\.classList\.toggle\('hidden',applying\|\|!reviewApplyRetryAvailable/);
 assert.match(ui,/reviewApplyRetryAvailable=!!reviewApplyRetry/);
 assert.match(ui,/reviewApplyRetry=null;reviewApplyRetryAvailable=false/);
 assert.match(ui,/apply\.disabled=!!baBusyTask\|\|!mine\|\|!reviewCurrent/);
 assert.match(ui,/brGenerate:!!baBusyTask\|\|!mine\|\|!\(brState\?\.sourceDocuments\|\|\[\]\)\.length\|\|!reviewGood/);
});
for(const [name,review,acknowledge,expected] of [
 ['ready review',reviewed(),false,true],
 ['no replacements',reviewed('Ready',[{key:'problem',severity:'Medium',issue:'No replacement',suggestedAnswer:''}]),false,true],
 ['skipped review',JSON.stringify({readiness:'Skipped',skipped:true,suggestions:[]}),false,true],
 ['critical risk not acknowledged',reviewed('Needs attention',[{severity:'Critical',issue:'Missing owner',suggestedAnswer:''}]),false,false],
 ['critical risk explicitly acknowledged',reviewed('Needs attention',[{severity:'Critical',issue:'Missing owner',suggestedAnswer:''}]),true,true],
 ['high concern explicitly acknowledged',reviewed('Needs attention',[{severity:'High',issue:'Unclear case'}]),true,true],
 ['applied review with remaining critical warning',reviewed('Needs attention',[{severity:'Critical',issue:'Risk remains'}],true),true,true]
])test(name+' -> generation gate',()=>setup(async(reg,state)=>{
 state=await br.reviewed(reg,'demo',state.revision,{discoveryRevision:'D1',text:review});
 if(!expected){await assert.rejects(br.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal()]}),/risk acknowledgment/);return;}
 const result=await br.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal()],riskAccepted:acknowledge});
 assert.equal(result.brs.length,1);
 assert.equal(!!result.reviewRiskAccepted,acknowledge&&/Needs attention/.test(review));
 if(acknowledge)assert.equal(result.events.filter(event=>event.action==='ai-review-risks-acknowledged').length,1);
}));
test('accepted review risk can pass save and BA approval without silently skipping approval',()=>setup(async(reg,state)=>{
 state=await br.reviewed(reg,'demo',state.revision,{discoveryRevision:'D1',text:reviewed('Needs attention',[{severity:'Critical',issue:'Needs manual decision'}])});
 state=await br.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal()],riskAccepted:true});
 await assert.rejects(br.approve(reg,'demo',state.revision,{brId:'BR-001'}),/Save the BR draft/);
 state=await br.edit(reg,'demo',state.revision,{brId:'BR-001',content:proposal(),actor:'BA'});
 state=await br.approve(reg,'demo',state.revision,{brId:'BR-001',actor:'BA'});
 assert.equal(state.brs[0].status,'approved');
 assert.equal(state.reviewRiskAccepted.revision,'D1');
}));
test('acknowledgment cannot rescue stale discovery and is invalidated by a new revision',()=>setup(async(reg,state)=>{
 state=await br.reviewed(reg,'demo',state.revision,{discoveryRevision:'D1',text:reviewed('Needs attention',[{severity:'Critical',issue:'Risk'}])});
 state=await br.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal()],riskAccepted:true});
 state=await br.discoverySaved(reg,'demo',state.revision,'D2');
 assert.equal(state.reviewRiskAccepted,null);
 await assert.rejects(br.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal()],riskAccepted:true}),/Import, save discovery/);
}));
test('failed duplicate BR titles do not poison subsequent valid generation',()=>setup(async(reg,state)=>{
 state=await br.reviewed(reg,'demo',state.revision,{discoveryRevision:'D1',text:reviewed()});
 await assert.rejects(br.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal(),proposal()]}),/Duplicate generated BR title/);
 const again=await br.load(reg,'demo');assert.equal(again.brs.length,0);
 state=await br.generated(reg,'demo',again.revision,{discoveryRevision:'D1',requirements:[proposal('Claims'),proposal('Policies')]});
 assert.equal(state.brs.length,2);
}));
test('invalid generated proposal can be retried against unchanged review',()=>setup(async(reg,state)=>{
 state=await br.reviewed(reg,'demo',state.revision,{discoveryRevision:'D1',text:reviewed()});
 await assert.rejects(br.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[{...proposal(),title:''}]}),/Required text/);
 state=await br.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal()]});
 assert.equal(state.brs.length,1);
}));
test('unused uploaded source is deletable without invalidating existing review',()=>setup(async(reg,state)=>{
 state=await br.reviewed(reg,'demo',state.revision,{discoveryRevision:'D1',text:reviewed()});
 state=await br.addSources(reg,'demo',state.revision,[{name:'requirements.pdf',digest:'a'.repeat(64),storedName:'a'.repeat(64)+'.pdf'}]);
 state=await br.removeSource(reg,'demo',state.revision,{digest:'a'.repeat(64)});
 assert.equal(state.reviewRevision,'D1');
 assert.equal(state.sourceDocuments.length,0);
 assert.equal(state.events.at(-1).action,'source-deleted-unused');
}));
test('stale simultaneous writer cannot bypass approval or update',()=>setup(async(reg,state)=>{
 const prior=state.revision;
 state=await br.reviewed(reg,'demo',state.revision,{discoveryRevision:'D1',text:reviewed()});
 await assert.rejects(br.skipReview(reg,'demo',prior,{discoveryRevision:'D1',actor:'BA'}),/register changed/);
 state=await br.generated(reg,'demo',state.revision,{discoveryRevision:'D1',requirements:[proposal()]});
 assert.equal(state.brs[0].status,'draft');
}));
