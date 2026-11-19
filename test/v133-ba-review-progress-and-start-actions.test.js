'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const workflow=require('../src/br-workflow');
const {createReviewPrompt,parseReviewResponse}=require('../src/discovery-review');
const read=async file=>fs.readFile(path.join(__dirname,'..',file),'utf8');
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v133-'));try{const registry=new ProjectRegistry(root);await registry.create({id:'test133',name:'test133'});return await fn(registry);}finally{await fs.rm(root,{recursive:true,force:true});}}
function makeSource(){const text='Requirement discovery test source.';return {name:'input.pdf',digest:crypto.createHash('sha256').update(text).digest('hex'),byteDigest:crypto.createHash('sha256').update('file content').digest('hex'),characters:text.length,storedName:crypto.createHash('sha256').update(text).digest('hex')+'.pdf'};}

test('High and Critical review findings without safe replacement retain clarification guidance',()=>{
 const prompt=createReviewPrompt({problem:'Need an approval flow'});
 assert.match(prompt,/Do not invent facts/);
 assert.match(prompt,/resolutionGuidance/);
 const results=parseReviewResponse(JSON.stringify({readiness:'Needs attention',suggestions:[{key:'problem',severity:'Critical',issue:'Unknown approver',suggestedAnswer:'',resolutionGuidance:'Which named role has final approval authority?'},{key:'scope',severity:'High',issue:'Unknown cutoff',suggestedAnswer:'',resolutionGuidance:'Confirm the threshold in the approved policy.'}]}));
 assert.deepEqual(results.suggestions.map(x=>x.suggestedAnswer),['','']);
 assert.equal(results.suggestions[0].resolutionGuidance,'Which named role has final approval authority?');
 assert.equal(results.suggestions[1].severity,'High');
});

test('Repeated AI reviews preserve previous evidence and reject stale writes',()=>fixture(async registry=>{
 let s=await workflow.load(registry,'test133'); const file=makeSource();
 s=await workflow.addSources(registry,'test133',s.revision,[file]);
 s=await workflow.imported(registry,'test133',s.revision,{name:file.name,digest:file.digest,documents:[file]});
 const discoveryRevision='r-1';
 s=await workflow.discoverySaved(registry,'test133',s.revision,discoveryRevision,{answers:{problem:'Initial answer'}});
 const first=JSON.stringify({summary:'Review v1',readiness:'Needs attention',suggestions:[{key:'problem',severity:'High',issue:'Unclear rule',suggestedAnswer:''}]});
 s=await workflow.reviewed(registry,'test133',s.revision,{discoveryRevision,text:first});
 const outdated=s.revision;
 const second=JSON.stringify({summary:'Review v2',readiness:'Ready',suggestions:[]});
 s=await workflow.reviewed(registry,'test133',s.revision,{discoveryRevision,text:second});
 assert.equal(s.reviewText,second);
 assert.equal(s.reviewHistory.length,1);
 assert.equal(s.reviewHistory[0].text,first);
 assert.match(JSON.stringify(s.events),/discovery-reviewed/);
 await assert.rejects(workflow.reviewed(registry,'test133',outdated,{discoveryRevision,text:first}),/changed/i);
}));

test('BA header progress and action controls are wired to actual busy state',async()=>{
 const ui=await read('media/start.js'),css=await read('media/start.css');
 assert.match(ui,/\$\('baRunning'\)\.classList\.toggle\('hidden',!baBusyTask\)/);
 assert.match(css,/#discoveryView #baRunning:not\(\.hidden\)\{display:grid!important\}/);
 assert.match(ui,/stageProgress\('jiraRetire','Jira retirement review complete \(100%\)/);
 assert.match(ui,/baBusy\('jiraPreview','Checking JIRA changes and conflicts/);
});

test('Upload panel remains read-only after mapping; only header Restart offers source editing',async()=>{
 const ui=await read('media/start.js'),host=await read('test/generated/extension-source.txt');
 assert.match(ui,/const showSources=displayed==='upload'/);
 assert.doesNotMatch(ui,/const showSourceChange=/);
 assert.match(ui,/const sourceLocked=!sourceWindowOpen\|\|sourceMappingStarted/);
 assert.match(ui,/\$\('discoveryImport'\)\.disabled=sourceLocked/);
 assert.match(ui,/discoveryImport:!!baBusyTask\|\|discoveryImportBusy\|\|baMappingComplete\(\)/);
 assert.doesNotMatch(ui,/baRestartSources/);
 assert.match(host,/case 'restartDiscoverySources':\{/);
 assert.match(host,/approved Business Requirements and published Jira issues remain protected history/);
 assert.doesNotMatch(host,/id="baRestartSources"/);
 assert.match(host,/id="baNewRequirement"/);
});

test('Publish step exposes safe next-work navigation, without automatic approval or Jira write',async()=>{
 const ui=await read('media/start.js'),host=await read('test/generated/extension-source.txt');
 for(const id of ['baPostPublishActions','baStartMyWork','baStartSolutionDesigns','baStartSDLCReadiness'])assert.match(host,new RegExp('id="'+id+'"'));
 assert.match(ui,/\$\('baPostPublishActions'\)\.classList\.toggle\('hidden',!baPublishedCurrent\(\)\)/);
 assert.match(ui,/\$\('baStartMyWork'\)\.addEventListener\('click',\(\)=>\{navigate\('sdlc-roles'\)/);
 assert.match(ui,/\$\('baStartSolutionDesigns'\)\.addEventListener\('click',\(\)=>navigate\('planning'\)\)/);
 assert.match(ui,/\$\('baStartSDLCReadiness'\)\.addEventListener\('click',\(\)=>navigate\('flow'\)\)/);
});
