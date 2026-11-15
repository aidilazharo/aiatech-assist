"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const js=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const table=require('../media/atgv-datatables.js');
test('Extension and Project Settings retain independent save scopes inside one tabbed Settings menu',()=>{
 const extension=html.slice(html.indexOf('<main id="settingsView"'),html.indexOf('<main id="projectView"'));
 const project=html.slice(html.indexOf('<main id="projectView"'),html.indexOf('<main id="workView"'));
 for(const name of ['Jira','Github','Catalog','Coordination','Ai','Rag','LocalBackup','SoftwareUpdate']){
   assert.match(extension,new RegExp('id="settings'+name+'Group" data-requirement='));
   assert.doesNotMatch(project,new RegExp('id="settings'+name+'Group"'));
 }
 for(const name of ['Confluence','Roles','Service','Schedule']){
   assert.match(project,new RegExp('id="settings'+name+'Group" data-requirement='));
   assert.doesNotMatch(extension,new RegExp('id="settings'+name+'Group"'));
 }
 assert.equal((extension.match(/class="ext-settings-accordion"/g)||[]).length,8);
 assert.equal((project.match(/class="ext-settings-accordion"/g)||[]).length,4);
 assert.doesNotMatch(html,/class="ext-settings-accordion"[^>]*\bopen\b/);
 assert.match(html,/data-nav="settings" id="navSettings"/);
 assert.doesNotMatch(html,/data-nav="project-settings" id="navProjectSettings"/);
 assert.match(html,/data-nav="settings" id="navSettings"[^<]*>.*?Settings<\/button>/);
 assert.match(extension,/id="settingsExtensionTab"[^>]+aria-selected="true"/);
 assert.match(extension,/id="extensionToProjectSettings"[^>]+aria-selected="false"/);
 assert.match(project,/id="projectToExtensionSettings"[^>]+aria-selected="false"/);
 assert.match(project,/id="projectSettingsTab"[^>]+aria-selected="true"/);
 assert.match(js,/destination==='project-settings'\|\|destination==='tech'\?'settings'/);
 assert.match(js,/function collapseExtensionSettings\(\)/);
 assert.match(js,/function collapseProjectSettings\(\)/);
 assert.match(js,/activeScope=!!p&&p.id===activeId/);
 assert.match(css,/ext-settings-badge\[data-state="ready"\]/);
});
test('existing save and test controls retain identity across both settings pages',()=>{
 for(const id of ['extensionForm','settingsSpaceSearch','settingsSpaceQuery','githubForm','githubRepositoryUrl','testGithub','catalogForm','aiProviderTest','coordinationProvider','roleSettingsForm','aiServiceSave','extensionToProjectSettings','projectToExtensionSettings'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.doesNotMatch(js,/\$\('settingsProject'\)/);
 assert.match(js,/Choosing a space edits only the visible project's unsaved form/);
 assert.match(js,/Save Project Settings to apply this space/);
});
test('data-table supports searching sorting numeric Jira keys and paging without mutating source',()=>{
 const rows=Array.from({length:24},(_,i)=>({key:'TC-'+(i+1),title:'Issue '+(i+1),type:i%2?'Story':'Task'}));
 const r=table.select(rows,{term:'TC-2',pageSize:5,sortKey:'key'});
 assert.equal(r.total,24);assert.equal(r.filtered,6);assert.equal(r.pages,2);assert.deepEqual(r.rows.map(x=>x.key),['TC-2','TC-20','TC-21','TC-22','TC-23']);
 assert.equal(table.select(rows,{pageSize:10,page:30}).page,3);
 assert.equal(rows[0].key,'TC-1');
});
test('Jira published, preview, overview and My Work use DataTables',()=>{
 for(const pattern of [/ATGVDataTables\.mount\(root,rows/,/ATGVDataTables\.mount\(box,/,/ATGVDataTables\.mount\(list,/,/ATGVDataTables\.mount\(root,tableRows/])assert.match(js,pattern);
 assert.match(html,/atgv-datatables\.js/);
});
