'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
const ext=read('test/generated/extension-source.txt'),ui=read('media/library-studio.js'),css=read('media/library-studio.css'),app=read('media/start.js');
test('verified GitHub library install activates CodeMirror in the existing webview automatically',()=>{
 assert.match(ext,/const installed=await catalogVendorLibraries\.install/);
 assert.match(ext,/installedVendorAssets=installed;/);
 assert.match(ext,/dashboard\.webview\.options=\{\.\.\.dashboard\.webview\.options,localResourceRoots:\[/);
 assert.match(ext,/dashboard\.webview\.html=html\(dashboard\.webview,\{resumeLibrary:true\}\)/);
 assert.match(ext,/meta name="atgv-resume-library"/);
 assert.match(ui,/send\('libraryWebviewBoot',\{hasCodeMirror:!!cm,loadErrors:window\.atgvLibraryAssetFailures\|\|\[\]\}\)/);
 assert.match(app,/if\(restoreLibraryAfterVendorSync&&workspaceOpened\)/);
 assert.match(ext,/case 'libraryWebviewBoot':\{/);
 assert.doesNotMatch(ext,/reopen ATGV: Start to activate/);
});
test('editor remains loaded from verified cached webview libraries, not remote scripts',()=>{
 assert.match(ext,/\?cmFiles\.map\(file=>`<script src="\$\{cmAsset\(file\)\}"><\/script>`\)/);
 assert.match(ui,/window\.CodeMirror\.fromTextArea/);
 assert.match(ext,/vscode\.Uri\.file\(installedVendorAssets\.dir\)/);
 assert.match(ext,/script-src \$\{webview\.cspSource\}/);
});
test('four-step agent progress and on-demand evidence preserve combined config and image results',()=>{
 assert.match(ui,/function renderCombinedChecks\(\)/);
 assert.match(ui,/\['Context','Tools','Loop','Governance'\]\.entries\(\)/);
 assert.match(ext,/id="libraryHarnessSteps"/);
 assert.match(ui,/Config: /);
 assert.match(ui,/Image: /);
 assert.doesNotMatch(ext,/id="libraryImageTrace"/);
});
test('image code tabs show SVG, TypeScript, C# and Java; only trusted SVG renderer can run',()=>{
 for(const lang of ['svg','typescript','csharp','java'])assert.match(ext,new RegExp('data-code-language="'+lang+'"'));
 assert.match(ext,/id="libraryImageReplay"/);
 assert.match(ui,/language==='svg'/);
 assert.match(ui,/imageSourceFor\(language,result\)/);
 assert.match(ui,/state\.imageCodeLanguage!=='svg'/);
 assert.match(ext,/if\(msg\.renderer!=='svg'\)throw Error/);
 assert.doesNotMatch(ext,/name="libraryImageCodeStack"/);
});

test('catalog button stays in same title row and on far right',()=>{
 assert.match(ext,/class="section-title library-titlebar"/);
 assert.match(css,/#libraryView \.library-titlebar > \.stack\{flex:0 0 auto;margin-left:auto\}/);
 assert.match(ext,/id="libraryCheckUpdates"/);
 assert.doesNotMatch(ext,/id="libraryRefresh"/);
});
