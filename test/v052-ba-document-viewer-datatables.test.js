'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const viewer=require('../media/ba-document-viewer');
const html=read('src/lib/webview/dashboard-html.js');
const ba=read('media/ba-automatic-ui.js');
const ui=read('media/start.js');
const css=read('media/start.css');

function fakeDOM(){
 class Element{
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this._text='';this.className='';this.classList={add:x=>{this.className+=(this.className?' ':'')+x}};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 }
 const document={createElement(tag){return new Element(tag,this)},createTextNode(value){const el=new Element('#text',this);el.textContent=value;return el}};
 return {document,container:document.createElement('div')};
}
function descendants(node,tag){return [...(node.children||[])].flatMap(child=>[...(child.tagName===tag.toUpperCase()?[child]:[]),...descendants(child,tag)]);}

test('ISO BRD markdown is formatted into safe semantic HTML without using innerHTML',()=>{
 const {container}=fakeDOM();
 const source='# GATE project requirements\n\n## Business purpose\nA **verified** user-facing description.\n\n### FR-001 Project initiation\nCreate a project and retain the audit trail.\n\n- Assign a project manager\n- Send project notification\n\n| Field | Type |\n| --- | --- |\n| Project code | Text |\n\nUnsafe <script>alert(1)</script> and [click](javascript:alert(1))';
 const report=viewer.render(container,source);
 assert.ok(report.sections>=3);
 assert.equal(descendants(container,'h1').length,1);
 assert.equal(descendants(container,'h2').length,1);
 assert.equal(descendants(container,'strong').length,1);
 assert.equal(descendants(container,'details').length,1);
 assert.equal(descendants(container,'table').length,1);
 assert.equal(descendants(container,'tr').length,2);
 assert.equal(descendants(container,'script').length,0);
 assert.equal(descendants(container,'a').length,0,'untrusted javascript: link must remain text');
 assert.match(container.textContent,/Project code/);
 assert.match(container.textContent,/<script>/,'malicious markup is displayed as literal text');
});
test('renderer renders blank state and preserves code text safely',()=>{
 const {container}=fakeDOM();
 assert.equal(viewer.render(container,'' ).blocks,0);
 assert.match(container.textContent,/No structured Business Requirements/);
 viewer.render(container,'# Document\n\n```js\nconsole.log("<not-html>");\n```');
 assert.equal(descendants(container,'pre').length,1);
 assert.match(container.textContent,/<not-html>/);
});
test('only one document panel is visible per selected tab',()=>{
 for(const id of ['baAutoDocumentTabs','baAutoFormattedDocument','baAutoPrimaryAction','baAutoOverflowMenu','baAutoArtifactText'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ba,/viewer\.hidden=kind!=='iso'/);
 assert.match(ba,/input\.hidden=kind==='iso'\|\|preflight/);
 assert.match(ba,/get\('baAutoIsoPreflight'\)\.hidden=!preflight/);
 assert.match(ba,/get\('baAutoDocumentPanel'\)\.hidden=preflight/);
 assert.match(ba,/input\.readOnly=kind!=='source'/);
 assert.match(ba,/get\('baAutoArtifactSave'\)\.hidden=kind!=='source'/);
 assert.match(ba,/if\(artifactDirty\(\)\)\{get\('baAutoArtifactStatus'\)/);
 assert.match(ba,/renderFormattedDocument\(m\.text\)/);
 assert.ok(html.indexOf('src="${baDocumentViewerJs}"')<html.indexOf('src="${baAutomaticUi}"'));
});
test('contextual action delegates to unchanged upload/download/save handlers',()=>{
 for(const id of ['baPreflightDownload','baWorkingBrDownload','baAutoArtifactSave','baAutoFileActions'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(ba,/const target=primaryTarget\(\)/);
 assert.match(ba,/if\(!primary\.disabled&&target&&!target\.disabled\)target\.click\(\)/);
 assert.match(ba,/get\('baAutoOverflowActions'\)\.dataset\.kind=kind/);
 assert.match(ba,/Save your source edits before replacing or deleting the document/);
 assert.match(ui,/send\('downloadISO29148BRPDF',\{projectId:activeId\}\)/);
 assert.match(ui,/send\('downloadDocumentPreflight',\{projectId:activeId\}\)/);
 assert.match(ui,/send\('replaceDiscoverySource'/);
 assert.match(ui,/requestBRDeletion\(\{target:'active-source',digest:doc\.digest,revision:brState\.revision\}\)/);
});
test('Jira DataTable distributes widths across all 8 columns and contains horizontal overflow',()=>{
 const section=css.slice(css.indexOf('/* v0.0.52 — 8-column Jira project DataTable'));
 assert.ok(section.length>400,'Expected v0.0.52 DataTable fix');
 const widths=[];
 for(let i=1;i<=8;i++){
  const re=new RegExp('th:nth-child\\('+i+'\\)\\{width:(\\d+)%\\}');
  const match=section.match(re);
  assert.ok(match,'Missing column '+i);
  widths.push(Number(match[1]));
 }
 assert.equal(widths.reduce((a,b)=>a+b,0),100);
 assert.match(section,/min-width:1350px;table-layout:fixed/);
 assert.match(section,/overflow-x:auto;overflow-y:hidden/);
 assert.match(section,/td\{[\s\S]*?white-space:normal/);
 assert.match(ui,/const epicOwners=new Map\(jiraInventoryItems/);
 assert.match(ui,/item\.brOwner=rootKey\?epicOwners\.get\(rootKey\)/);
 assert.match(ui,/\{key:'brOwner',label:'BR owner'/);
 assert.match(ui,/\{key:'creator',label:'Created by'/);
 assert.match(ui,/baJiraTableInstance\.setRows\(rows\)/);
 assert.match(ui,/ATGVDataTables\.mount\(root,rows/);
});
