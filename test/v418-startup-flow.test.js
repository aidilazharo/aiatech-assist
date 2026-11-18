'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
function fixture({permissionsOk=true,stackReady=true,checking=false}={}){
 let now=0,nextId=0;const timers=new Map(),sent=[],opened=[],nodes=new Map();
 const element=id=>{
  if(!nodes.has(id)){
   const classes=new Set(id==='extensionUpgradeModal'||id==='libraryUpdateModal'?['hidden']:[]);
   nodes.set(id,{textContent:'',classList:{contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)}});
  }return nodes.get(id);
 };
 const schedule=(fn,delay)=>{const id=++nextId;timers.set(id,{at:now+delay,fn});return id;};
 const cancel=id=>timers.delete(id);
 function advance(ms){
  const target=now+ms;let guard=0;
  while(true){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>target)break;
   if(++guard>5000)throw Error('Timer loop');now=next[1].at;timers.delete(next[0]);next[1].fn();
  }now=target;
 }
 const start=source.indexOf('function stopStartupAuto('),end=source.indexOf('function renderStartupPage()',start);
 assert.ok(start>=0&&end>start);
 const init=`let startupAutoTimer=null,startupAutoEnabled=true,startupAutoStage='',startupAutoNotice='',startupAutoDeadline=0,startupPage=0,startupSetupRequired=true;
 let startupAutoProject={id:'p1',name:'Project One',techStackId:'react',techStackCompanionId:''};
 let startupPermissions={ok:${permissionsOk}},startupScanComplete=true,startupConnectionVerified=true,startupOpenStackId='',startupCopilotModalOpen=false;
 let startupStackData={catalog:{available:true},stacks:[{id:'react',ready:${stackReady}}]},latestSoftwareUpdateState={busy:${checking}};
 const STARTUP_SCREEN_MS=5000;
 function renderStartupPage(){};function startupPayload(){return {email:'saved'};};`;
 const create=new Function('$','setTimeout','clearTimeout','Date','send','launchFromGate',init+source.slice(start,end)+`\nreturn {beginStartupAuto,stopStartupAuto,getPage:()=>startupPage,getEnabled:()=>startupAutoEnabled,getStage:()=>startupAutoStage,projectStep:()=>{startupSetupRequired=false;beginStartupAuto('project');},setChecking:value=>latestSoftwareUpdateState.busy=value};`);
 const api=create(element,schedule,cancel,{now:()=>now},(command,payload)=>sent.push({command,...payload}),data=>opened.push(data));
 return {api,advance,sent,opened,element};
}
test('completed setup displays each startup screen for five seconds before resuming the selected project',()=>{
 const x=fixture();x.api.beginStartupAuto('stack');x.advance(4999);assert.equal(x.api.getPage(),0);
 x.advance(1);assert.equal(x.api.getPage(),1);assert.equal(x.sent.length,0);
 x.advance(4999);assert.equal(x.sent.length,0);x.advance(1);
 assert.deepEqual(x.sent,[{command:'startupProceed',settings:{email:'saved'},autoResume:true,projectId:'p1'}]);
 x.api.projectStep();x.advance(4999);assert.equal(x.opened.length,0);x.advance(1);
 assert.deepEqual(x.opened,[{projectId:'p1',autoResume:true}]);
});
test('failed permissions or a missing selected stack stop automatic opening',()=>{
 for(const options of [{permissionsOk:false},{stackReady:false}]){
  const x=fixture(options);x.api.beginStartupAuto('stack');x.advance(6000);
  assert.equal(x.api.getEnabled(),false);assert.equal(x.sent.length,0);assert.equal(x.opened.length,0);
  assert.match(x.element('startupProceedInfo').textContent,/paused/i);
 }
});
test('an update check keeps the setup screen visible until its result is ready',()=>{
 const x=fixture({checking:true});x.api.beginStartupAuto('stack');x.advance(9000);assert.equal(x.api.getPage(),0);
 x.api.setChecking(false);x.advance(4999);assert.equal(x.api.getPage(),0);x.advance(251);assert.equal(x.api.getPage(),1);
});
