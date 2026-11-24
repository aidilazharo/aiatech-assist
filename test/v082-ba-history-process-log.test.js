'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/ba-automatic-ui.js'),host=read('media/start.js');
const history=require('../media/completed-br-history'),logs=require('../src/ba-process-diagnostics');
test('automatic BR log button is immediately before Publish and shares the existing exporter',()=>{
 const start=html.indexOf('id="baAutoProcessLog"'),end=html.indexOf('id="baAutoPublish"');
 assert.ok(start>=0&&end>start);assert.doesNotMatch(html.slice(start,end),/<button[^>]*id=/);
 assert.match(host,/\$\('baAutoProcessLog'\)\.addEventListener\('click',downloadBAProcessLog\)/);
 assert.match(host,/send\('baDownloadProcessLog',\{projectId:activeId\}\)/);
 assert.match(ui,/baProcessLogPendingProject===activeId/);
});
test('completed badge and list use the same grouped history, not approval or preview status',()=>{
 const source=ui.slice(ui.indexOf('  const completedGroups='),ui.indexOf("  const uploadTarget="));
 const run=new Function('ATGVCompletedBRHistory','completedBARecords','get','phase',source+'\nreturn completedReady;');
 const list={classList:{toggle:(name,value)=>{list.hidden=value;}}},empty={};
 const get=id=>id==='baCompletedList'?list:empty;
 assert.equal(run(history,()=>[],get,'ready'),false);assert.equal(list.hidden,true);assert.equal(empty.hidden,false);
 assert.match(empty.textContent,/Publish approved requirements/);
 assert.equal(run(history,()=>[],get,'published'),false);assert.match(empty.textContent,/No completed history/);
 assert.equal(run(history,()=>[{requirements:[{id:'BR-001',title:'Verified history'}]}],get,'ready'),true);
 assert.equal(list.hidden,false);assert.equal(empty.hidden,true);
});
test('diagnostic snapshot records actual history and preparation without exporting source text',()=>{
 const text=logs.exportText({projectId:'test-project',register:{completedCycles:[{requirements:[]}],completedIndex:[{id:'BR-1'}],jiraPendingChanges:2},preparation:{phase:'ready',stage:'jira',preview:{conflicts:[],changes:[{}]},sourceNotes:['PRIVATE SOURCE']}});
 for(const item of ['Completed cycles: 1','Completed index entries: 1','Jira pending changes: 2','Automatic phase: ready','Automatic stage: jira'])assert.ok(text.includes(item),item);
 assert.doesNotMatch(text,/PRIVATE SOURCE/);
});
