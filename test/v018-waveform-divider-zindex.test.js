'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('My Work canvas overlays the actual #D31145 header border on all screen sizes',()=>{
 const css=read('media/atgv-mywork-ai.css'),appCss=read('media/start.css');
 const html=read('src/lib/webview/dashboard-html.js');
 const header=html.slice(html.indexOf('<header class="app-header"'),html.indexOf('</header>')+9);
 const main=html.slice(html.indexOf('<main id="myWorkView"'),html.indexOf('<main id="workView"'));
 const headerRule=css.match(/body\.atgv-mywork-chat-mode:not\(\.gate-mode\) #appHeader\.app-header,\s*body\.atgv-ba-ai-active:not\(\.gate-mode\) #appHeader\.app-header\{([^}]+)\}/)?.[1]||'';
 const carrier=css.match(/#appHeader #myWorkHeaderWave\.mywork-header-wave\{([^}]+)\}/)?.[1]||'';
 const visual=css.match(/#appHeader #myWorkHeaderWave \.mywork-header-wave-visual\{([^}]+)\}/)?.[1]||'';
 const canvas=css.match(/#appHeader #myWorkHeaderWave canvas#atgvMyWorkAiOrb\{([^}]+)\}/)?.[1]||'';
 const priority=rule=>Number(/z-index:(\d+)/.exec(rule)?.[1]||0);
 assert.match(appCss,/\.app-header\{border-bottom:3px solid #D31145\}/);
 assert.match(headerRule,/overflow:visible!important/);
 assert.match(carrier,/bottom:-3px/);
 assert.match(carrier,/overflow:visible/);
 assert.match(visual,/bottom:-38px/);
 assert.match(visual,/height:76px/);
 assert.ok(priority(visual)>0,'waveform must overlay the real header border');
 assert.ok(priority(canvas)>priority(visual),'canvas must overlay the waveform carrier');
 assert.match(header,/id="myWorkHeaderWave"/);
 assert.match(header,/id="atgvMyWorkAiOrb"/);
 assert.doesNotMatch(main,/id="atgvMyWorkAiOrb"|atgv-mywork-ai-topbar/);
 assert.doesNotMatch(css,/\.atgv-mywork-ai-topbar::after/);
 assert.doesNotMatch(css,/background:#dc303f/);
 assert.match(css,/#appHeader #myWorkHeaderWave \.mywork-header-wave-visual\{left:10px;right:10px;height:58px;bottom:-29px\}/);
 assert.match(css,/#appHeader #myWorkHeaderWave \.mywork-header-wave-visual\{height:42px;bottom:-20px\}/);
});
test('waveform blends from exact header red to CMYK and back to header red',()=>{
 const js=read('media/atgv-mywork-wave-chat.js');
 assert.match(js,/const redRGB=\[211,17,69\],cmykRGB=/);
 assert.match(js,/\[0,219,230\],\[230,36,187\],\[249,212,58\],\[110,125,143\]/);
 assert.match(js,/colorMix=smooth\(colorMix,brActivity\|\|engaged\|\|idle<3\.9\?1:0/);
 assert.match(js,/redGradient\.addColorStop\(0,blendedRGBA\(strand,colorMix,0\)\)/);
 assert.match(js,/window\.addEventListener\('atgv:viewchange',resize\)/);
 assert.match(js,/requestAnimationFrame\(frame\)/);
 assert.match(js,/prefers-reduced-motion: reduce/);
});

test('chat copy has a foreground layer and safe clearance below the header waveform',()=>{
 const css=read('media/atgv-mywork-ai.css');
 const shell=css.match(/#myWorkView > #atgvMyWorkAi,\s*#myWorkView > #atgvMyWorkAi\.atgv-mywork-ai\{([^}]+)\}/)?.[1]||'';
 const results=css.match(/#atgvMyWorkAi \.atgv-mywork-ai-results\{([^}]+)\}/)?.[1]||'';
 // The header clearance is OUTSIDE the scrolling region, not scrolling padding.
 assert.match(shell,/padding:23px 0 0;margin:0/);
 assert.match(shell,/overflow:hidden/);
 assert.match(results,/padding:0 clamp\(12px,2vw,24px\) 26px/);
 assert.match(results,/scroll-padding-top:0/);
 assert.match(results,/overflow-y:auto/);
 assert.match(results,/isolation:isolate/);
 assert.match(results,/z-index:1/);
 assert.match(css,/#atgvMyWorkAi \.atgv-mywork-ai-chat\{\s*position:relative;z-index:1;isolation:isolate/);
 assert.match(css,/#atgvMyWorkAi \.atgv-mywork-ai-results > \.atgv-mywork-ai-conversation\{\s*position:relative;z-index:1/);
 assert.doesNotMatch(css,/#myWorkView > #atgvMyWorkAi\.atgv-mywork-ai\{padding-top:34px\}/);
 assert.match(css,/padding:0 12px 20px;scroll-padding-top:0/);
 assert.doesNotMatch(css,/#myWorkView > #atgvMyWorkAi\.atgv-mywork-ai\{padding-top:24px\}/);
 assert.match(css,/padding-top:0;scroll-padding-top:0/);
 // The animated border remains pointer-transparent and above the red divider.
 assert.match(css,/#topNotification #myWorkHeaderWave \.mywork-header-wave-visual\{[^}]+clip-path:inset\(0 0 50% 0\)/);
 assert.match(css,/#appHeader #myWorkHeaderWave \.mywork-header-wave-visual\{[^}]+clip-path:inset\(0 0 50% 0\)/);
 assert.match(css,/#topNotification #myWorkHeaderWave \.mywork-header-wave-visual\{[^}]+pointer-events:none/);
});
