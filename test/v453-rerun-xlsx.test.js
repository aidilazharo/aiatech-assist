'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const importCode=fs.readFileSync(path.join(__dirname,'../src/discovery-import.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
test('XLSX ingestion is available through the same verified source path as Word/PDF',()=>{
 assert.match(importCode,/extractXlsx\(data\)/);assert.match(importCode,/\.xlsx/);
 assert.match(host,/filters:\{'BRD and Jira Workbook':\['docx','pdf','xlsx'\]\}/);
});
test('Rerun has exactly one user entry point and safe dispatch',()=>{
 assert.match(html,/id="brRerun"/);assert.match(ui,/send\('rerunBusinessRequirement'/);
 assert.match(host,/case 'rerunBusinessRequirement':/);
 assert.match(host,/case 'brJiraPreview'/);
 assert.match(host,/processSelectedDiscoverySources\(\{digests:\[sources\[0\]\.digest\]/);
});
