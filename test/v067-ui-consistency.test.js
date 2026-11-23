'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('ATGV: Start immediately shows the prerequisites instead of an empty branded shell',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const js=read('media/start.js');
 assert.match(html,/<section id="startupSetup" class="atgv-startup-setup" aria-label="ATGV computer readiness and connection setup">/);
 assert.match(html,/<div id="startupComputerCard" class="atgv-startup-card">/);
 assert.match(html,/<section id="gateFinder" class="gate-finder hidden">/);
 const start=js.indexOf('function showGate(){'),end=js.indexOf('function gateOpeningPercent(',start);
 assert.ok(start>=0&&end>start);
 const show=js.slice(start,end);
 assert.match(show,/\$\('startupSetup'\)\.classList\.remove\('hidden'\)/);
 assert.match(show,/if\(startupPage===0\)requestStartupReadiness\(\)/);
 assert.match(js,/let startupWizardCompletedThisSession=false/);
 assert.match(js,/const required=\(typeof startupWizardCompletedThisSession==='undefined'\|\|!startupWizardCompletedThisSession\)&&!openingInProgress/);
 assert.match(js,/startupWizardCompletedThisSession=true/);
});
test('project selection previous is left aligned and Skip is hidden if Jira and Confluence both passed',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const js=read('media/start.js');
 const css=read('media/atgv-consistency.css');
 const start=html.indexOf('class="atgv-startup-footer gate-search-footer"'),end=html.indexOf('</div>',start);
 const footer=html.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.ok(footer.indexOf('id="gateSearchPrevious"')<footer.indexOf('id="gateUnifiedLog"'));
 assert.ok(footer.indexOf('id="gateUnifiedLog"')<footer.indexOf('id="gateSkip"'));
 assert.match(footer,/id="gateSkip" type="button" hidden/);
 assert.match(css,/#gateFinder \.gate-search-footer #gateSearchPrevious\{order:0/);
 assert.match(js,/jira\?\.state==='ok'&&confluence\?\.state==='ok'/);
 assert.match(js,/\$\('gateSkip'\)\.hidden=!skipAllowed/);
 assert.match(js,/return startupConnectionVerified===true/);
});
test('Jira DataTable view controls sit at the top-right INSIDE the expanded section body',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const css=read('media/atgv-consistency.css');
 const start=html.indexOf('<details id="baAutoJira"'),end=html.indexOf('</details>',start);
 const panel=html.slice(start,end);
 const summaryEnd=panel.indexOf('</summary>'),body=panel.indexOf('class="ba-auto-body"'),toolbar=panel.indexOf('class="atgv-section-table-toolbar"');
 assert.ok(start>0&&summaryEnd>0&&body>summaryEnd&&toolbar>body);
 for(const id of ['baAutoJiraView','baAutoJiraTabs','baAutoJiraItems']){
  assert.ok(panel.indexOf('id="'+id+'"')>toolbar);
 }
 assert.ok(panel.indexOf('id="baAutoJiraBadge"')<summaryEnd);
 assert.ok(panel.indexOf('id="baAutoJiraView"')>summaryEnd);
 assert.match(css,/#discoveryView \.atgv-section-table-toolbar\{[^}]*justify-content:flex-end/);
});
test('all five BR panels use the same green OUTLINED Ready badge',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const css=read('media/atgv-consistency.css');
 const ui=read('media/ba-automatic-ui.js');
 for(const id of ['baAutoSourceBadge','baAutoDiscoveryBadge','baAutoRequirementsBadge','baAutoJiraBadge','baAutoHistoryBadge']){
  assert.match(html,new RegExp('id="'+id+'" class="ba-auto-badge"'));
 }
 assert.match(ui,/\['baAutoHistory',historyStatus\]/);
 for(const status of ['not-started','in-progress','ready','needs-attention','completed'])assert.ok(ui.includes(status));
 assert.match(css,/#discoveryView \.ba-auto-badge\[data-state="ready"\],\s*#discoveryView #baAutoSourceBadge\[data-state="ready"\]/);
 assert.match(css,/border:1px solid var\(--atgv-consistency-ready\)!important/);
 assert.match(css,/background:transparent!important/);
});
test('one last-loaded stylesheet provides common styles across all SDLC role screens',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const css=read('media/atgv-consistency.css');
 const style=read('media/atgv-ui-theme.css');
 assert.match(html,/const uiConsistencyCss=webview\.asWebviewUri\(/);
 const link=html.indexOf('href="${uiConsistencyCss}"');
 const theme=html.indexOf('href="${uiThemeCss}"');
 assert.ok(link>theme&&theme>0);
 for(const view of ['#workView','#discoveryView','#planningView','#landingView','#settingsView','#projectView','#myWorkView']){
  assert.ok(css.includes(view),view+' absent from unified rules');
 }
 assert.match(style,/GENERATED from design-system/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/!important.*display:none.*#startupSetup/);
});
