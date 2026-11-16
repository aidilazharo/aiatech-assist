'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const script=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const a=source.indexOf('function html(webview,{resumeLibrary=false}={}){'),b=source.indexOf('\nasync function dashboardState()',a);
const func=new Function('vscode','context',source.slice(a,b)+'\nreturn html')({Uri:{joinPath:(_,...parts)=>parts.join('/')}},{extensionUri:{}});
const html=func({asWebviewUri:u=>u,cspSource:'vscode-resource:'});
test('fixed header, scrollable navigation and independently scrollable content are included',()=>{
  for(const id of ['contentPane','navSettings','sidebarSwitchProject','headerModel','landingView','workView','documentsView','knowledgeView','settingsView','projectView'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(html,/id="(?:headerVersion|gateVersion|version)"/);
  assert.match(css,/\.sidebar-scroll\{[^}]*overflow-y:auto/);
  assert.match(css,/\.content-pane\{[^}]*overflow-y:auto/);
  assert.match(css,/\.app-header\{[^}]*height:64px/);
  assert.match(css,/\.sidebar-footer\{[^}]*flex-shrink:0/);
});
test('roles are consolidated to one left navigation item and moved into the content pane',()=>{
  assert.match(html,/data-nav="sdlc-roles"/);
  assert.match(html,/id="sidebarRole"[^>]*aria-label="Active SDLC role"/);
  assert.match(html,/id="roleChecklist"[^>]*role="tabpanel"/);
  for(const id of ['business-analyst','project-manager','solution-architect','software-developer','qa-engineer','release-manager']){
    assert.ok(!html.includes('data-nav="'+id+'"'),id+' should not appear in left navigation');
  }
  const left=html.match(/<aside class="sidebar"[\s\S]*?<\/aside>/)?.[0]||'';
  assert.equal((left.match(/data-nav=/g)||[]).length,9,'Eight work areas and one unified Settings entry');
  assert.doesNotMatch(left,/data-nav="(projects|discovery|tech)"/);
  assert.doesNotMatch(html,/id="roleSwitcher"|id="activate"|id="scaffold"/);
  assert.doesNotMatch(html,/id="workDiscovery"/);
  assert.match(script,/textContent='Open Business Requirement'/);
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  for(const found of script.matchAll(/\$\('([^']+)'\)/g)){const removed=new Set(['devSecondaryWorkspace','developerWorkbench','workGithub','devAssignedJiraStatus','devAssignedJiraList','devJiraKey','devRepoStatus','devTarget','devJiraInfo','devTransitionSelect','opsBranch','devExecutionStatus','processActivityRows','roleProcessRows']);assert.ok(ids.has(found[1])||removed.has(found[1]),'Missing webview element '+found[1]);}
  assert.deepEqual(require('../package.json').contributes.commands.map(c=>c.title),['ATGV: Start','ATGV: Refresh Shared Project Artifacts','ATGV: Restart','ATGV: Reset']);
});

test('ATGV Start is a search gate; full SDLC shell is only visible after verified open',()=>{
  for(const id of ['gateView','gateFinder','gateQuery','gateSearch','gateLocal','gateRemote','gateOpeningError','gateRecovery'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/<body class="gate-mode">/);
  assert.doesNotMatch(html,/id="gateSettings"/);
  assert.match(css,/body\.gate-mode \.app-header,body\.gate-mode \.sidebar\{display:none\}/);
  assert.doesNotMatch(html,/id="(?:gateSelection|gatePrimary|gateChange)"/);
  assert.match(script,/function launchFromGate\(/);
  assert.match(script,/send\('openingAuto',selection\)/);
  assert.match(html,/id="gateRecent"/);
  assert.match(html,/id="gateOffline"/);
  assert.match(html,/class="gate-identity gate-lead-identity"/);
  assert.doesNotMatch(html,/1\. Select project|2\. Test connections|3\. Initialize|4\. Open/);
  assert.match(source,/case 'openingAuto'/);
  assert.match(source,/case 'openingOffline'/);
  assert.match(source,/async function launchProject\(/);
  assert.match(source,/async function launchLocalOffline\(/);
  assert.match(script,/navigate\('sdlc-roles'\)/);
  assert.match(css,/\.gate-progress\{/);
});

test('Start and Settings only search Confluence when users explicitly request it',()=>{
  assert.match(html,/id="gateSearch"/);
  assert.match(html,/id="settingsSpaceQuery"/);
  assert.match(html,/id="settingsSpaceSearch"/);
  assert.doesNotMatch(html,/id="reloadSpaces"/);
  assert.doesNotMatch(source,/await discoverSpaces\(''\)/);
  assert.match(script,/send\('discover',\{query:q,origin:'gate',requestId\}\)/);
  assert.match(script,/send\('discover',\{query,origin:'settings',requestId\}\)/);
  assert.match(source,/if\(term\.length<2\|\|term\.length>120\)/);
});

test('0.00.19 limits space results and discards stale query responses',()=>{
  assert.match(script,/spaces=\(m\.spaces\|\|\[\]\)\.slice\(0,10\)/);
  assert.match(script,/m\.requestId!==gateSearchId/);
  assert.match(script,/m\.requestId!==settingsSearchId/);
  assert.match(html,/id="gateSearchMessage"/);
  assert.match(source,/discoverConfluenceSpaces\(conf,token,term,10,\{onDiagnostic:/);
});

test('0.00.18 places Jira, GitHub, Confluence and role functions at one contextual destination',()=>{
  const view=(id,next)=>html.split(`<main id="${id}"`)[1]?.split(`<main id="${next}"`)[0]||'';
  assert.doesNotMatch(view('workView','documentsView'),/id="workDiscovery"/);
  assert.match(script,/className='discovery-entry-card'/);
  assert.doesNotMatch(view('workView','documentsView'),/id="opsBranchCreate"/);
  assert.match(view('documentsView','documentEditorView'),/id="opsConfluenceSync"/);
  assert.match(html,/id="discoveryView"[\s\S]*?id="opsJiraCreate"/);
  assert.match(view('operationsView','knowledgeView'),/id="opsClaim"/);
  for(const id of ['opsConfluenceSync','opsJiraCreate','sidebarRole','settingsSpaceSearch'])
    assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`${id} must have one destination`);
  assert.match(html,/id="sidebarSwitchProject"/);
  assert.doesNotMatch(html,/id="headerSwitchProject"/);
  assert.doesNotMatch(html,/id="roleCards"|id="roleSwitcher"|id="activate"|id="scaffold"|id="reloadSpaces"/);
});
