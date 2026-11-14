'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('BA presents one Jira issue inventory with BR, issue type, status, List and Hierarchy controls',()=>{
 assert.equal((host.match(/id="baJiraInventoryTable"/g)||[]).length,1);
 for(const id of ['baJiraBrFilter','baJiraTypeFilter','baJiraStatusFilter','baJiraListView','baJiraTreeView','baJiraHierarchy'])assert.match(host,new RegExp('id="'+id+'"'));
 assert.match(ui,/function baJiraRequirementKeys\(\)/);
 assert.match(ui,/function baJiraScopeRows\(items,brId\)/);
 assert.match(ui,/function renderBAJiraHierarchy\(rows\)/);
 assert.match(ui,/function openBRJiraInventory\(brId\)/);
 assert.match(ui,/viewJira\.addEventListener\('click',event=>\{event\.stopPropagation\(\);openBRJiraInventory\(group\.id\);\}\)/);
 assert.doesNotMatch(host,/All published Jira records \(project history\)/i);
 assert.doesNotMatch(ui,/renderCompletedJiraTable\(card,br,tree\);/);
});
test('BR mapping uses exact Jira issue keys and parent links rather than title similarity',()=>{
 const src=ui.slice(ui.indexOf('function baJiraScopeRows('),ui.indexOf('function renderBAJiraHierarchy('));
 assert.match(src,/mapping\.keys/);assert.match(src,/item\.parentKey/);assert.match(src,/item\.sourceStoryKey/);
 assert.doesNotMatch(src,/summary|includes\(.*title|toLowerCase/);
});
test('BR completion steps keep their numbers and green outlines, with reduced-motion support',()=>{
 assert.match(css,/\.workflow-step\[data-status="success"\] \.milestone-circle\{\s*background:var\(--vscode-editor-background/);
 assert.match(css,/border:3px solid #29a675!important/);
 assert.match(css,/\.milestone-number\{display:block!important/);
 assert.match(css,/\.milestone-tick\{display:none!important;animation:none!important/);
 assert.match(css,/@keyframes atgvBACompletedOutline/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('catalogue viewer distinguishes installed SDLC catalogue, activated snapshot and framework kit',()=>{
 assert.match(ui,/Installed SDLC Catalogue v/);
 assert.match(ui,/Active SDLC Catalogue v/);
 assert.match(ui,/Framework Kit v/);
 assert.match(ui,/Git SHA/);
});
