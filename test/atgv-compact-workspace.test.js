'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ui=read('media/ba-automatic-ui.js'),start=read('media/start.js'),html=read('src/lib/webview/dashboard-html.js');
test('activity has meaningful labels and filters without replaying jobs',()=>{
 const code=start.slice(start.indexOf('function atgvActivityName('),start.indexOf('function renderAtgvJobs('));
 const {name,match}=new Function(code+'\nreturn {name:atgvActivityName,match:atgvActivityMatches}')();
 assert.equal(name('baPublishPrepared'),'Publish Business Requirements');
 assert.equal(match({status:'running'},'active'),true);
 assert.equal(match({status:'failed'},'active'),false);
 assert.equal(match({status:'reconcile-required'},'attention'),true);
 assert.equal(match({status:'completed'},'finished'),true);
 assert.match(html,/id="atgvJobsFilter"/);
});
test('publication displays confirmed host counts for its own project only',()=>{
 const nodes={},get=id=>nodes[id]||={hidden:false,textContent:'',open:false,value:0,removeAttribute(){delete this.value}};
 const code=ui.slice(ui.indexOf(' function renderPublicationFeedback('),ui.indexOf(' function render(){'));
 const feedback=new Function('get','activeId','livePublication',code+'\nreturn renderPublicationFeedback;');
 feedback(get,'p',{projectId:'p',phase:'publishing',confirmed:6,total:153,message:'Confirmed 6'})('publishing','Publishing');
 assert.equal(nodes.baAutoLivePublish.hidden,false);
 assert.equal(nodes.baAutoLivePublishCount.textContent,'6 / 153 confirmed');
 assert.equal(nodes.baAutoLivePublishProgress.value,6/153*100);
 feedback(get,'other',{projectId:'p',phase:'publishing',confirmed:6,total:153})('publishing','Publishing');
 assert.equal(nodes.baAutoLivePublish.hidden,true);
 feedback(get,'p',null)('draft','EPERM: operation not permitted');
 assert.match(nodes.baAutoStatus.textContent,/Local save blocked/);
 assert.equal(nodes.baAutoTechnicalDetails.hidden,false);
 assert.match(nodes.baAutoTechnicalMessage.textContent,/EPERM/);
});
