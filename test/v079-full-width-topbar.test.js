'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');

test('notification and application header occupy full webview width while content shell remains capped',()=>{
 assert.match(css,/\.app-layout\{width:100%;max-width:1560px;margin-inline:auto\}/);
 assert.match(css,/\.app-header,\.top-notification\{width:100%;max-width:none;margin-inline:0;align-self:stretch;/);
 assert.match(css,/\.top-notification\{justify-content:center;min-height:67px\}/);
 assert.ok(!css.includes('.app-header,.app-layout{width:100%;max-width:1560px'));
});
test('notification replacement is full bleed and adapts to narrow webviews',()=>{
 assert.match(css,/@media\(max-width:750px\)\{\.app-header,\.top-notification\{padding-inline:14px\}/);
 assert.match(css,/\.top-notification-text\{flex:0 1 auto;max-width:780px\}/);
 assert.match(ui,/\$\('appHeader'\)\.classList\.add\('hidden'\)/);
 assert.match(ui,/\$\('topNotification'\)\.classList\.add\('hidden'\)/);
});
