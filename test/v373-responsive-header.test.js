'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const markup=read('test/generated/extension-source.txt');
const ui=read('media/start.js'),theme=read('media/atgv-ui-theme.css');
test('extension and library versions are beneath AIATECH ASSIST in both headers',()=>{
 assert.match(markup,/class="brand-logo-stack"/);
 assert.match(markup,/class="gate-logo-stack"/);
 for(const id of ['headerLibraryVersion','gateLibraryVersion'])assert.ok(markup.includes('id="'+id+'"'));
 assert.match(ui,/updateBrandLibraryVersion\(state\)/);
  assert.match(ui,/const installed=String\(state\?\.installed\?\.version\|\|''\)/);
  assert.match(ui,/const available=String\(state\?\.remote\?\.version\|\|''\)/);
 const brand=markup.slice(markup.indexOf('<div class="brand-area">'),markup.indexOf('<div class="header-context">'));
 assert.ok(brand.indexOf('brand-name')<brand.indexOf('brand-versions'));
});
test('start removes settings, model picker lives under Handoffs in left sidebar',()=>{
 assert.doesNotMatch(markup,/id="gateSettings"/);
 const sidebar=markup.slice(markup.indexOf('<aside class="sidebar"'),markup.indexOf('</aside>'));
 assert.ok(sidebar.indexOf('data-nav="operations"')>0);
 assert.ok(sidebar.indexOf('id="headerModel"')>sidebar.indexOf('data-nav="operations"'));
 assert.equal((markup.match(/id="headerModel"/g)||[]).length,1);
 assert.match(ui,/\$\('headerModel'\)\.addEventListener\('click',openModelPicker\)/);
});
test('top bar shows lowercase email before far-right guide icon',()=>{
 const a=ui.indexOf('function updateHeaderUserName('),b=ui.indexOf('function updateBrandLibraryVersion(',a);
 const element={textContent:'',title:''};
 const set=new Function('$',ui.slice(a,b)+'return updateHeaderUserName')(id=>element);
 set('JANE.DOE@EXAMPLE.COM');assert.equal(element.textContent,'jane.doe@example.com');
 set('no-at-sign');assert.equal(element.textContent,'Not configured');
 const top=markup.slice(markup.indexOf('<div class="header-end">'),markup.indexOf('</header>'));
 assert.ok(top.indexOf('id="headerUserName"')<top.indexOf('id="guideHelp"'));
});
test('every role circular indicator remains responsive and animates active steps',()=>{
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
