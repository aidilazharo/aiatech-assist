'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const readFile=require('node:fs').readFileSync;
const activity=require('../src/architect-stack-activity');
const errors=require('../src/architect-error-logs');
const source=readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const ui=readFile(path.join(__dirname,'../media/start.js'),'utf8');
const html=readFile(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');

test('diagnostics persist Save Stack through six stages, redact credentials and isolate projects',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-stack-activity-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const project='customer/one';
 await Promise.all([
  activity.append(root,project,'Save Stack','Selected custom: github_pat_abcdefghijklmnopqrstuvwxyz123'),
  activity.append(root,project,'Repository','Checkout checked'),
  activity.append(root,project,'Approval','Waiting for confirmation'),
  activity.append(root,project,'Install & Run 1/6','Scan repository'),
  activity.append(root,project,'Install & Run 4/6','npm install'),
  activity.append(root,project,'Install & Run 6/6','Mock preview verified')
 ]);
 await activity.append(root,'other','Save Stack','Unrelated project');
 const log=await activity.read(root,project);
 for(const text of ['Save Stack','Checkout checked','Waiting for confirmation','Scan repository','npm install','Mock preview verified'])
  assert.ok(log.content.includes(text),text);
 assert.equal(log.events,6);
 assert.ok(!log.content.includes('github_pat_abcdefghijklmnopqrstuvwxyz123'));
 assert.ok(!log.content.includes('Unrelated project'));
 assert.equal(await activity.read(root,'missing'),null);
 assert.ok(activity.paths(root,project).file.startsWith(path.join(root,'stack-activity')));
 assert.ok(!activity.paths(root,project).file.includes('customer/one'));
});
test('diagnostics remain bounded and refuse symlink log targets',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-stack-bounds-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(let i=0;i<225;i++)await activity.append(root,'bounded','Dependency '+i,'x'.repeat(4000));
 const log=await activity.read(root,'bounded');
 assert.ok(Buffer.byteLength(log.content,'utf8')<=activity.MAX_BYTES);
 const other=path.join(root,'outside.log');await fs.writeFile(other,'PRESERVE');
 const {folder,file}=activity.paths(root,'unsafe');await fs.mkdir(folder,{recursive:true});
 try{await fs.symlink(other,file);}catch(e){if(['EPERM','EACCES'].includes(e.code))return;throw e;}
 await assert.rejects(activity.append(root,'unsafe','Save Stack','bad'),/Unsafe stack activity log/);
 assert.equal(await fs.readFile(other,'utf8'),'PRESERVE');
});
test('custom-stack errors no longer fail due to unknown diagnostic category',()=>{
 errors.begin('v041-custom','custom-stack');
 errors.append('v041-custom','custom-stack','Waiting for user approval');
 errors.store({projectId:'v041-custom',kind:'custom-stack',error:'Local process failure'});
 assert.match(errors.get('v041-custom','custom-stack').content,/Waiting for user approval/);
 errors.clear('v041-custom','custom-stack');
});
test('existing unified log download exports successes and failures from Save Stack onward',()=>{
 assert.match(source,/recordStackActivity\(activeProject\.id,'Save Stack'/);
 assert.match(source,/recordStackActivity\(projectId,'Save Stack \/ complete'/);
 assert.match(source,/recordStackActivity\(projectId,'Install & Run '\+entry\.step/);
 assert.match(source,/case 'architectActivityStatus':\{/);
 assert.match(source,/case 'architectDownloadErrorLog':\{/);
 assert.match(source,/architectStackActivity\.read\(context\.globalStorageUri\.fsPath,activeProject\.id\)/);
 assert.match(source,/const activity=await architectStackActivity\.read/);
 assert.match(source,/Still waiting for ATGV confirmation/);
 assert.match(source,/clearInterval\(reminder\)/);
 assert.match(source,/approved!==action/);
 assert.match(ui,/send\('architectActivityStatus',\{projectId:activeId\}\)/);
 assert.match(ui,/msg\.type!=='architectLogState'/);
 assert.match(ui,/download the diagnostic log to troubleshoot/i);
 assert.match(html,/id="architectDownloadUnifiedLog"/);
 assert.match(html,/Download full Technology Stack activity from Save Stack onward/);
});
