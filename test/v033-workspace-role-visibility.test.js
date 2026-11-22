'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=relative=>fs.readFileSync(path.join(__dirname,'..',relative),'utf8');

test('Library Studio is hidden until Developer is the actively selected enabled role',()=>{
 const js=read('media/start.js'),html=read('src/lib/webview/dashboard-html.js');
 const eligibility=js.slice(js.indexOf('function canUseLibraryStudio(){'),js.indexOf('function syncLibraryStudioVisibility(){'));
 const visibility=js.slice(js.indexOf('function syncLibraryStudioVisibility(){'),js.indexOf('function renderSidebarRole(){'));
 assert.match(eligibility,/selectedRole==='software-developer'/);
 assert.match(eligibility,/visibleRoles\(\)\.some\(role=>role\.id==='software-developer'\)/);
 assert.match(visibility,/link\.hidden=!allowed/);
 assert.match(visibility,/link\.classList\.toggle\('hidden',!allowed\)/);
 assert.match(visibility,/link\.setAttribute\('aria-hidden',String\(!allowed\)\)/);
 assert.match(visibility,/link\.tabIndex=allowed\?0:-1/);
 assert.match(visibility,/if\(!allowed&&view==='library'\)/);
 assert.match(js,/syncLibraryStudioVisibility\(\);/);
 assert.match(html,/data-nav="library" id="navLibraryStudio" hidden aria-hidden="true" tabindex="-1"/);
});
test('non-Developer direct and automatic navigation to Library Studio are blocked',()=>{
 const js=read('media/start.js');
 assert.match(js,/if\(destination==='library'&&!canUseLibraryStudio\(\)\)/);
 assert.match(js,/Library Studio is only available in the Developer role/);
 assert.match(js,/if\(canUseLibraryStudio\(\)\)navigate\('library'\)/);
 assert.match(js,/if\(view==='library'&&destination!=='library'&&window\.atgvLibraryStudio\?\.isDirty\(\)\)/);
});
test('chat starts immediately below header, waveform clipped without an empty black band',()=>{
 const css=read('media/atgv-mywork-ai.css');
 assert.match(css,/padding:0;margin:0/);
 assert.doesNotMatch(css,/padding:42px 0 0/);
 assert.doesNotMatch(css,/padding-top:34px/);
 assert.doesNotMatch(css,/padding-top:24px/);
 assert.match(css,/clip-path:inset\(0 0 50% 0\)/);
 assert.doesNotMatch(css,/padding:94px 0 0/);
 assert.match(css,/#atgvMyWorkAi \.atgv-mywork-ai-results\{/);
 assert.match(css,/overflow-y:auto/);
 assert.match(css,/#atgvMyWorkAi \.atgv-mywork-ai-chat\{/);
});
