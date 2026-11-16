'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const markup=read('test/generated/extension-source.txt'),css=read('media/start.css'),controller=read('media/user-guide-controller.js');
test('flat icon is the final action in the app header and the start screen',()=>{
 const top=markup.match(/<div class="header-end">(.*?)<\/div>/s)?.[1];
 assert.ok(top&&top.includes('id="guideHelp"')&&top.indexOf('id="guideHelp"')<top.indexOf('id="headerUserName"'));
 assert.ok(top.includes('class="guide-icon-button"')&&top.includes('class="guide-help-icon"'));
 assert.ok(!top.includes(' Guide</span>'));
 const gate=markup.match(/<div class="gate-header-actions">(.*?)<\/div>/s)?.[1];
 assert.ok(gate&&gate.includes('id="gateGuideHelp"')&&!gate.includes('id="gateSettings"'));
 assert.ok(gate.includes('class="guide-icon-button"'));
});
test('guide has header, start, and settings launch points but none in role pages',()=>{
 assert.equal((markup.match(/id="guideHelp"/g)||[]).length,1);
 assert.equal((markup.match(/id="gateGuideHelp"/g)||[]).length,1);
 assert.equal((markup.match(/id="settingsGuideHelp"/g)||[]).length,1);
 assert.ok(!markup.includes('id="workGuide"'));
 assert.ok(!controller.includes("$('workGuide')"));
 assert.equal((controller.match(/addEventListener\('click',\(\)=>openMenu\(/g)||[]).length,3);
});
test('guide choices use explicit narrow radio controls and full-width descriptive labels',()=>{
 assert.ok(controller.includes("info.className='guide-tour-info'"));
 assert.ok(css.includes('.guide-tour-option{display:grid;grid-template-columns:20px minmax(0,1fr) auto;'));
 assert.ok(css.includes('.guide-menu-card .guide-tour-option input[type="radio"]{'));
 assert.ok(css.includes('width:18px;min-width:18px;max-width:18px'));
 assert.ok(css.includes('.guide-tour-info{display:flex;flex-direction:column'));
 assert.ok(css.includes('.guide-menu-card .guide-mode-control input[type="radio"]{'));
 assert.ok(css.includes('width:17px;min-width:17px;max-width:17px'));
 assert.ok(css.includes('max-height:min(360px,45vh)'));
});
test('version is 0.0.94 and accessible icon actions retain labels',()=>{
 assert.match(JSON.parse(read('package.json')).version,/^\d+\.\d+\.\d+$/);
 for(const id of ['guideHelp','gateGuideHelp']){
  const button=markup.match(new RegExp(`<button id="${id}"[^>]*>`))?.[0];
  assert.ok(button?.includes('aria-label="Open interactive user guide"'));
  assert.ok(button?.includes('title="Interactive User Guide"'));
 }
});
