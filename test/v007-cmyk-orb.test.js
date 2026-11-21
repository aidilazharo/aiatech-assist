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

test('My Work orb is resolved as a packaged VS Code webview asset',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const css=read('media/atgv-mywork-ai.css');
 const packageScript=read('scripts/package-vsix.py');
 assert.match(html,/const myWorkOrbWebp=webview\.asWebviewUri\(vscode\.Uri\.joinPath\(context\.extensionUri,'media','atgv-mywork-orb-spin\.webp'\)\)/);
 assert.match(html,/--atgv-mywork-orb:url\(&quot;\$\{myWorkOrbWebp\}&quot;\)/);
 assert.match(css,/background-image:var\(--atgv-mywork-orb\)/);
 assert.match(packageScript,/for folder in \('src', 'assets', 'media'/);
 assert.match(packageScript,/'webp':'image\/webp'/);
 assert.doesNotMatch(css,/https?:\/\//,'local asset required');
});

test('small orb rotates smoothly in multiple axes, retaining success fade',()=>{
 const css=read('media/atgv-mywork-ai.css');
 assert.match(css,/width:72px;height:72px/);
 assert.match(css,/width:58px;height:58px/);
 assert.match(css,/@keyframes atgv-orb-multiaxis-idle/);
 assert.match(css,/@keyframes atgv-orb-multiaxis-thinking/);
 assert.match(css,/rotateZ\(360deg\) rotateY\(0deg\) rotateX\(0deg\)/);
 assert.match(css,/animation:atgv-orb-multiaxis-thinking 3\.2s linear infinite/);
 assert.match(css,/animation:atgv-orb-success 1\.25s ease-out both/);
 assert.match(css,/data-state="complete"\] \.atgv-mywork-ai-visual\{display:none\}/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/background-image:radial-gradient/);
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

test('release retains a single source-only .memory and correct v0.0.7 metadata',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.0.7');
 assert.equal(pkg.atgvDisplayVersion,'0.0.7');
 assert.match(read('README.md'),/\*\*Version: 0\.0\.7\*\*/);
 assert.match(read('RELEASE.md'),/ATGV AIATECH Assist v0\.0\.7/);
 assert.match(read('.gitattributes'),/^\.memory export-ignore$/m);
});
