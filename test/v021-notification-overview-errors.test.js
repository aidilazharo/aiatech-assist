'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ui=read('media/start.js'),css=read('media/atgv-mywork-ai.css'),html=read('src/lib/webview/dashboard-html.js');

test('notification keeps the existing live My Work canvas above its own red border',()=>{
 const first=ui.indexOf('function syncMyWorkHeaderWaveHost(){');
 const last=ui.indexOf('function showTopNotification(item){',first);
 assert.ok(first>=0&&last>first);
 const nodes={};
 const host=name=>({name,appendChild(node){node.parentElement=this;}});
 const header=host('header'),notice=host('notice'),wave={parentElement:header};
 Object.assign(nodes,{myWorkHeaderWave:wave,appHeader:header,topNotification:notice});
 const fakeWindow={addEventListener(event,handler){assert.equal(event,'atgv:viewchange');assert.equal(typeof handler,'function');}};
 const make=new Function('$','document','window','topNoticeCurrent',ui.slice(first,last)+'return syncMyWorkHeaderWaveHost;');
 const active={body:{classList:{contains:x=>x==='atgv-mywork-chat-mode'}}};
 make(id=>nodes[id],active,fakeWindow,{message:'warning'})();
 assert.equal(wave.parentElement,notice,'wave must be hosted by visible notification');
 make(id=>nodes[id],active,fakeWindow,null)();
 assert.equal(wave.parentElement,header,'wave must return to original header on dismissal');
 assert.match(ui,/topNoticeCurrent=item;\s*syncMyWorkHeaderWaveHost\(\);/);
 assert.match(ui,/\$\('appHeader'\)\.classList\.remove\('hidden'\);\s*syncMyWorkHeaderWaveHost\(\);/);
 assert.match(css,/#topNotification #myWorkHeaderWave\.mywork-header-wave\{/);
 assert.match(css,/#topNotification #myWorkHeaderWave canvas#atgvMyWorkAiOrb\{/);
 assert.match(css,/body\.atgv-mywork-chat-mode:not\(\.gate-mode\) #topNotification\.top-notification\{/);
 assert.match(css,/#topNotification #myWorkHeaderWave \.mywork-header-wave-visual\{height:42px;bottom:-20px\}/);
});

test('Overview has no duplicate heading or breadcrumb in content pane',()=>{
 const pane=html.slice(html.indexOf('<main id="landingView"'),html.indexOf('<main id="settingsView"'));
 assert.ok(pane.includes('id="overviewHealthDetail"'));
 assert.doesNotMatch(pane,/<h1>Overview<\/h1>|<div class="page-kicker">PROJECT OVERVIEW<\/div>/);
 const cleanup=ui.slice(ui.indexOf('function renderWorkspaceBreadcrumbs(){'),ui.indexOf('function setView(next){'));
 assert.ok(cleanup.includes("root.classList.remove('has-workspace-breadcrumb')"));
 assert.ok(cleanup.includes('node=>node.remove()'));
});

test('all right pane error notices are suppressed without hiding global notifications',()=>{
 const first=ui.indexOf('function atgvInlineNotice(message,error=false){');
 const last=ui.indexOf('\n// Unified, truthful per-process progress display',first);
 assert.ok(first>=0&&last>first);
 const fragment=ui.slice(first,last);
 const removed={count:0};
 const pane={id:'landingView',querySelector:()=>({remove(){removed.count++;}})};
 const fakeDocument={querySelector:()=>pane};
 const fn=new Function('document','$','atgvSeverity',fragment+'\nreturn atgvInlineNotice;')(fakeDocument,()=>null,()=> 'error');
 fn('Confluence sources differ',true);
 assert.equal(removed.count,1);
 assert.match(ui,/if\(statusText\)\{notifyTop\(statusText,\{error,success:/);
 assert.match(fragment,/if\(error\|\|pane.id==='landingView'\)\{/);
});
