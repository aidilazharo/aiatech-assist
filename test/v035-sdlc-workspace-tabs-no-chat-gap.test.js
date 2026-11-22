'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const ui=read('media/start.js');
const css=read('media/atgv-mywork-ai.css');

function widget(id){
 const attrs={},classes=new Set(['hidden']);
 return {id,dataset:{},tabIndex:-1,attrs,classes,
  classList:{toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name);}},
  setAttribute(name,value){attrs[name]=value;},
  querySelectorAll(){return [];}
 };
}
test('sidebar has one SDLC Workspace and no Role Workspace or individual SDLC category items',()=>{
 const left=html.slice(html.indexOf('<aside class="sidebar"'),html.indexOf('</aside>',html.indexOf('<aside class="sidebar"')));
 const items=[...left.matchAll(/data-nav="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(items,['overview','sdlc-roles','flow','library','settings']);
 assert.match(left,/data-nav="flow"[^>]*>[\s\S]*?SDLC Workspace<\/button>/);
 assert.doesNotMatch(left,/data-nav="role-workspace"/);
 for(const gone of ['documents','planning','knowledge','operations'])assert.ok(!items.includes(gone));
 assert.match(left,/data-nav="library" id="navLibraryStudio" hidden/);
});
test('SDLC Workspace four tabs and readiness button route to existing pages',()=>{
 const shell=html.slice(html.indexOf('<section id="sdlcWorkspaceShell"'),html.indexOf('</section>',html.indexOf('<section id="sdlcWorkspaceShell"'))+10);
 assert.match(shell,/id="sdlcWorkspaceOverview"/);
 assert.match(shell,/role="tablist" aria-label="SDLC Workspace sections"/);
 const tabs=[...shell.matchAll(/data-sdlc-tab="([^"]+)"[^>]+aria-controls="([^"]+)"[^>]+aria-selected="false"/g)];
 assert.deepEqual(tabs.map(x=>x[1]),['documents','planning','knowledge','operations']);
 assert.deepEqual(tabs.map(x=>x[2]),['documentsView','planningView','knowledgeView','operationsView']);
 assert.match(ui,/\$\('sdlcWorkspaceOverview'\)\.addEventListener\('click',\(\)=>navigate\('flow'\)\)/);
 assert.match(ui,/tab\.addEventListener\('click',\(\)=>navigate\(tab\.dataset\.sdlcTab\)\)/);
 assert.match(ui,/ArrowRight/);
 assert.match(ui,/ArrowLeft/);
 assert.match(ui,/Home/);
 assert.match(ui,/End/);
 assert.match(ui,/SDLC_WORKSPACE_VIEWS\.has\(destination\)\?'flow'/);
});
test('tab shell visibility, pressed state and roving tab focus update without replacing views',()=>{
 const fragment=ui.slice(ui.indexOf('const SDLC_WORKSPACE_VIEWS=new Set('),ui.indexOf('function navigate(destination){'));
 assert.ok(fragment.startsWith('const SDLC_WORKSPACE_VIEWS=new Set('));
 const shell=widget('sdlcWorkspaceShell'),overview=widget('sdlcWorkspaceOverview');
 const tabs=['documents','planning','knowledge','operations'].map(id=>{
  const tab=widget('tab-'+id);tab.dataset.sdlcTab=id;return tab;
 });
 shell.querySelectorAll=()=>tabs;
 const $=id=>id==='sdlcWorkspaceShell'?shell:id==='sdlcWorkspaceOverview'?overview:null;
 const sync=new Function('$',fragment+'return syncSdlcWorkspaceShell;')($);
 sync('myWork');
 assert.ok(shell.classes.has('hidden'));assert.equal(shell.attrs['aria-hidden'],'true');
 sync('flow');
 assert.ok(!shell.classes.has('hidden'));assert.equal(overview.attrs['aria-pressed'],'true');
 assert.deepEqual(tabs.map(tab=>tab.attrs['aria-selected']),['false','false','false','false']);
 assert.deepEqual(tabs.map(tab=>tab.tabIndex),[0,-1,-1,-1]);
 for(const selected of ['documents','planning','knowledge','operations']){
  sync(selected);
  assert.equal(overview.attrs['aria-pressed'],'false');
  assert.deepEqual(tabs.filter(tab=>tab.attrs['aria-selected']==='true').map(tab=>tab.dataset.sdlcTab),[selected]);
  assert.deepEqual(tabs.filter(tab=>tab.tabIndex===0).map(tab=>tab.dataset.sdlcTab),[selected]);
 }
 sync('documentEditor');
 assert.ok(shell.classes.has('hidden'),'document editor keeps its existing independent workflow');
});
test('Role Workspace can still be reached from AI task action without a sidebar item',()=>{
 const snippet=ui.slice(ui.indexOf("window.addEventListener('atgv:mywork-open-task'"),ui.indexOf("window.addEventListener('atgv:mywork-switch-role'"));
 assert.match(snippet,/detail\.projectId!==activeId\|\|detail\.roleId!==selectedRole/);
 assert.match(snippet,/if\(!\['role-workspace','discovery','project-settings'\]\.includes\(target\)\)return/);
 assert.match(snippet,/navigate\(target\)/);
 assert.match(ui,/const openWorkspace=destination==='role-workspace'\|\|keepingWorkspace/);
});
test('chat has sidebar-matched clearance inside the scroll viewport and waveform stays clipped in header',()=>{
 const root=css.match(/#myWorkView > #atgvMyWorkAi,[\s\S]*?#myWorkView > #atgvMyWorkAi\.atgv-mywork-ai\{([^}]+)\}/)?.[1]||'';
 assert.match(root,/padding:0;margin:0;background:#000!important/);
 assert.doesNotMatch(css,/padding:(42px|34px|24px) 0 0/);
 const wave=css.match(/#appHeader #myWorkHeaderWave \.mywork-header-wave-visual\{([^}]+)\}/)?.[1]||'';
 assert.match(wave,/clip-path:inset\(0 0 50% 0\)/);
 assert.match(css,/#topNotification #myWorkHeaderWave \.mywork-header-wave-visual\{[^}]+clip-path:inset\(0 0 50% 0\)/);
 const results=css.match(/#atgvMyWorkAi \.atgv-mywork-ai-results\{([^}]+)\}/)?.[1]||'';
 assert.match(results,/overflow-y:auto/);
 assert.match(results,/padding:23px clamp\(12px,2vw,24px\) 26px/);
 assert.match(results,/scroll-padding-top:0/);
});
