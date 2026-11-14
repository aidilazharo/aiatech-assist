'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test','generated','extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media','library-studio.css'),'utf8');
const js=fs.readFileSync(path.join(root,'media','library-studio.js'),'utf8');

test('image source code is always visible after a result and run/pass/fail share a compact footer',()=>{
 const result=html.slice(html.indexOf('id="libraryImageResultsPanel"'),html.indexOf('</section>',html.indexOf('id="libraryImageResultsPanel"')));
 assert.match(result,/id="libraryImageCodeMode"[\s\S]*id="libraryImageCodeDetails" class="library-code-source-frame"[\s\S]*id="libraryImageCode"[\s\S]*class="library-image-code-actions"[\s\S]*id="libraryImageReplay"[\s\S]*id="libraryImageVerdict"/);
 assert.doesNotMatch(result,/<details id="libraryImageCodeDetails"/);
 for(const lang of ['svg','typescript','csharp','java'])assert.ok(result.includes('data-code-language="'+lang+'"'));
 assert.match(css,/\.library-code-tablist\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/\.library-image-code-actions\{display:flex;align-items:center;justify-content:space-between/);
 assert.match(js,/const supported=language==='svg'/); // only the trusted renderer is runnable.
});
test('resource selection, editing actions and code editor stay in the specified order',()=>{
 const start=html.indexOf('id="libraryAgentDashboard"'),end=html.indexOf('id="libraryHarnessTests"',start);
 const area=html.slice(start,end);
 for(const id of ['libraryRelatedTabs','libraryHarnessSelector','libraryHarnessTarget','libraryEdit','libraryValidate','librarySave','libraryCancel','libraryRelationships','libraryEditor'])assert.ok(area.includes('id="'+id+'"'),id);
 assert.ok(area.indexOf('id="libraryHarnessSelector"')<area.indexOf('id="libraryRelatedTabs"'));
 assert.match(area,/class="library-selection-row"/);
 assert.ok(area.indexOf('id="libraryHarnessSelector"')<area.indexOf('class="library-studio-actions"'));
 assert.ok(area.indexOf('id="libraryRelationships"')<area.indexOf('id="libraryEditor"'));
 assert.match(css,/\.library-harness-target\{margin:10px 0 7px;display:grid;grid-template-columns:max-content minmax\(0,1fr\)/);
});
test('agent/harness progress shows the 4 connected circular checks with evidence available',()=>{
 const area=html.slice(html.indexOf('id="libraryAgentDashboard"'),html.indexOf('id="libraryHarnessSelector"'));
 assert.match(area,/id="libraryHarnessProgress"[\s\S]*id="libraryHarnessSteps"/);
 assert.doesNotMatch(area,/Check evidence|Run Checks|Not checked/);
 assert.match(css,/\.library-agent-dashboard \.library-agent-steps\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/\.library-agent-step:not\(:last-child\):after\{top:20px/);
 assert.match(js,/\['Context','Tools','Loop','Governance'\]/);
});
