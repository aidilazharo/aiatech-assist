'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const markup=read('test/generated/extension-source.txt');
const ui=read('media/start.js'),styles=read('media/start.css'),theme=read('media/atgv-ui-theme.css');
test('brand shows both versions under the logo in header and start screen',()=>{
 assert.match(markup,/class="brand-logo-stack"/);
 assert.match(markup,/class="gate-logo-stack"/);
 for(const id of ['headerLibraryVersion','gateLibraryVersion'])assert.ok(markup.includes('id="'+id+'"'));
 assert.match(ui,/updateBrandLibraryVersion\(state.installed\?\.version\|\|state.remote\?\.version\|\|''\)/);
});
test('start has no settings action; model picker is under Handoffs in left navigation',()=>{
 assert.doesNotMatch(markup,/id="gateSettings"/);
 const sidebar=markup.slice(markup.indexOf('<aside class="sidebar"'),markup.indexOf('</aside>'));
 assert.ok(sidebar.indexOf('data-nav="operations"')>0);
 assert.ok(sidebar.indexOf('id="headerModel"')>sidebar.indexOf('data-nav="operations"'));
 assert.equal((markup.match(/id="headerModel"/g)||[]).length,1);
 assert.match(ui,/\$\('headerModel'\)\.addEventListener\('click',openModelPicker\)/);
});
test('user full name is derived from email and shown far right without remote lookup',()=>{
 const start=ui.indexOf('function fullNameFromEmail('),end=ui.indexOf('function updateHeaderUserName(',start);
 const name=new Function(ui.slice(start,end)+'return fullNameFromEmail')();
 assert.equal(name('muhamad.aidilazhar.salim@aia.com'),'Muhamad Aidilazhar Salim');
 assert.equal(name('john_doe+work@example.com'),'John Doe');
 assert.equal(name('no-at-sign'),'');
 const top=markup.slice(markup.indexOf('<div class="header-end">'),markup.indexOf('</header>'));
 assert.ok(top.indexOf('id="headerUserName"')>top.indexOf('id="guideHelp"'));
 assert.match(ui,/updateHeaderUserName\(extensionSettings\.jira\?\.email/);
});
test('every SDLC circular progress group has responsive circle sizing and running rotation',()=>{
 for(const id of ['overview-phase-grid','roleStepButtons.role-circle-steps','discovery-workflow','design-milestone-list','ux-design-workflow','developer-br-steps'])
  assert.ok(theme.includes(id),id);
 assert.match(theme,/container-type:inline-size/);
 assert.match(theme,/@keyframes atgv-ui-rotating-circle/);
 assert.match(theme,/developer-br-stage.current strong::before/);
 assert.match(theme,/role-circle-step.selected:not/);
 assert.match(theme,/@media\(prefers-reduced-motion:reduce\)/);
});
test('manifest version matches extension display version',()=>{
 const manifest=JSON.parse(read('package.json'));
 assert.match(manifest.version,/^\d+\.\d+\.\d+$/);
 assert.equal(manifest.atgvDisplayVersion,manifest.version);
});
