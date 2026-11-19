'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const code=require('../src/architect-custom-stack');
test('Custom Stack accepts localhost only and never remote execution previews',()=>{
 assert.equal(code.loopbackPreview('http://127.0.0.1:5173/'),'http://127.0.0.1:5173/');
 assert.throws(()=>code.loopbackPreview('https://example.com/'),/localhost/);
 assert.throws(()=>code.loopbackPreview('http://localhost:5173/?token=secret'),/localhost/);
});
test('Custom Stack scans an existing React Vite project without copying or running its files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-custom-scan-'));
 try{
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'original-app',scripts:{dev:'vite',build:'vite build'},dependencies:{react:'^19'},devDependencies:{vite:'^8'}}));
  const sha='a'.repeat(40);
  let executed=0;
  const driver={inspectScripts:async()=>({repo:{root,sha,branch:'main',clean:true},targets:[{kind:'npm',relative:'',installed:false,scripts:['dev','build']}]}),runLocal:async()=>{executed++},localLogs:()=>({running:false})};
  const found=await code.scan(root,{driver});
  assert.equal(found.targets[0].framework,'React / Vite');
  assert.equal(found.targets[0].previewUrl,'http://127.0.0.1:5173/');
  assert.equal(found.targets[0].runnable,true);
  assert.equal(executed,0);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Custom Stack requires Git SHA and exact selected target before running',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-custom-run-'));
 try{
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{dev:'vite'},devDependencies:{vite:'^8'}}));
  const driver={inspectScripts:async()=>({repo:{root,sha:'b'.repeat(40),branch:'main',clean:true},targets:[{kind:'npm',relative:'',installed:false,scripts:['dev']}]}),localLogs:()=>({running:false})};
  await assert.rejects(code.run(root,{sha:'c'.repeat(40),driver}),/Git revision changed/);
  await assert.rejects(code.run(root,{sha:'b'.repeat(40),relative:'apps/web',driver}),/Select a detected application/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('UI has Custom Stack, requested roster controls, accessible icons and progress steps',()=>{
 const fsSync=require('node:fs');
 const html=fsSync.readFileSync(path.join(__dirname,'..','src/lib/webview/dashboard-html.js'),'utf8');
 const ui=fsSync.readFileSync(path.join(__dirname,'..','media/start.js'),'utf8');
 const host=fsSync.readFileSync(path.join(__dirname,'..','src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(ui,/Custom Stack \(scan existing repository\)/);
 for(const id of ['architectCustomScan','architectCustomRun','architectCustomStop','startupUnifiedLog','architectDownloadUnifiedLog','overviewUserRows'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const id of ['architectCustomScan','architectCustomRun','architectCustomStop'])
  assert.ok(host.includes("case '"+id+"':"),id);
 assert.match(html,/Assigned Jira Tasks/);
 assert.match(ui,/paintStartupStack\(summary,/);
 assert.match(html,/aria-label="Download unified error log"/);
 const start=ui.indexOf(' const brCell=item=>{',ui.indexOf('function renderBAJiraInventory()'));
 const block=ui.slice(start,ui.indexOf(' baJiraTableInstance=ATGVDataTables.mount(root,rows',start));
 assert.ok(!block.includes("answers.textContent='View 12 Answers'"));
 assert.ok(!block.includes("jira.textContent='View Jira · '"));
});
