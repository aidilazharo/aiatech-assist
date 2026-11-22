'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const breadcrumbs=require('../media/workspace-breadcrumbs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const labels=(state)=>breadcrumbs.trail(state).map(x=>x.label);
test('every workspace main page has a breadcrumb route and a nonempty final label',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const actual=[...html.matchAll(/<main id="([^"]+)"/g)].map(x=>x[1]);
 const expected=['gateView','landingView','settingsView','projectView','myWorkView','workView','uxPreviewView',
  'libraryView','documentsView','documentEditorView','planningView','flowView','operationsView','knowledgeView'];
 assert.deepEqual(actual,expected);
 for(const id of expected){
  const route=id==='landingView'?'landing':id==='workView'?'work':id.slice(0,-4);
  const trail=breadcrumbs.trail({view:route,roleId:'project-manager'});
  assert.ok(trail.length>=1,id);assert.ok(trail.every(x=>typeof x.label==='string'&&x.label.trim()),id);
  assert.equal(trail.at(-1).action,null,'current page cannot lead to a different page: '+id);
 }
});
test('My Work > Role Workspace > Business Requirement > selected BR changes for BR-01 and BR-02',()=>{
 assert.deepEqual(labels({view:'myWork'}),['My Work']);
 assert.deepEqual(labels({view:'discovery',stage:'start',rootOnly:true}),['My Work','Role Workspace']);
 assert.deepEqual(labels({view:'discovery',stage:'start',requirementOpen:true}),['My Work','Role Workspace','Business Requirement']);
 assert.deepEqual(labels({view:'discovery',stage:'generate'}),['My Work','Role Workspace','Business Requirement']);
 for(const id of ['BR-01','BR-02','BR-001','BR-012']){
  assert.deepEqual(labels({view:'discovery',stage:'start',brId:id}),['My Work','Role Workspace','Business Requirement',id]);
 }
 assert.deepEqual(labels({view:'discovery',stage:'generate',rootOnly:true}),['My Work','Role Workspace']);
 assert.equal(breadcrumbs.trail({view:'discovery',stage:'generate',brId:'BR-02'})[1].action,'role-workspace');
 assert.equal(breadcrumbs.trail({view:'discovery',stage:'generate',brId:'BR-02'})[2].action,'br-home');
 assert.equal(breadcrumbs.trail({view:'discovery',stage:'generate',brId:'BR-02'}).at(-1).action,null);
});
test('local and Jira-only requirement detail paths are normalized without guessing identities',()=>{
 assert.equal(breadcrumbs.requirementId('history:BR-003'), 'BR-003');
 assert.equal(breadcrumbs.requirementId('TC-712'),'TC-712');
 assert.equal(breadcrumbs.requirementId('no suitable key'),'');
 assert.equal(breadcrumbs.requirementId('../br-02'), 'BR-02');
 assert.deepEqual(labels({view:'discovery',stage:'start',brId:'TC-715',requirementOpen:true}),
  ['My Work','Role Workspace','Business Requirement','TC-715']);
});
test('document, project and design preview paths show meaningful parents and support long labels',()=>{
 assert.deepEqual(labels({view:'documentEditor',documentTitle:'Architecture Design v2.1'}),
  ['Documents','Architecture Design v2.1']);
 assert.deepEqual(labels({view:'project'}),['Settings','Project Settings']);
 assert.deepEqual(labels({view:'flow'}),['SDLC','Readiness']);
 assert.deepEqual(labels({view:'uxPreview',brId:'TC-715'}),
  ['My Work','Role Workspace','UI/UX Designer','TC-715','Design Preview']);
 assert.deepEqual(labels({view:'library'}),['Library Studio']);
 assert.equal(labels({view:'documentEditor',documentTitle:'X'.repeat(500)})[1].length,160);
});
test('right pane removes breadcrumbs without damaging page headings or active workflow',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),css=read('media/start.css');
 assert.match(html,/const workspaceBreadcrumbsJs=webview\.asWebviewUri/);
 assert.match(ui,/function renderWorkspaceBreadcrumbs\(\)/);
 const body=ui.slice(ui.indexOf('function renderWorkspaceBreadcrumbs(){'),ui.indexOf('\nfunction setView(next){'));
 assert.match(body,/document\.querySelectorAll\('#contentPane > main, #brEditModal/);
 assert.match(body,/node=>node\.remove\(\)/);
 assert.match(body,/root\.classList\.remove\('has-workspace-breadcrumb'\)/);
 assert.doesNotMatch(body,/createElement\('nav'\)|createElement\('button'\)/);
 assert.match(css,/#contentPane \.atgv-workspace-breadcrumbs/);
 assert.match(html,/id="workTitle"/);
 assert.match(html,/id="operationsView"/);
});
test('legacy route model remains available for internal workflow navigation without rendering breadcrumbs',()=>{
 const ui=read('media/start.js');
  assert.match(ui,/view=next;\s*if\(typeof syncSdlcWorkspaceShell==='function'\)syncSdlcWorkspaceShell\(next\);\s*if\(typeof renderWorkspaceBreadcrumbs==='function'\)renderWorkspaceBreadcrumbs\(\)/);
 assert.match(ui,/baBreadcrumbAtRequirements=action==='br-home'/);
 assert.match(ui,/if\(brEditing&&!closeBREditor\(\)\)return/);
 assert.match(ui,/baBreadcrumbAtRequirements=true;/);
 assert.match(ui,/documentTitle:view==='documentEditor'/);
});
