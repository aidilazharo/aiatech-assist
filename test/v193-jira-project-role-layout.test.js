'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('Jira Project Key field is wired into test, save, and refresh without changing project-scoped values',()=>{
 const host=read('test/generated/extension-source.txt'),ui=read('media/start.js'),cfg=read('src/projects.js');
 assert.match(host,/field\('jiraProjectKey','Default Project Key'/);
 assert.match(host,/field\('jira\.projectKey','Jira Project Key'/);
 assert.match(host,/projectKey:String\(msg\.settings\?\.jira\?\.projectKey\|\|''\)\.trim\(\)/);
 assert.match(host,/rest\/api\/3\/project\/\$\{encodeURIComponent\(fields\.projectKey\)\}/);
 assert.match(ui,/field\('jiraProjectKey',extensionSettings\.jira\?\.projectKey\|\|''\)/);
 assert.match(ui,/jiraProjectKey','jiraToken'/);
 assert.match(ui,/projectKey:read\('jiraProjectKey'\)/);
 assert.match(cfg,/projectSettings\[group\]\?\.\[field\] \|\| extensionSettings\[group\]\?\.\[field\]/);
});

test('Role checkboxes and order inputs are compact and scoped to role management',()=>{
 const css=read('media/start.css'),ui=read('media/start.js');
 assert.match(css,/#projectView #roleSettingsSection \.check-row input\[type=checkbox\]\{[^}]*width:16px!important/);
 assert.match(css,/#projectView #roleSettingsSection \.role-order-label select\{[^}]*width:58px!important/);
 assert.match(css,/#projectView #roleSettingsSection \.role-settings-list\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(ui,/info\.className='role-config-name'/);
});
