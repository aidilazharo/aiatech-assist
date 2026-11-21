'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('compact CMYK orb is a valid offline animated WebP with sixteen source frames',()=>{
 const image=fs.readFileSync(path.join(root,'media','atgv-mywork-orb-spin.webp'));
 assert.equal(image.toString('ascii',0,4),'RIFF');
 assert.equal(image.toString('ascii',8,12),'WEBP');
 assert.match(image.toString('ascii',12,32),/VP8X/);
 assert.match(image.toString('latin1'),/ANIM/);
 assert.equal(image.toString('latin1').match(/ANMF/g)?.length,16);
 assert.ok(image.length>2000 && image.length<16000,'orb should be lightweight');
});

test('My Work animated waveform is packaged and no longer depends on orb playback',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const css=read('media/atgv-mywork-ai.css');
 const js=read('media/atgv-mywork-wave-chat.js');
 const packaging=read('scripts/package-vsix.py');
 assert.match(html,/atgv-mywork-wave-chat\.js/);
 assert.match(html,/<canvas id="atgvMyWorkAiOrb"/);
 assert.match(css,/canvas#atgvMyWorkAiOrb/);
 assert.match(js,/requestAnimationFrame\(frame\)/);
 assert.match(packaging,/for folder in \('src', 'assets', 'media'/);
 assert.doesNotMatch(html,/--atgv-mywork-orb:url/);
});
test('waveform slows to a line, fades and supports reduced-motion environments',()=>{
 const js=read('media/atgv-mywork-wave-chat.js');
 const css=read('media/atgv-mywork-ai.css');
 for(const state of ['ACTIVE','SLOWING','LINE ONLY','FADING','SLEEPING'])assert.ok(js.includes(state));
 assert.match(js,/requestAnimationFrame\(frame\)/);
 assert.match(js,/prefers-reduced-motion/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('right content pane is black with contrast-preserving palette, sidebar untouched',()=>{
 const css=read('media/start.css');
 const main=read('src/lib/webview/dashboard-html.js');
 assert.match(css,/#contentPane\.content-pane \{/);
 assert.match(css,/background:#000!important/);
 assert.match(css,/--atgv-surface:#111419/);
 assert.match(css,/--vscode-foreground:#f6f7fa/);
 assert.match(main,/id="contentPane" class="content-pane"/);
 assert.doesNotMatch(css,/#contentPane\.content-pane[^}]+\.sidebar\{/);
});

test('release retains source-only .memory and current ATGV version metadata',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
 assert.equal(pkg.atgvDisplayVersion,pkg.version);
 assert.ok(read('README.md').includes('**Version: '+pkg.version+'**'));
 assert.ok(read('RELEASE.md').includes('ATGV AIATECH Assist v'+pkg.version));
 assert.match(read('.gitattributes'),/^\.memory export-ignore$/m);
});
