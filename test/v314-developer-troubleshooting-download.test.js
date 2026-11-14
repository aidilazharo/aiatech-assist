'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const reporter=require('../src/developer-diagnostic-report');
const extension=()=>require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const webview=()=>require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');

test('Developer UI has downloadable diagnostics for selected BR and a save-dialog command',()=>{
 assert.match(extension(),/id="developerBrDownloadDiagnostics"/);
 assert.match(extension(),/case 'developerBrDownloadDiagnostics'/);
 assert.match(extension(),/showSaveDialog\(/);
 assert.match(webview(),/send\('developerBrDownloadDiagnostics',\{brId:developerBrSelected,activity:/);
 assert.match(webview(),/developerBrDiagnosticSaved/);
});

test('TDD download includes method, route, locked test and implementation route, attempts, model, and failure diagnostics',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-diag-'));
 try{
  await fs.mkdir(path.join(root,'server'),{recursive:true});
  await fs.mkdir(path.join(root,'tests'),{recursive:true});
  await fs.writeFile(path.join(root,'tests','br-001.test.mjs'),"import {test} from 'node:test';\ntest('create',()=>fetch(base+'/api/names',{method:'POST'}));\n");
  await fs.writeFile(path.join(root,'server','index.mjs'),"export function makeApp() { app.get('/api/health',()=>{}); return {app}; }");
  const record={projectId:'example-project',brId:'BR-001',runId:'run-sample',revision:3,model:'selected-model',
   status:'needs-attention',lastFailedCriterion:'AC-02',lastError:'AssertionError: actual: 404 expected: 201',
   worktree:root,criteria:[{id:'AC-02',description:'Create person name',status:'needs-attention',testFiles:['tests/br-001.test.mjs']}],
   repairHistory:[{at:'2026-11-13T00:00:00Z',criterion:'AC-02',category:'http-route-not-found',outcome:'failed',attempt:3,model:'selected-model',message:'POST /api/names returned 404'}],
   evidence:[{at:'2026-11-13T00:00:01Z',phase:'GREEN',operation:'npm test',target:'root',passed:false,logs:'actual: 404 expected: 201'}],
   checkpoint:{at:'2026-11-13T00:00:02Z',files:{'server/index.mjs':'abc123'}}};
  const output=await reporter.createReport({record,brId:'BR-001',projectId:'example-project',stackId:'react',activity:['GREEN failure: POST /api/names']});
  for(const expected of ['AC-02','POST /api/names','GET /api/health','selected-model','http-route-not-found','actual: 404 expected: 201','server/index.mjs','GREEN failure'])assert.ok(output.includes(expected),'missing '+expected);
  assert.ok(!output.includes('export function makeApp()'),'source bodies should never appear');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('Diagnostics sanitize credential values in failure, model, server and activity text',async()=>{
 const report=await reporter.createReport({projectId:'my-project',brId:'BR-002',
  record:{projectId:'my-project',brId:'BR-002',lastError:'Authorization: Bearer abcdefghijklmnop\npassword=abc123\naccess_token: secret123\nurl=https://name:secret@site.example/path?token=hello',repairHistory:[{message:'api_key=keyvalue123'}]},
  serverLogs:'cookie: sessionSecret\nsk-abcdef0123456789ZZZZZZ',activity:['password: hunter2']});
 for(const secret of ['abcdefghijklmnop','abc123','secret123','sessionSecret','keyvalue123','hunter2','hello','abcdef0123456789ZZZZZZ'])assert.equal(report.includes(secret),false,'leaked '+secret);
 assert.match(report,/redacted/);
});

test('Report rejects crossing BR scope and unsafe/symlinked paths',async()=>{
 await assert.rejects(()=>reporter.createReport({projectId:'one',brId:'BR-002',record:{projectId:'two',brId:'BR-002'}}),/another project/);
 assert.equal(reporter.cleanRelative('../.env'),'');
 assert.equal(reporter.cleanRelative('/tmp/secrets'),'');
 assert.equal(reporter.cleanRelative('server/index.mjs'),'server/index.mjs');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-safe-'));
 try{
  await fs.symlink(__filename,path.join(temp,'server-link'));
  assert.equal(await reporter.safeRead(temp,'server-link'),null);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('Missing saved run still produces a diagnostic report with explicit missing evidence',async()=>{
 const output=await reporter.createReport({projectId:'p1',brId:'BR-003'});
 assert.match(output,/No literal \/api/);
 assert.match(output,/No source code/);
 assert.match(output,/TROUBLESHOOTING NOTES/);
});
