'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('permanent connection banner is red and never replaced by transient notifications',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const css=read('media/start.css');
 const js=read('media/start.js');
 assert.ok(html.indexOf('id="appHeader"')<html.indexOf('id="roleCredentialBanner"'));
 assert.ok(html.indexOf('id="roleCredentialBanner"')<html.indexOf('id="topNotification"'));
 assert.match(css,/body:not\(\.gate-mode\) #roleCredentialBanner\.atgv-role-credential-banner\{[^}]*border-bottom:3px solid #ff3647!important/);
 assert.match(css,/body:not\(\.gate-mode\) #topNotification\.top-notification\{[^}]*order:2/);
 assert.match(css,/body:not\(\.gate-mode\) #appHeader\.app-header\{[^}]*order:0/);
 assert.match(css,/body:not\(\.gate-mode\) #roleCredentialBanner\.atgv-role-credential-banner\{[^}]*order:1/);
 const show=js.slice(js.indexOf('function showTopNotification(item){'),js.indexOf('function closeTopNotification(){'));
 assert.doesNotMatch(show,/\$\('appHeader'\)\.classList\.add\('hidden'\)/);
 assert.match(show,/target\.classList\.remove/);
 assert.match(js,/const host=header;/);
});
test('all five BR panels remain visible, initially collapsed, with independent status',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const ui=read('media/ba-automatic-ui.js');
 const ids=['baAutoSource','baAutoDiscovery','baAutoRequirements','baAutoJira','baAutoHistory'];
 for(const id of ids){
  assert.match(html,new RegExp('<details id="'+id+'" class="ba-auto-artifact" data-status="not-started">'));
  assert.match(html,new RegExp('id="'+id+'Badge" class="ba-auto-badge" data-state="not-started">Not started'));
 }
 assert.match(ui,/function renderReadyPanels\(phase\)/);
 assert.match(ui,/panel\.hidden=false;panel\.dataset\.status=status/);
 assert.match(ui,/panel\.open=false;panel\.dataset\.initialized='true'/);
 for(const id of ids)assert.ok(ui.includes("['"+id+"',"),id+' has independent state');
 assert.ok(!ui.includes("panel.hidden=!isReady"));
});
test('source and discovery forms are reachable inside permanent panels; publication remains after history',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const ui=read('media/ba-automatic-ui.js');
 const firstPanel=html.indexOf('id="baAutoSource"');
 const lastPanel=html.indexOf('id="baAutoHistory"');
 const actions=html.indexOf('class="ba-auto-actions"');
 assert.ok(firstPanel>0&&lastPanel>firstPanel&&actions>lastPanel);
 assert.match(ui,/const uploadTarget=get\('baAutoOriginalFiles'\)/);
 assert.match(ui,/const discoveryTarget=get\('baAutoDiscoveryForm'\)/);
 assert.match(ui,/if\(target\.hidden\)\{/);
});
test('My Work has no redundant incomplete task section or Go to task button',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const chat=read('media/atgv-mywork-wave-chat.js');
 assert.doesNotMatch(html,/id="atgvMyWorkToday"|id="atgvMyWorkTodayList"/);
 assert.doesNotMatch(chat,/function renderTasks\(|button\.textContent='Go to task'/);
 assert.match(html,/id="atgvMyWorkAiConversation"/);
 assert.match(chat,/function renderBrief\(/);
});
