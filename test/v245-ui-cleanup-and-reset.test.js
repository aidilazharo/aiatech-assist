'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
test('Discovery save footer keeps its action and accessible status, but removes duplicate text',()=>{
 const start=host.indexOf('<div class="discovery-action-bar">');
 const end=host.indexOf('</form>',start);
 assert.ok(start>=0&&end>start);
 const footer=host.slice(start,end);
 assert.doesNotMatch(footer,/<strong>Discovery answers<\/strong>/);
 assert.match(footer,/id="discoverySave"/);
 assert.match(footer,/id="baDiscoverySaveStatus" role="status" aria-live="polite"/);
 assert.match(css,/#discoveryForm \.discovery-action-bar\{justify-content:flex-end/);
});
test('Reset Tech Stack clears the draft framework and selects the placeholder',()=>{
 assert.match(ui,/architectPendingAction==='architectResetStack'\)\{[\s\S]*?architectStackDraft=\{projectId:activeId,stackId:''\};[\s\S]*?\$\('architectStackSelect'\)\.value='';/);
 assert.match(ui,/empty\.textContent='Select a technology stack'/);
});
