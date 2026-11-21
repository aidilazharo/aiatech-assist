'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=filename=>fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
const source=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
const html=read('src/lib/webview/dashboard-html.js');
const css=read('media/start.css');
function drawRuntime({busy=false,phase='',error='',runtime={},scan=null}={}){
 const label={textContent:''},detail={textContent:''},panel={dataset:{},textContent:''};
 const controls={architectCustomRuntime:panel,architectCustomRuntimeLabel:label,
  architectCustomRuntimeDetail:detail,architectCustomCheckStatus:{disabled:false},
  architectCustomOpenPreview:{disabled:true}};
 const begin=source.indexOf('function architectCustomDrawRuntime(){');
 const end=source.indexOf('\nfunction architectCustomSetProgress(',begin);
 assert.ok(begin>=0&&end>begin);
 const body=source.slice(begin,end);
 const run=new Function('$','activeId','architectCustomBusy','architectCustomOperation','architectCustomLastError',
  'architectCustomRuntime','architectCustomInfo','architectCustomStatusPending',
  body+'\narchitectCustomDrawRuntime();');
 const actual={projectId:'project-a',checked:true,running:false,pid:null,previewUrl:'',reachable:null,exitCode:null,...runtime};
 run(id=>controls[id],'project-a',busy,phase,error,actual,scan?{projectId:'project-a',...scan}:null,false);
 return {state:panel.dataset.state,title:label.textContent,detail:detail.textContent,
  previewEnabled:!controls.architectCustomOpenPreview.disabled};
}
test('100% repository scan does not incorrectly indicate an application server started',()=>{
 const result=drawRuntime({runtime:{checked:true,running:false},scan:{targets:[{relative:'ReactTS_Frontend'}]}});
 assert.equal(result.state,'stopped');
 assert.equal(result.title,'APPLICATION NOT RUNNING');
 assert.match(result.detail,/Scan complete, but NO server was started/);
 assert.equal(result.previewEnabled,false);
});
test('pending VS Code confirmation clearly indicates that no start action has executed',()=>{
 const result=drawRuntime({busy:true,phase:'WAITING FOR VS CODE CONFIRMATION'});
 assert.equal(result.state,'working');
 assert.match(result.title,/WAITING FOR VS CODE CONFIRMATION/);
 assert.match(result.detail,/no application script runs until you approve/);
});
test('runtime status distinguishes reachable real process from mock preview and failed health',()=>{
 const normal=drawRuntime({runtime:{running:true,pid:4521,previewUrl:'http://127.0.0.1:5173/',reachable:true}});
 assert.equal(normal.state,'running');
 assert.equal(normal.title,'APPLICATION RUNNING');
 assert.match(normal.detail,/PID 4521/);
 assert.equal(normal.previewEnabled,true);
 const mock=drawRuntime({runtime:{running:true,pid:4522,previewUrl:'http://127.0.0.1:5173/',mockPreview:true,reachable:true}});
 assert.match(mock.detail,/MOCK DATA preview/);
 const unhealthy=drawRuntime({runtime:{running:true,reachable:false}});
 assert.equal(unhealthy.state,'working');
 assert.equal(unhealthy.title,'PROCESS RUNNING — PREVIEW NOT REACHABLE');
 assert.equal(unhealthy.previewEnabled,false);
});
test('stopped and failed processes never enable Open Preview',()=>{
 assert.equal(drawRuntime({runtime:{running:false,exitCode:1}}).previewEnabled,false);
 assert.match(drawRuntime({runtime:{running:false,exitCode:1}}).detail,/exited with code 1/);
 assert.equal(drawRuntime({error:'Dependencies cannot be installed.'}).state,'failed');
 assert.equal(drawRuntime({error:'Run cancelled by user.'}).title,'ACTION CANCELLED');
 const live=drawRuntime({error:'Previous run failed',runtime:{running:true,reachable:true,previewUrl:'http://127.0.0.1:5173/'}});
 assert.equal(live.title,'APPLICATION RUNNING','Live runtime evidence supersedes a stale failure');
});
test('single shared progress bar, runtime status controls, and real process verification are wired',()=>{
 assert.equal((html.match(/id="architectStackProgress"/g)||[]).length,1);
 assert.equal((html.match(/id="architectCustomProgress"/g)||[]).length,0);
 for(const id of ['architectCustomRuntime','architectCustomRuntimeLabel','architectCustomRuntimeDetail','architectCustomCheckStatus','architectCustomOpenPreview'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(source,/send\('architectCustomStatus',\{projectId:activeId\}\)/);
 assert.match(source,/send\('architectCustomOpenPreview',\{projectId:activeId\}\)/);
 assert.match(source,/m.type==='architectCustomStatusResult'/);
 assert.match(source,/architectCustomOperation='WAITING FOR VS CODE CONFIRMATION'/);
 assert.match(host,/case 'architectCustomStatus':\{/);
 assert.match(host,/case 'architectCustomOpenPreview':\{/);
 assert.match(host,/developerGit\.localLogs\(\)/);
 assert.match(host,/value\.reachable=res\.ok/);
 assert.match(host,/AbortSignal\.timeout\(2600\)/);
 assert.match(host,/if\(!live\.running/);
 assert.match(css,/\.atgv-custom-runtime\[data-state="running"\]/);
});
