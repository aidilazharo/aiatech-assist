'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const setup=require('../src/lib/startup-setup');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('Atlassian onboarding derives Confluence /wiki from one editable site URL',()=>{
 const input={...setup.DEFAULTS,jiraUrl:'https://other-site.atlassian.net'};
 const data=setup.validate(input);
 assert.equal(data.jiraUrl,'https://other-site.atlassian.net');
 assert.equal(data.confluenceUrl,'https://other-site.atlassian.net/wiki');
 const html=read('src/lib/webview/dashboard-html.js');
 const form=html.match(/<form id="startupConnectionForm"[\s\S]*?<\/form>/)?.[0];
 assert.ok(form);
 assert.match(form,/Atlassian &amp; GitHub connections/);
 assert.match(form,/Atlassian URL/);
 assert.match(form,/Atlassian email/);
 assert.doesNotMatch(form,/id="startupConfluenceUrl"/);
 assert.match(form,/id="startupProjectRepository"/);
});
test('both supported organization mappings point to exact required and optional repos',()=>{
 const a=setup.validate({...setup.DEFAULTS,githubUrl:'github.com/aidilazharo'});
 assert.equal(a.extensionRepoUrl,'https://github.com/aidilazharo/aiatech-assist');
 assert.equal(a.libraryRepoUrl,'https://github.com/aidilazharo/tech-stacks-skills');
 const b=setup.validate({...setup.DEFAULTS,githubUrl:'https://github.com/aiamalaysia'});
 assert.equal(b.extensionRepoUrl,'https://github.com/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc');
 assert.equal(b.libraryRepoUrl,'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills');
 assert.equal(b.extensionReleasesUrl,'https://github.com/aidilazharo/extension');
 assert.equal(b.libraryReleasesUrl,'https://github.com/aidilazharo/library');
 assert.equal(b.projectRepoUrl,'https://github.com/aiamalaysia/my-fow-technology-app-techassists');
});
test('unsafe organization/project URLs cannot redirect PAT checks to unknown hosts',()=>{
 for(const raw of ['https://github.com/aidilazharo/extra','https://evil.com/aidilazharo','http://github.com/aiamalaysia',
  'https://attacker@github.com/aiamalaysia','github.com/other-user']){
  assert.throws(()=>setup.validate({...setup.DEFAULTS,githubUrl:raw}));
 }
 for(const value of ['../secret','https://github.com/evil/repo','org/repo']){
  assert.throws(()=>setup.validate({...setup.DEFAULTS,projectRepository:value}));
 }
});
test('host checks services sequentially, enforces read PAT for sources with optional write and separates optional failures',()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 assert.match(host,/for\(const spec of specifications\)/);
 assert.match(host,/await spec\.check\(\)/);
 assert.match(host,/await onProgress\(value\)/);
 assert.match(host,/meta\.permissions\?\.pull===false/);
 assert.match(host,/sourceAccess=\{read:true,write:meta\.permissions\?\.push===true\}/);
 assert.match(host,/await verifyReleaseAssetDownload\(url,asset\.id\)/);
 assert.match(host,/redirect:'manual'/);
 assert.match(host,/release-assets\|github-releases\|objects/);
 assert.match(host,/check\.required&&check\.state==='error'/);
 assert.match(host,/extension-releases/);
 assert.match(host,/library-releases/);
 assert.match(host,/repositoryUrl:startupLibraryRepository\(\)/);
});
test('UI streams status under connection text using blue, green, red bars',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const js=read('media/start.js');
 const css=read('media/start.css');
 assert.match(html,/id="startupConnectionProgress"/);
 assert.match(js,/function renderStartupConnectionProgress\(\)/);
 assert.match(js,/if\(message\.check\.state==='pending'\)/);
 assert.match(css,/data-state="pending"/);
 assert.match(css,/data-state="ok"/);
 assert.match(css,/data-state="error"/);
 assert.match(css,/background:#328bff/);
 assert.match(css,/background:#2bb874/);
 assert.match(css,/background:#e45362/);
});
