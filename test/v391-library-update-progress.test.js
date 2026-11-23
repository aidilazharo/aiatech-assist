'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const ui=read('media/start.js');
const css=read('media/start.css');
const host=read('src/lib/runtime/extension-runtime.js');

function fixture(){
 const nodes=new Map(),messages=[],doc={activeElement:null};
 function node(id){
  if(!nodes.has(id)){
   const classes=new Set(['hidden']);
   nodes.set(id,{id,disabled:false,textContent:'',dataset:{},attributes:{},style:{},
    isConnected:true,listeners:{},
    classList:{contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x),
     toggle:(x,active)=>active?classes.add(x):classes.delete(x)},
    addEventListener(type,cb){this.listeners[type]=cb;},
    setAttribute(key,value){this.attributes[key]=String(value);},
    focus(){doc.activeElement=this;}
   });
  }
  return nodes.get(id);
 }
 let listener;
 const win={addEventListener(type,handler){if(type==='message')listener=handler;}};
 const start=ui.indexOf('let displayedLibraryUpdate=null,libraryUpdatePriorFocus=null');
 const end=ui.indexOf('let displayedExtensionUpgrade=null;',start);
 assert.ok(start>=0&&end>start);
 const run=new Function('$','send','window','document',ui.slice(start,end));
 run(node,(command,options)=>messages.push({command,...options}),win,doc);
 return {node,messages,emit:data=>listener({data}),click:id=>node(id).listeners.click(),
  key:(id,key)=>{let prevented=false;node(id).listeners.keydown({key,preventDefault(){prevented=true;}});return prevented;}};
}
test('The branded update modal includes an accessible milestone progress bar',()=>{
 for(const id of ['libraryUpdateProgress','libraryUpdateProgressTitle','libraryUpdateProgressMessage',
  'libraryUpdateProgressBar','libraryUpdateProgressPercent','libraryUpdateProgressIndicator',
  'catalogPullProgress','catalogPullProgressBar','catalogPullProgressPercent'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/id="libraryUpdateProgressBar"[^>]*role="progressbar"[^>]*aria-valuemax="100"/);
 assert.match(css,/\.atgv-library-update-indicator/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('Pull Library stays open while real host stages advance; only completion closes the dialog',()=>{
 const x=fixture(),id='offer-1';
 x.emit({type:'libraryUpdateOffer',requestId:id,installedVersion:'1.1.14',remoteVersion:'1.1.15',repository:'Acme/catalog'});
 assert.equal(x.node('libraryUpdateModal').classList.contains('hidden'),false);
 assert.equal(x.node('libraryUpdateProgress').classList.contains('hidden'),true);
 x.click('libraryUpdatePull');
 assert.deepEqual(x.messages.at(-1),{command:'libraryUpdateDecision',requestId:id,action:'Pull Library'});
 assert.equal(x.node('libraryUpdateModal').classList.contains('hidden'),false);
 assert.equal(x.node('libraryUpdateProgress').classList.contains('hidden'),false);
 assert.equal(x.node('libraryUpdateLater').disabled,true);
 assert.equal(x.node('libraryUpdatePull').disabled,true);
 assert.equal(x.key('libraryUpdateModal','Escape'),true);
 x.emit({type:'libraryUpdateProgress',requestId:'stale',stage:'completed',percent:100});
 assert.equal(x.node('libraryUpdateModal').classList.contains('hidden'),false);
 for(const percent of [5,20,35,50,75,88,96]){
  x.emit({type:'libraryUpdateProgress',requestId:id,stage:'running',percent,title:'Checking stage '+percent,message:'Working'});
  assert.equal(x.node('libraryUpdateProgressBar').attributes['aria-valuenow'],String(percent));
  assert.equal(x.node('libraryUpdateProgressIndicator').style.width,percent+'%');
  assert.equal(x.node('libraryUpdateModal').classList.contains('hidden'),false);
 }
 x.click('libraryUpdateLater');
 assert.equal(x.node('libraryUpdateModal').classList.contains('hidden'),false);
 x.emit({type:'libraryUpdateProgress',requestId:id,stage:'completed',percent:100,message:'Catalog verified'});
 assert.equal(x.node('libraryUpdateModal').classList.contains('hidden'),true);
 assert.equal(x.messages.length,1,'completion must not send a duplicate decision');
});
test('update offer displays each library version once and explains a same-version build',()=>{
 const x=fixture();
 x.emit({type:'libraryUpdateOffer',requestId:'version',installedVersion:'1.1.15',remoteVersion:'1.1.17',remoteTag:'v1.1.17-source-build.11'});
 assert.equal(x.node('libraryUpdateCurrent').textContent,'v1.1.15');
 assert.equal(x.node('libraryUpdateNext').textContent,'v1.1.17 · build 11');
 x.emit({type:'libraryUpdateOffer',requestId:'build',installedVersion:'1.1.17',remoteVersion:'1.1.17',
  installedTag:'v1.1.17-source-build.11',remoteTag:'v1.1.17-source-build.12',installedVersionWarning:'Check local changes.'});
 assert.equal(x.node('libraryUpdateCurrent').textContent,'v1.1.17 · build 11');
 assert.equal(x.node('libraryUpdateNext').textContent,'v1.1.17 · build 12');
 assert.match(x.node('libraryUpdateDescription').textContent,/build is available/);
 assert.match(x.node('libraryUpdateDescription').textContent,/Check local changes/);
});
test('Failure keeps the dialog open with a Retry Pull action; Later works only afterward',()=>{
 const x=fixture(),id='offer-2';
 x.emit({type:'libraryUpdateOffer',requestId:id,remoteVersion:'1.1.15'});
 x.click('libraryUpdatePull');
 x.emit({type:'libraryUpdateProgress',requestId:id,stage:'failed',percent:50,message:'GitHub main unavailable'});
 assert.equal(x.node('libraryUpdateModal').classList.contains('hidden'),false);
 assert.equal(x.node('libraryUpdateProgress').dataset.state,'failed');
 assert.equal(x.node('libraryUpdatePull').textContent,'Retry Pull');
 assert.equal(x.node('libraryUpdatePull').disabled,false);
 assert.equal(x.node('libraryUpdateLater').disabled,false);
 x.click('libraryUpdatePull');
 assert.deepEqual(x.messages.at(-1),{command:'libraryUpdateRetry',requestId:id});
 assert.equal(x.node('libraryUpdateProgressBar').attributes['aria-valuenow'],'0');
 x.emit({type:'libraryUpdateProgress',requestId:id,stage:'failed',message:'Permission denied'});
 x.click('libraryUpdateLater');
 assert.equal(x.node('libraryUpdateModal').classList.contains('hidden'),true);
 assert.deepEqual(x.messages.at(-1),{command:'libraryUpdateDecision',requestId:id,action:'Later'});
});
test('Host progress reflects actual pull and verification milestones before completion',()=>{
 const from=host.indexOf("case 'catalogPull':{"),to=host.indexOf("case 'openingSelect':{",from);
 assert.ok(from>=0&&to>from);
 const segment=host.slice(from,to);
 for(const key of ['catalogPullProgress','libraryUpdateProgress','sdlcCatalog.remoteVersion',
  'sdlcCatalog.syncGitWorkspace','refreshDashboard',
  "progress('completed',100","progress('failed',completedStage"])
  assert.ok(segment.includes(key),key);
 const sourceCheckout=segment.indexOf('sdlcCatalog.syncGitWorkspace');
 const sourceCompletion=segment.indexOf("progress('completed',100",sourceCheckout);
 assert.ok(sourceCheckout>=0&&sourceCompletion>sourceCheckout,'source checkout completes before its own success; an already-newer no-op may complete earlier');
 assert.doesNotMatch(segment,/importZip|inspectZip|downloadVerified\(release/,'ZIP-based Library activation is removed');
 assert.ok(segment.lastIndexOf('refreshDashboard()')<segment.lastIndexOf("progress('completed',100"),'workspace refresh precedes final completion');
 assert.match(host,/case 'libraryUpdateRetry':/);
 assert.match(host,/activeLibraryUpdatePullRequestId===msg.requestId/);
 assert.match(ui,/m.type==='catalogPullProgress'/);
});
