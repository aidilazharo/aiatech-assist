'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const refs=require('../src/ux-design-references');const pipeline=require('../src/ux-design-pipeline');
test('ten image references are allowed with safe limit and nine guided placeholders after first upload',()=>{
 assert.equal(refs.MAX_IMAGES,10);
 for(const label of ['Overview','Navigation','Dashboard','Forms','Tables','Mobile','Components','Colors','States','Accessibility'])assert.match(ui,new RegExp(label));
 assert.match(ui,/for\(let i=0;i<10;i\+\+\)/);
 assert.match(ui,/if\(!images.length\)\{info.textContent='';preview.classList.add\('hidden'\)/);
 assert.match(css,/ux-design-reference-preview\{display:grid;grid-template-columns:repeat\(10/);
 assert.match(host,/maximum of ten design reference images/i);
 assert.doesNotMatch(ui,/No design reference uploaded\./);
});
test('ticket scoped design framework selection is persisted and affects generation prompts',()=>{
 assert.match(host,/id="uxDesignFramework"/);
 assert.match(host,/sdlcCatalog\.designFrameworks\(getWorkspace\(\)\?\.uri\.fsPath\)/);
 assert.match(ui,/renderUxFrameworkOptions\(m\.frameworks,m\.value\)/);
 assert.match(host,/case 'uxFrameworkSave':/);assert.match(host,/workspaceState\.update\(uxFrameworkKey/);
 assert.match(host,/case 'uxFrameworkRead':/);
 assert.match(host,/availableFrameworks\.find\(item=>item\.id===designFramework\)/);
 assert.match(host,/!selectedFramework\|\|designFramework!==String\(msg\.framework\|\|''\)/);
 assert.match(host,/design-source-policy'\)\.requireReference/);
 assert.match(host,/uxDesignPipeline\.flowPrompt\(ticket,approved,guide,referenceNotes,repositoryGuide\)/);
 assert.match(host,/designFramework,sourceStoryKey,repositorySource:roleRepository\.identity\(repositoryReference\)\}/);
 assert.match(host,/Design framework changed since generation/);
 assert.match(ui,/send\('uxFrameworkSave'/);
});
test('Stop button aborts the in-flight generation and disables cancel during commit',()=>{
 assert.match(ui,/Stop UI\/UX/);
 assert.match(css,/ux-stop-action\{background:#bd3030/);
 assert.match(ui,/send\('uxPipelineStop'/);
 assert.match(host,/case 'uxPipelineStop':/);
 assert.match(host,/new AbortController\(\)/);
 assert.match(host,/run\.controller\.abort\(\)/);
 assert.match(host,/signal:run\.controller\.signal/g);
 assert.match(host,/run\.phase='committing'/);
 assert.match(host,/canStop:false/);
 assert.match(host,/type:'uxPipelineStopped'/);
 assert.match(ui,/m\.type==='uxPipelineStopped'/);
});
test('disapproval reason appears directly below review buttons, not in a separate accordion',()=>{
 const page=host.slice(host.indexOf('<main id="uxPreviewView"'),host.indexOf('<main id="documentsView"'));
 assert.ok(page.indexOf('id="uxReviewActions"')>page.indexOf('id="uxRejectDesign"'));
 assert.ok(page.indexOf('id="uxReviewActions"')<page.indexOf('<section id="uxDesignPreviewPage"'));
 assert.doesNotMatch(page,/<summary>Disapproval feedback<\/summary>/);
 assert.match(page,/Reason for disapproval \(required\)/);
 assert.match(ui,/\$\('uxRejectReason'\)\.focus\(\)/);
 assert.match(host,/if\(!\['approved','rejected'\]\.includes\(decision\)\)/);
});
test('UI/UX pipeline retains the framework metadata alongside revision',async()=>{
 const meta={designer:'Designer',designFramework:'bootstrap-5.3'};
 const sample={summary:'Loan app',screens:[{name:'Request',purpose:'Submit',components:['Form'],interactions:['Submit']}],questions:[],assumptions:[]};
 const flow={nodes:[{id:'start',label:'Start',kind:'start'}],edges:[]};
 const os=require('node:os');const fsp=require('node:fs/promises');const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv235-'));
 try{const created=await pipeline.generate(temp,'TC-392',{flow,wireframe:sample,mockup:sample},'',meta);assert.equal(created.designFramework,'bootstrap-5.3');}
 finally{await fsp.rm(temp,{recursive:true,force:true});}
});
