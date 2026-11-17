'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
const script=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');

function createUiHarness(){
 const nodes=new Map(),calls=[];
 const element=id=>{
  if(!nodes.has(id)){
   const classes=new Set(['hidden']);
   nodes.set(id,{id,disabled:false,innerText:'',textContent:'',dataset:{},style:{},attributes:{},
    listeners:{},
    classList:{remove:n=>classes.delete(n),add:n=>classes.add(n),contains:n=>classes.has(n)},
    addEventListener:(name,fn)=>{nodes.get(id).listeners[name]=fn;},
    setAttribute:(name,v)=>{nodes.get(id).attributes[name]=String(v);}
   });
  }
  return nodes.get(id);
 };
 const first=script.indexOf('let latestSoftwareUpdateState=null,softwareLibraryPulling=false;');
 const second=script.indexOf('function renderSoftwareUpdates(',first);
 const clickStart=script.indexOf("$('pullLibraryFiles').addEventListener('click',()=>{",second);
 const clickEnd=script.indexOf("$('viewExtensionRelease').addEventListener(",clickStart);
 assert.ok(first>=0&&second>first&&clickStart>second&&clickEnd>clickStart);
 const js=script.slice(first,second)+script.slice(clickStart,clickEnd)+
  "return {status:()=>softwareLibraryPulling,sendMessages:calls,element,render:renderSoftwareLibraryPullProgress};";
 const run=new Function('$','send','catalogBusyUI','catalogState','calls','element',js);
 return run(element,(name)=>calls.push(name),false,{busy:false},calls,element);
}
test('Extension & SDLC Library Updates includes an accessible Pull Library Files button and inline status',()=>{
 const section=html.slice(html.indexOf('id="settingsSoftwareUpdateGroup"'),html.indexOf('</section></div></details>',html.indexOf('id="settingsSoftwareUpdateGroup"')));
 assert.ok(section.includes('id="checkSoftwareUpdates"'));
 assert.ok(section.includes('id="pullLibraryFiles"'));
 assert.ok(section.indexOf('id="checkSoftwareUpdates"')<section.indexOf('id="pullLibraryFiles"'));
 for(const id of ['softwareLibraryPullProgress','softwareLibraryPullTitle','softwareLibraryPullPercent',
   'softwareLibraryPullBar','softwareLibraryPullIndicator','softwareLibraryPullMessage'])
  assert.ok(section.includes('id="'+id+'"'),id);
 assert.match(section,/id="softwareLibraryPullBar"[^>]*role="progressbar"/);
});
test('Pull Library Files starts exactly one verified catalogPull request and disables repeat clicks',()=>{
 const view=createUiHarness(),button=view.element('pullLibraryFiles');
 button.listeners.click();
 button.listeners.click();
 assert.deepEqual(view.sendMessages,['catalogPull']);
 assert.equal(view.status(),true);
 assert.equal(button.disabled,true);
 assert.equal(view.element('softwareLibraryPullProgress').classList.contains('hidden'),false);
 assert.equal(view.element('softwareLibraryPullBar').attributes['aria-valuenow'],'0');
});
test('Settings progress receives verified milestones, reports failures and permits retry',()=>{
 const view=createUiHarness();
 view.element('pullLibraryFiles').listeners.click();
 view.render({stage:'running',percent:60,title:'Preserving local catalog changes',message:'Backup folder created.'});
 assert.equal(view.element('softwareLibraryPullBar').attributes['aria-valuenow'],'60');
 assert.equal(view.element('softwareLibraryPullIndicator').style.width,'60%');
 assert.equal(view.element('softwareLibraryPullMessage').textContent,'Backup folder created.');
 view.render({stage:'failed',percent:60,title:'Pull failed',message:'Original restored.'});
 assert.equal(view.status(),false);
 assert.equal(view.element('pullLibraryFiles').disabled,false);
 assert.equal(view.element('pullLibraryFiles').textContent,'Retry Pull Library Files');
 view.element('pullLibraryFiles').listeners.click();
 assert.deepEqual(view.sendMessages,['catalogPull','catalogPull']);
 view.render({stage:'completed',percent:100,title:'Library installed',message:'Original catalog preserved in a backup.'});
 assert.equal(view.status(),false);
 assert.equal(view.element('softwareLibraryPullBar').attributes['aria-valuenow'],'100');
 assert.equal(view.element('pullLibraryFiles').textContent,'Pull Library Files');
 assert.equal(view.element('pullLibraryFiles').disabled,false);
});
test('Settings and Catalog controls share real host catalog progress events',()=>{
 assert.match(script,/if\(m\.type==='catalogPullProgress'\)\{\s*renderSoftwareLibraryPullProgress\(m\)/);
 assert.match(script,/m\.action==='pull'/);
 const start=host.indexOf("case 'catalogPull':{"),end=host.indexOf("case 'openingSelect':{",start);
 assert.ok(start>0&&end>start);
 const command=host.slice(start,end);
 assert.match(command,/type:'catalogPullProgress'/);
 assert.match(command,/syncGitWorkspace/);
 assert.match(command,/expectedSha:pinned\.sha/);
 assert.match(command,/progress\('completed',100/);
});
