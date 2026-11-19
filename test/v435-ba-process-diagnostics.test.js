'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const read=require('node:fs').readFileSync;
const os=require('node:os');
const path=require('node:path');
const logs=require('../src/ba-process-diagnostics');
const root=path.join(__dirname,'..'),html=read(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8'),
 ui=read(path.join(root,'media/start.js'),'utf8'),
 host=read(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
async function sandbox(run){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-log-'));
 try{return await run(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('BA log icon appears directly to right of Previous Step and is always independently clickable',()=>{
 const parent=html.slice(html.indexOf('id="baNextStepRow"'),html.indexOf('</div>',html.indexOf('id="baNextStepRow"')));
 assert.ok(parent.indexOf('id="baPreviousStep"')>=0);
 assert.ok(parent.indexOf('id="baDownloadProcessLog"')>parent.indexOf('id="baPreviousStep"'));
 assert.ok(parent.indexOf('id="baDownloadProcessLog"')<parent.indexOf('id="baNextStep"'));
 assert.match(parent,/aria-label="Download Business Requirements troubleshooting log"/);
 assert.match(ui,/send\('baDownloadProcessLog',\{projectId:activeId\}\)/);
 assert.match(ui,/m\.type==='baProcessLogResult'/);
 assert.match(host,/case 'baDownloadProcessLog':/);
});
test('Local process log persists chronological actions and renders saved BR register history',()=>sandbox(async dir=>{
 await logs.append(dir,'tech-cockpit',{stage:'upload',action:'importDiscovery',status:'started'});
 await logs.append(dir,'tech-cockpit',{stage:'preflight',action:'section-1-of-9',status:'ai-unverified',details:'AI timed out'});
 await logs.append(dir,'tech-cockpit',{stage:'mapping',action:'save-mapping',status:'committed'});
 const entries=await logs.read(dir,'tech-cockpit');
 assert.equal(entries.length,3);
 assert.deepEqual(entries.map(x=>x.stage),['upload','preflight','mapping']);
 const register={revision:'revision-1',sourceDocuments:[{name:'Confidential.docx'}],brs:[{status:'approved'}],
  synced:{'BR-001':{key:'TC-101'}},events:[{at:'2026-11-19T00:00:00Z',action:'br-approved',brId:'BR-001'},
  {at:'2026-11-19T01:00:00Z',action:'jira-synced',key:'TC-101',summary:'Private source requirement text'}]};
 const report=logs.exportText({projectId:'tech-cockpit',events:entries,register,checkpoint:{present:true}});
 for(const term of ['BUSINESS REQUIREMENTS PROCESS TROUBLESHOOTING LOG','br-approved','jira-synced','AI timed out','Mapping checkpoint: Available'])
  assert.ok(report.includes(term),term);
 assert.ok(!report.includes('Confidential.docx'));
 assert.ok(!report.includes('Private source requirement text'));
}));
test('Project separation protects logs and download rejects invalid project IDs',()=>sandbox(async dir=>{
 await logs.append(dir,'tech-cockpit',{stage:'review',action:'brApprove',status:'finished'});
 await logs.append(dir,'gate',{stage:'review',action:'brJiraSync',status:'failed'});
 assert.deepEqual((await logs.read(dir,'tech-cockpit')).map(x=>x.action),['brApprove']);
 assert.deepEqual((await logs.read(dir,'gate')).map(x=>x.action),['brJiraSync']);
 assert.throws(()=>logs.fileFor(dir,'../private'),/project identity/);
 assert.throws(()=>logs.exportText({projectId:'../private'}),/Invalid BA project/);
}));
test('Troubleshooting log strips Authorization, personal email and PAT credentials',()=>sandbox(async dir=>{
 const secret='Authorization: Bearer abc1234 && github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ user@work.example';
 await logs.append(dir,'tech-cockpit',{stage:'mapping',action:'processDiscoverySources',status:'failed',details:secret});
 const report=logs.exportText({projectId:'tech-cockpit',events:await logs.read(dir,'tech-cockpit')});
 for(const phrase of ['abc1234','github_pat_ABCDEFGHIJKLMNOP','user@work.example'])assert.ok(!report.includes(phrase));
 assert.match(report,/REDACTED/);
}));
test('Host captures full lifecycle, errors, preflight, mapping and cross-section status',()=>{
 for(const term of ['recordBAProcess({stage:\'preflight\'','recordBAProcess({stage:\'mapping\'','recordBAProcess({stage:\'cross-section\'',
   'baAction=isBAProcessCommand','baFailure=String(e.message||e)','baProcessDiagnostics.exportText','mapping','brJiraSync'])
  assert.ok(host.includes(term),term);
 assert.match(host,/stage:'mapping',action:'processDiscoverySources',status:e\.name==='AbortError'\?'cancelled':'failed'/);
});
