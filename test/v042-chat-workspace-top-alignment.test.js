'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const css=read('media/atgv-mywork-ai.css');
const base=read('media/start.css');
const html=read('src/lib/webview/dashboard-html.js');
function rule(source,start){const i=source.indexOf(start+'{');assert.ok(i>=0,'Missing '+start);return source.slice(i+start.length+1,source.indexOf('}',i));}
test('My Work chat title matches the left sidebar WORKSPACE title top offset',()=>{
 const sidebar=rule(base,'.sidebar-scroll'),title=rule(base,'.nav-label:first-child');
 assert.match(sidebar,/padding:17px 10px 10px/);
 assert.match(title,/padding-top:6px/);
 const shell=rule(css,'#myWorkView > #atgvMyWorkAi.atgv-mywork-ai');
 assert.match(shell,/padding:0;margin:0;background:#000!important/);
 assert.match(shell,/box-sizing:border-box/);
 assert.match(rule(css,'#atgvMyWorkAi .atgv-mywork-ai-title'),/margin:0 0 7px/);
 assert.match(html,/<div class="nav-label">WORKSPACE<\/div>/);
});
test('the chat and results have the same z-index and remain above their backgrounds',()=>{
 const results=rule(css,'#atgvMyWorkAi .atgv-mywork-ai-results');
 const composer=rule(css,'#atgvMyWorkAi .atgv-mywork-ai-chat');
 assert.match(results,/position:relative;z-index:1;isolation:isolate/);
 assert.match(composer,/position:relative;z-index:1;isolation:isolate/);
 assert.match(css,/#atgvMyWorkAi \.atgv-mywork-ai-results > \.atgv-mywork-ai-conversation\{[\s\S]*?position:relative;z-index:1/);
 assert.match(results,/overflow-y:auto/);
 assert.match(results,/padding:23px clamp\(12px,2vw,24px\) 26px/);
 assert.match(results,/scroll-padding-top:0/);
});
test('all roles share one borderless My Work shell and waveform still stays in header',()=>{
 assert.equal((html.match(/id="atgvMyWorkAi" class="atgv-mywork-ai"/g)||[]).length,1);
 assert.match(css,/#myWorkView > #atgvMyWorkAi\.atgv-mywork-ai\{/);
 assert.match(css,/#appHeader #myWorkHeaderWave \.mywork-header-wave-visual\{/);
 assert.match(css,/clip-path:inset\(0 0 50% 0\)/);
 assert.match(rule(css,'#myWorkView > #atgvMyWorkAi.atgv-mywork-ai'),/border:0!important/);
});
