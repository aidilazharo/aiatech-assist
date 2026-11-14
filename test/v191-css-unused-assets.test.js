'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const load=p=>fs.readFileSync(path.join(root,p),'utf8');
test('legacy Copilot UI and removed testing manual are not bundled',()=>{
 for(const p of ['src/architect-stack-guide.js','src/developer-copilot-markup.js','src/ai-change-resolution/host-bridge.js','media/developer-copilot.js','media/developer-copilot.css']){
  assert.equal(fs.existsSync(path.join(root,p)),false,p);
 }
 const host=load('test/generated/extension-source.txt');
 assert.doesNotMatch(host,/developer-copilot\.(?:css|js)|developerCopilotMarkup/);
 assert.match(host,/const developerCopilot=require\('\.\/developer-copilot'\)/);
 assert.match(host,/architectCheckStackUpdates/);
});
test('active webview style and AI development action are preserved',()=>{
 const css=load('media/start.css');const js=load('media/start.js');
 assert.match(css,/\.developer-ai-draft-panel/);
 assert.match(css,/\.architect-simple-actions/);
 assert.match(js,/architectSaveStack/);
 assert.match(js,/architectResetStack/);
 assert.ok(js.includes('devCopilotStart'));
});
