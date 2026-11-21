'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=read('media/atgv-mywork-ai.css'),html=read('src/lib/webview/dashboard-html.js');
const rule=selector=>{
 const at=css.indexOf(selector+'{');
 assert.ok(at>=0,'Missing CSS: '+selector);
 return css.slice(at+selector.length+1,css.indexOf('}',at));
};
test('My Work uses a full-width and full-height borderless conversation pane',()=>{
 const shell=rule('#myWorkView > #atgvMyWorkAi.atgv-mywork-ai');
 const results=rule('#atgvMyWorkAi .atgv-mywork-ai-results');
 const conversation=rule('#atgvMyWorkAi .atgv-mywork-ai-conversation');
 assert.match(shell,/width:100%;min-width:0/);
 assert.match(shell,/height:100%/);
 assert.match(shell,/border:0!important/);
 assert.match(shell,/border-radius:0/);
 assert.match(results,/flex:1 1 auto/);
 assert.match(results,/width:100%/);
 assert.match(results,/overflow-y:auto/);
 assert.match(results,/max-width:none/);
 assert.match(results,/border:0!important/);
 assert.match(conversation,/flex:1 1 auto/);
 assert.match(conversation,/width:100%/);
 assert.match(conversation,/max-width:none/);
 assert.match(conversation,/border:0!important/);
 assert.match(conversation,/background:transparent/);
});
test('Chat input is bottom anchored and neither messages nor composer have card borders',()=>{
 for(const selector of [
  '#atgvMyWorkAi .atgv-mywork-ai-message',
  '#atgvMyWorkAi .atgv-mywork-ai-message.assistant',
  '#atgvMyWorkAi .atgv-mywork-ai-chat',
  '#atgvMyWorkAi .atgv-mywork-ai-composer']){
  const style=rule(selector);
  assert.match(style,/border:0!important/,selector);
  assert.doesNotMatch(style,/border:1px/,selector);
 }
 assert.match(rule('#atgvMyWorkAi .atgv-mywork-ai-message'),/width:100%;max-width:none/);
 assert.match(rule('#atgvMyWorkAi .atgv-mywork-ai-chat'),/flex:0 0 auto/);
 assert.match(rule('#atgvMyWorkAi .atgv-mywork-ai-composer'),/width:100%/);
 const page=html.slice(html.indexOf('<main id="myWorkView"'),html.indexOf('<main id="workView"'));
 assert.ok(page.indexOf('id="atgvMyWorkAiResults"')>0);
 assert.ok(page.indexOf('id="atgvMyWorkAiChatForm"')>page.indexOf('id="atgvMyWorkAiResults"'));
});
test('Actual header red line remains beneath waveform without a duplicate divider',()=>{
 const carrier=rule('#appHeader #myWorkHeaderWave.mywork-header-wave');
 const visual=rule('#appHeader #myWorkHeaderWave .mywork-header-wave-visual');
 const canvas=rule('#appHeader #myWorkHeaderWave canvas#atgvMyWorkAiOrb');
 assert.match(carrier,/bottom:-3px/);
 assert.match(visual,/z-index:3/);
 assert.match(canvas,/z-index:4/);
 assert.doesNotMatch(css,/atgv-mywork-ai-topbar::after/);
 assert.match(read('media/start.css'),/\.app-header\{border-bottom:3px solid #D31145\}/);
});
