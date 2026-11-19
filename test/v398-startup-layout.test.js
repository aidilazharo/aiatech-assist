'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),css=read('media/start.css');

test('Copilot setup control remains available internally but is hidden on the startup grid',()=>{
 const start=html.indexOf('<div class="atgv-startup-stack-grid">'),end=html.indexOf('id="startupInstallFeedback"',start),grid=html.slice(start,end);
 assert.ok(start>=0&&end>start);assert.match(grid,/id="startupStackGrid"/);
 assert.match(grid,/id="startupCopilotCard"[^>]*class="atgv-startup-stack atgv-startup-stack-button atgv-stack-ring-card startup-copilot-card hidden"/);
 assert.match(grid,/aria-controls="startupCopilotModal"/);assert.match(grid,/id="startupCopilotBadge"/);
 assert.match(html,/id="startupCopilotModal"[^>]*aria-hidden="true"/);assert.match(html,/id="startupCopilotSetup"/);
 assert.doesNotMatch(html,/class="startup-copilot-setup"/);assert.match(css,/\.startup-stack-grid-items\{display:contents\}/);
 assert.match(ui,/\$\('startupCopilotCard'\)\.addEventListener\('click',openStartupCopilotModal\)/);
});
test('Copilot setup dialog opens and restores focus after closing',()=>{
 const from=ui.indexOf('function openStartupCopilotModal(){'),to=ui.indexOf('function renderStartupCopilotReadiness(',from);assert.ok(from>=0&&to>from);
 const prior={isConnected:true,focus(){document.activeElement=this;}},document={activeElement:prior};
 const classes=new Set(['hidden']);const modal={attributes:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},setAttribute(k,v){this.attributes[k]=v;}};
 const close={focus(){document.activeElement=this;}};const nodes={startupCopilotModal:modal,startupCopilotClose:close};
 const build=new Function('document','$',"let startupCopilotModalOpen=false,startupCopilotPriorFocus=null;"+ui.slice(from,to)+';return {open:openStartupCopilotModal,close:closeStartupCopilotModal};');
 const actions=build(document,id=>nodes[id]);actions.open();assert.equal(classes.has('hidden'),false);assert.equal(modal.attributes['aria-hidden'],'false');assert.equal(document.activeElement,close);
 actions.close();assert.equal(classes.has('hidden'),true);assert.equal(modal.attributes['aria-hidden'],'true');assert.equal(document.activeElement,prior);
});
test('unified error log is at the left of startup navigation and requested text is removed',()=>{
 const start=html.indexOf('<div class="atgv-startup-footer">'),end=html.indexOf('</section>',start),footer=html.slice(start,end);
 assert.ok(start>=0&&end>start);assert.ok(footer.indexOf('id="startupUnifiedLog"')<footer.indexOf('id="startupProceedInfo"'));
 assert.ok(footer.indexOf('id="startupProceedInfo"')<footer.indexOf('id="startupProceed"'));assert.match(ui,/\$\('startupUnifiedLog'\)\.classList\.toggle\('hidden',startupPage!==0\)/);
 assert.doesNotMatch(html,/Select a stack to open its required host tools and project modules/);
 assert.doesNotMatch(html,/Extension and SDLC Library checks run automatically, including at startup/);
 assert.doesNotMatch(html,/Installation is optional, validates GitHub's published SHA-256 checksum/);
 assert.match(css,/\.atgv-startup-footer #startupUnifiedLog,\.atgv-startup-footer #startupPrevious\{grid-column:1/);
});
