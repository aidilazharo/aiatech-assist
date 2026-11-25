'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const ui=read('media/ba-automatic-ui.js');
const host=read('media/start.js');
const css=read('media/atgv-consistency.css');

test('all five BA sections are permanent and start collapsed with meaningful status',()=>{
 const panels=['baAutoSource','baAutoDiscovery','baAutoRequirements','baAutoJira','baAutoHistory'];
 for(const id of panels){
  assert.match(html,new RegExp('<details id="'+id+'" class="ba-auto-artifact" data-status="not-started">'));
  assert.match(html,new RegExp('id="'+id+'Badge" class="ba-auto-badge" data-state="not-started">Not started'));
 }
 assert.match(ui,/panel\.hidden=false;panel\.dataset\.status=status/);
 assert.match(ui,/if\(!panel\.dataset\.initialized\)\{panel\.open=false/);
 for(const state of ['not-started','in-progress','ready','needs-attention','completed'])
  assert.match(ui,new RegExp(state));
 assert.match(ui,/sourcePanel\.parentElement!==uploadTarget/);
 assert.match(ui,/const discoveryTarget=get\('baAutoDiscoveryForm'\)/);
});
test('document actions and publish refresh controls are icons with accessible labels',()=>{
 for(const id of ['baPreflightDownload','baWorkingBrDownload','baAutoArtifactSave','baAutoStop','baAutoRefresh'])
  assert.match(html,new RegExp('id="'+id+'"[^>]*aria-label="[^"]+"[^>]*>\\$\\{baHeaderIcon\\('));
 assert.match(html,/id="baAutoPublish"[^>]*aria-label="Approved and Publish"[^>]*>Approved and Publish<\/button>/);
 for(const action of ['replace','remove'])assert.match(host,new RegExp(action+"\\.append\\(sourceActionIcon\\('"));
 assert.match(host,/sourceActionIcon\('upload'\)/);
 assert.match(host,/sourceActionIcon\('delete'\)/);
 assert.match(host,/requestBRDeletion\(\{target:'active-source',digest:doc\.digest/);
 assert.match(ui,/if\(!primary\.disabled&&target&&!target\.disabled\)target\.click\(\)/);
 assert.match(css,/\.ba-overflow-icon/);
});
test('Quill uses the verified vendored asset and preserves plain-text source semantics',()=>{
 assert.match(html,/const quillJs=vendor\('quill','quill\.js'\)/);
 assert.match(html,/\$\{quillJs\?\x60<script src=/);
 assert.match(html,/id="baAutoQuillEditor"/);
 assert.match(ui,/new window\.Quill\(editor,\{theme:'snow',readOnly:kind!=='source'/);
 assert.match(ui,/modules:\{toolbar:false\},formats:\[\]/);
 assert.match(ui,/artifactQuill\.setText\(artifactContext\.text,'api'\)/);
 assert.match(ui,/input\.value=quillText\(\)/);
 assert.match(ui,/const text=input\.value/);
 assert.match(ui,/artifactQuill\?\.enable\(false\)/);
 assert.match(ui,/const showQuill=syncQuill\(\)/);
 assert.match(ui,/input\.hidden=kind==='iso'\|\|preflight\|\|showQuill/);
 assert.doesNotMatch(ui,/dangerouslyPasteHTML|\.innerHTML\s*=/);
});
test('all edited first-party UI code is syntactically valid',()=>{
 for(const file of ['src/lib/webview/dashboard-html.js','media/ba-automatic-ui.js','media/start.js'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
});
