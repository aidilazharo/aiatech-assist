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
 const expected=['gateView','landingView','settingsView','projectView','workView','uxPreviewView',
  'libraryView','documentsView','documentEditorView','planningView','flowView','operationsView','knowledgeView'];
 assert.deepEqual(actual,expected);
 for(const id of expected){
  const route=id==='landingView'?'landing':id==='workView'?'work':id.slice(0,-4);
  const trail=breadcrumbs.trail({view:route,roleId:'project-manager'});
  assert.ok(trail.length>=1,id);assert.ok(trail.every(x=>typeof x.label==='string'&&x.label.trim()),id);
  assert.equal(trail.at(-1).action,null,'current page cannot lead to a different page: '+id);
 }
});
test('My Work > Business Requirement > selected BR changes for BR-01 and BR-02',()=>{
 assert.deepEqual(labels({view:'discovery',stage:'start',rootOnly:true}),['My Work']);
 assert.deepEqual(labels({view:'discovery',stage:'start',requirementOpen:true}),['My Work','Business Requirement']);
 assert.deepEqual(labels({view:'discovery',stage:'generate'}),['My Work','Business Requirement']);
 for(const id of ['BR-01','BR-02','BR-001','BR-012']){
  assert.deepEqual(labels({view:'discovery',stage:'start',brId:id}),['My Work','Business Requirement',id]);
 }
 assert.deepEqual(labels({view:'discovery',stage:'generate',rootOnly:true}),['My Work']);
 assert.equal(breadcrumbs.trail({view:'discovery',stage:'generate',brId:'BR-02'})[1].action,'br-home');
 assert.equal(breadcrumbs.trail({view:'discovery',stage:'generate',brId:'BR-02'}).at(-1).action,null);
});
test('local and Jira-only requirement detail paths are normalized without guessing identities',()=>{
 assert.equal(breadcrumbs.requirementId('history:BR-003'), 'BR-003');
 assert.equal(breadcrumbs.requirementId('TC-712'),'TC-712');
 assert.equal(breadcrumbs.requirementId('no suitable key'),'');
 assert.equal(breadcrumbs.requirementId('../br-02'), 'BR-02');
 assert.deepEqual(labels({view:'discovery',stage:'start',brId:'TC-715',requirementOpen:true}),
  ['My Work','Business Requirement','TC-715']);
});
test('document, project and design preview paths show meaningful parents and support long labels',()=>{
 assert.deepEqual(labels({view:'documentEditor',documentTitle:'Architecture Design v2.1'}),
  ['Documents','Architecture Design v2.1']);
 assert.deepEqual(labels({view:'project'}),['Settings','Project Settings']);
 assert.deepEqual(labels({view:'flow'}),['SDLC','Readiness']);
 assert.deepEqual(labels({view:'uxPreview',brId:'TC-715'}),
  ['My Work','UI/UX Designer','TC-715','Design Preview']);
 assert.deepEqual(labels({view:'library'}),['Library Studio']);
 assert.equal(labels({view:'documentEditor',documentTitle:'X'.repeat(500)})[1].length,160);
});
test('webview loads the route model before start.js and renders safe accessible buttons',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),css=read('media/start.css');
 assert.match(html,/const workspaceBreadcrumbsJs=webview\.asWebviewUri/);
 assert.ok(html.indexOf('<script src="${workspaceBreadcrumbsJs}"></script>')<
  html.indexOf('<script src="${js}"></script>'));
 assert.match(ui,/function renderWorkspaceBreadcrumbs\(\)/);
 assert.match(ui,/document\.createElement\('nav'\)/);
 assert.match(ui,/nav\.setAttribute\('aria-label','Breadcrumb'\)/);
 assert.match(ui,/item\.setAttribute\('aria-current','page'\)/);
 assert.match(ui,/item\.textContent=segment\.label/);
 assert.match(ui,/item\.addEventListener\('click',\(\)=>workspaceBreadcrumbAction\(segment\.action\)\)/);
 assert.match(css,/\.atgv-workspace-breadcrumbs \.atgv-breadcrumb-link:focus-visible/);
 assert.match(css,/main\.has-workspace-breadcrumb > \.page-kicker\{display:none!important\}/);
});
test('breadcrumbs follow real navigation, BR editor, completed BR modal and documents',()=>{
 const ui=read('media/start.js');
 assert.match(ui,/view=next;\s*if\(typeof renderWorkspaceBreadcrumbs==='function'\)renderWorkspaceBreadcrumbs\(\)/);
 assert.match(ui,/baBreadcrumbAtRequirements=action==='br-home'/);
 assert.match(ui,/if\(brEditing&&!closeBREditor\(\)\)return/);
 assert.match(ui,/baBreadcrumbAtRequirements=true;/);
 assert.match(ui,/const dialogs=\[\['brEditModal'/);
 assert.match(ui,/const overlay=\$\(modalId\),card=overlay\?\.querySelector\(selector\)/);
 assert.match(ui,/documentTitle:view==='documentEditor'/);
 assert.match(ui,/if\(typeof renderWorkspaceBreadcrumbs==='function'\)renderWorkspaceBreadcrumbs\(\);\s*\$\('baRequirementModalClose'\)\.focus/);
 assert.match(ui,/\$\('brEditModal'\)\.classList\.add\('hidden'\);[^\n]*renderWorkspaceBreadcrumbs\(\)/);
 assert.match(ui,/\$\('docEditorTitle'\)\.textContent=doc.title;\$\('docEditorPath'\)\.textContent=doc.path;\s*if\(typeof renderWorkspaceBreadcrumbs==='function'\)renderWorkspaceBreadcrumbs\(\)/);
});
