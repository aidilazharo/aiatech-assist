'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('My Work canvas z-index stays above the red divider at all supported sizes',()=>{
 const css=read('media/atgv-mywork-ai.css'),html=read('src/lib/webview/dashboard-html.js');
 const top=css.match(/#atgvMyWorkAi \.atgv-mywork-ai-topbar\{([^}]+)\}/)?.[1]||'';
 const divider=css.match(/#atgvMyWorkAi \.atgv-mywork-ai-topbar::after\{([^}]+)\}/)?.[1]||'';
 const visual=css.match(/#atgvMyWorkAi \.atgv-mywork-ai-visual\{([^}]+)\}/)?.[1]||'';
 const canvas=css.match(/#atgvMyWorkAi canvas#atgvMyWorkAiOrb\{([^}]+)\}/)?.[1]||'';
 const priority=rule=>Number(/z-index:(\d+)/.exec(rule)?.[1]||0);
 assert.match(top,/position:relative/);
 assert.match(top,/overflow:visible/);
 assert.match(top,/isolation:isolate/);
 assert.match(divider,/position:absolute/);
 assert.match(divider,/bottom:0/);
 assert.match(divider,/background:#dc303f/);
 assert.ok(priority(visual)>priority(divider),'waveform wrapper must overlay red border');
 assert.ok(priority(canvas)>priority(divider),'canvas must overlay red border');
 assert.match(visual,/bottom:-38px/);
 assert.match(css,/#atgvMyWorkAi \.atgv-mywork-ai-visual\{left:10px;right:10px;height:58px;bottom:-29px\}/);
 assert.match(css,/#atgvMyWorkAi \.atgv-mywork-ai-visual\{height:42px;bottom:-21px\}/);
 assert.match(html,/AI waveform fades in red, changes to CMYK while active, and fades back to red/);
});
test('waveform transitions from red to CMYK on activity and returns to red with fade-out',()=>{
 const js=read('media/atgv-mywork-wave-chat.js');
 assert.match(js,/const redRGB=\[255,70,83\],cmykRGB=/);
 assert.match(js,/\[0,219,230\],\[230,36,187\],\[249,212,58\],\[110,125,143\]/);
 assert.match(js,/colorMix=smooth\(colorMix,engaged\|\|idle<3\.9\?1:0/);
 assert.match(js,/redGradient\.addColorStop\(0,blendedRGBA\(strand,colorMix,0\)\)/);
 assert.match(js,/requestAnimationFrame\(frame\)/);
 assert.match(js,/prefers-reduced-motion: reduce/);
});
