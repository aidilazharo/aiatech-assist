'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const ui=read('media/start.js');
const css=read('media/start.css');
const host=read('src/lib/runtime/extension-runtime.js');

function webviewHarness(){
 const nodes=new Map(),sent=[];
 const doc={activeElement:null};
 function node(id){
  if(!nodes.has(id)){
   const classes=new Set(['hidden']);
   const value={id,textContent:'',dataset:{},disabled:false,listeners:{},attributes:{},
    classList:{
     add(name){classes.add(name);},remove(name){classes.delete(name);},
     toggle(name,active){if(active)classes.add(name);else classes.delete(name);},
     contains(name){return classes.has(name);}
    },
    addEventListener(kind,callback){this.listeners[kind]=callback;},
    setAttribute(name,value){this.attributes[name]=String(value);},
    focus(){doc.activeElement=this;}
   };
   nodes.set(id,value);
  }
  return nodes.get(id);
 }
 let messageHandler=null;
 const window={addEventListener(type,cb){if(type==='message')messageHandler=cb;}};
 const start=ui.indexOf('let displayedExtensionUpgrade=null;');
 assert.ok(start>0);
 const setup=new Function('$','send','window','document',ui.slice(start));
 setup(node,(command,values)=>sent.push({command,...values}),window,doc);
 function emit(value){assert.ok(messageHandler);messageHandler({data:value});}
 function click(id){assert.ok(node(id).listeners.click);node(id).listeners.click();}
 return {node,emit,click,sent,doc};
}
test('Upgrade modal stays open throughout installation and only closes after a host completed event',()=>{
 const x=webviewHarness(),id='upgrade-1';
 x.emit({type:'extensionUpgradeOffer',requestId:id,currentVersion:'0.3.87',version:'0.3.88',repository:'Acme/aia',tag:'v0.3.88-build.1'});
 assert.equal(x.node('extensionUpgradeModal').classList.contains('hidden'),false);
 assert.equal(x.node('extensionUpgradeProgress').classList.contains('hidden'),true);
 x.click('extensionUpgradeInstall');
 assert.equal(x.sent.at(-1).command,'extensionUpgradeDecision');
 assert.equal(x.sent.at(-1).action,'Install Upgrade');
 assert.equal(x.node('extensionUpgradeModal').classList.contains('hidden'),false);
 assert.equal(x.node('extensionUpgradeProgress').classList.contains('hidden'),false);
 for(const button of ['extensionUpgradeLater','extensionUpgradeView','extensionUpgradeInstall'])
  assert.equal(x.node(button).disabled,true,button);
 let prevented=false;
 x.node('extensionUpgradeModal').listeners.keydown({key:'Escape',preventDefault(){prevented=true;}});
 assert.equal(prevented,true);
 x.click('extensionUpgradeLater');
 assert.equal(x.node('extensionUpgradeModal').classList.contains('hidden'),false);
 x.emit({type:'extensionUpgradeProgress',requestId:'another-request',stage:'completed'});
 assert.equal(x.node('extensionUpgradeModal').classList.contains('hidden'),false);
 for(const stage of ['downloading','verifying','staging','installing']){
  x.emit({type:'extensionUpgradeProgress',requestId:id,stage,title:stage,message:'Progress '+stage});
  assert.equal(x.node('extensionUpgradeModal').classList.contains('hidden'),false);
  assert.equal(x.node('extensionUpgradeProgress').dataset.state,'installing');
 }
 x.emit({type:'extensionUpgradeProgress',requestId:id,stage:'completed',title:'Upgrade installed successfully'});
 assert.equal(x.node('extensionUpgradeModal').classList.contains('hidden'),true);
 assert.equal(x.node('extensionUpgradeModal').attributes['aria-hidden'],'true');
 assert.equal(x.sent.filter(m=>m.command==='extensionUpgradeDecision').length,1);
});
test('Failed installation remains visible with Retry; Later closes only after failure',()=>{
 const x=webviewHarness(),id='upgrade-2';
 x.emit({type:'extensionUpgradeOffer',requestId:id,version:'0.3.88'});
 x.click('extensionUpgradeInstall');
 x.emit({type:'extensionUpgradeProgress',requestId:id,stage:'failed',message:'Checksum failed'});
 assert.equal(x.node('extensionUpgradeModal').classList.contains('hidden'),false);
 assert.equal(x.node('extensionUpgradeProgress').dataset.state,'failed');
 assert.equal(x.node('extensionUpgradeInstall').textContent,'Retry Install');
 assert.equal(x.node('extensionUpgradeInstall').disabled,false);
 x.click('extensionUpgradeInstall');
 assert.deepEqual(x.sent.at(-1),{command:'extensionUpgradeRetry',requestId:id});
 assert.equal(x.node('extensionUpgradeModal').classList.contains('hidden'),false);
 x.emit({type:'extensionUpgradeProgress',requestId:id,stage:'failed',message:'Network error'});
 x.click('extensionUpgradeLater');
 assert.equal(x.node('extensionUpgradeModal').classList.contains('hidden'),true);
 assert.deepEqual(x.sent.at(-1),{command:'extensionUpgradeDecision',requestId:id,action:'Later'});
});
test('Host sends actual download, checksum, staging and install completion stages',async()=>{
 const begin=host.indexOf('// Only the host can confirm that VSIX download');
 const end=host.indexOf('async function checkExtensionRelease(',begin);
 assert.ok(begin>=0&&end>begin);
 const posted=[],reports=[];
 let completeInstall,restarter=0;
 const waitForInstall=new Promise(resolve=>{completeInstall=resolve;});
 const fakeDashboard={webview:{postMessage:async value=>{posted.push(value);return true;}}};
 const fakeUpdater={downloadVerified:async(_release,{token,onProgress})=>{
  assert.equal(token,'secret-PAT');
  for(const stage of ['downloading','verifying','staging'])await onProgress(stage);
  return '/tmp/verified.vsix';
 }};
 const fakeVscode={Uri:{file:file=>({fsPath:file})},commands:{executeCommand:async(cmd,file)=>{
  assert.equal(cmd,'workbench.extensions.installExtension');
  assert.equal(file.fsPath,'/tmp/verified.vsix');
  await waitForInstall;
 }},window:{showErrorMessage:async()=>null},env:{openExternal:async()=>{}}};
 const setup=new Function('dashboard','vscode','path','releaseUpdater','report','restart','context','pendingExtensionUpgradeOffers','updatePreferences','crypto','require',host.slice(begin,end)+'\nreturn {performVerifiedExtensionInstall};');
 const api=setup(fakeDashboard,fakeVscode,path,fakeUpdater,x=>reports.push(x),async()=>{restarter++;},{globalStorageUri:{fsPath:'/tmp'}},new Map(),()=>({promptForUpdates:true}),{randomUUID:()=> 'upgrade-id'},()=>({version:'0.3.87'}));
 const operation={requestId:'upgrade-id',release:{version:'0.3.88',url:'https://github.com/Acme/aia'},token:'secret-PAT',running:false};
 const action=api.performVerifiedExtensionInstall(operation);
 for(let i=0;i<12&&!posted.some(v=>v.stage==='installing');i++)await Promise.resolve();
 assert.ok(posted.some(v=>v.stage==='installing'),'installer must report live progress while unresolved');
 assert.equal(posted.some(v=>v.stage==='completed'),false,'do not close while VS Code installation is pending');
 completeInstall();await action;
 assert.ok(posted.some(v=>v.stage==='completed'));
 assert.equal(restarter,1);
 assert.equal(JSON.stringify(posted).includes('secret-PAT'),false);
 assert.equal(reports.length,0);
});
test('Verified installer failures are reported to the open dialog without claiming completion',async()=>{
 const begin=host.indexOf('// Only the host can confirm that VSIX download');
 const end=host.indexOf('async function checkExtensionRelease(',begin);
 const posted=[],context={globalStorageUri:{fsPath:'/tmp'}};
 const setup=new Function('dashboard','vscode','path','releaseUpdater','report','restart','context','pendingExtensionUpgradeOffers','updatePreferences','crypto','require',host.slice(begin,end)+'\nreturn {performVerifiedExtensionInstall};');
 const api=setup({webview:{postMessage:async x=>{posted.push(x);return true;}}},
  {Uri:{file:x=>x},commands:{executeCommand:async()=>{throw Error('Install failed');}},window:{showErrorMessage:async()=>null},env:{openExternal:async()=>{}}},
  path,{downloadVerified:async()=>'/tmp/verified.vsix'},()=>{},async()=>{},context,new Map(),()=>({}),{randomUUID:()=> 'a'},()=>({version:'0.3.87'}));
 const op={requestId:'upgrade-id',release:{url:'https://github.com/Acme/aia'},token:'token',running:false};
 await api.performVerifiedExtensionInstall(op);
 assert.equal(op.running,false);
 assert.equal(posted.at(-1).stage,'failed');
 assert.match(posted.at(-1).message,/Install failed/);
 assert.equal(posted.some(x=>x.stage==='completed'),false);
});
test('Readiness diagnostic download sits at bottom left with no redundant explanation',()=>{
 const start=html.indexOf('id="startupComputerCard"');
 const end=html.indexOf('id="startupConnectionForm"',start);
 assert.ok(start>=0&&end>start);
 const markup=html.slice(start,end);
 assert.ok(markup.indexOf('id="startupUnifiedLog"')>markup.indexOf('id="startupInstallFeedback"'));
 assert.doesNotMatch(markup,/Includes installer status, verification and troubleshooting details\./);
 assert.match(css,/#startupComputerCard\{display:flex;flex-direction:column;\}/);
 assert.match(css,/#startupComputerCard \.atgv-startup-diagnostics-footer\{margin-top:auto;align-self:stretch;justify-content:flex-start;\}/);
 assert.match(ui,/for\(const id of \['startupUnifiedLog','gateUnifiedLog'\]\)/);
 assert.match(host,/case 'startupExportUnifiedLog':/);
});
