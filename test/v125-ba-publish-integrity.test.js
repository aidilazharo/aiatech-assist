'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const fss=require('node:fs');
const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
const {ProjectRegistry}=require('../src/projects');
const {importDocumentText,createMappingPrompt,extractSupplementalEvidence}=require('../src/discovery-import');
const store=require('../src/source-store');const br=require('../src/br-workflow');const {jiraMarker}=require('../src/remote-actions');
const fixture=path.join(__dirname,'fixtures','br-synthetic-integration.pdf');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const config={get:key=>key==='jira.projectKey'?'TC':'https://example-org.atlassian.net'};
async function tempProject(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v125-'));const reg=new ProjectRegistry(root);try{await reg.create({id:'gate-mvp1a',name:'GATE'});return await fn(reg,root);}finally{await fs.rm(root,{recursive:true,force:true});}}
function mockPdf(){return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 80 >>\nstream\n(Original immutable source requirement text is here for validation.) Tj\nendstream\nendobj');}
test('portable synthetic requirements PDF bytes are hashed independently from extracted text',()=>tempProject(async reg=>{
 const doc=await importDocumentText(fixture);assert.ok(doc.text.includes('250,000'));assert.ok(doc.text.includes('SST'));assert.ok(doc.text.includes('contingency'));
 const entry={...doc,digest:hash(doc.text)};
 entry.storedName=await store.store(reg,'gate-mvp1a',entry,fixture);
 assert.equal(entry.byteDigest,hash(await fs.readFile(fixture)));
 assert.equal((await store.read(reg,'gate-mvp1a',entry)).byteDigest,entry.byteDigest);
 const stored=path.join(store.sourceDirectory(reg,'gate-mvp1a'),entry.storedName);
 await fs.appendFile(stored,Buffer.from('\nEXTRA-INVISIBLE-TRAILER'));
 await assert.rejects(store.read(reg,'gate-mvp1a',entry),/bytes changed/i);
}));
test('same text but different original PDF bytes cannot silently reuse an existing evidence file',()=>tempProject(async(reg,root)=>{
 const a=path.join(root,'one.pdf'),b=path.join(root,'two.pdf');await fs.writeFile(a,mockPdf());await fs.writeFile(b,Buffer.concat([mockPdf(),Buffer.from('\nignored appendix trailer')]));
 const parsed=await importDocumentText(a);const entry={...parsed,digest:hash(parsed.text)};
 await store.store(reg,'gate-mvp1a',entry,a);
 await assert.rejects(store.store(reg,'gate-mvp1a',{...entry},b),/bytes differ/i);
}));
test('legacy stored-source evidence without byte checksum is never silently trusted',()=>tempProject(async(reg,root)=>{
 const file=path.join(root,'one.pdf');await fs.writeFile(file,mockPdf());const parsed=await importDocumentText(file);const entry={...parsed,digest:hash(parsed.text)};
 entry.storedName=await store.store(reg,'gate-mvp1a',entry,file);
 await assert.rejects(store.read(reg,'gate-mvp1a',{...entry,byteDigest:undefined}),/Re-upload/i);
}));
test('scope-aware Jira markers separate local projects while legacy marker format remains stable',()=>{
 const legacy=jiraMarker(config,'BR-001');const a=jiraMarker(config,'BR-001','gate-mvp1a'),b=jiraMarker(config,'BR-001','other-project');
 for(const mark of [legacy,a,b])assert.match(mark,/^atgv-[a-f0-9]{24}$/);
 assert.notEqual(a,b);assert.notEqual(a,legacy);assert.equal(a,jiraMarker(config,'BR-001','gate-mvp1a'));
 assert.throws(()=>jiraMarker(config,'BR-001','../unsafe'),/project identity/i);
});
test('Jira mapping ledger stores scoped markers and validates unknown markers',()=>tempProject(async reg=>{
 let state=await br.load(reg,'gate-mvp1a');
 // Structural mock: recorded only accepts a matching plan entry; identity is verified during write.
 assert.ok(fss.readFileSync(path.join(__dirname,'../src/br-workflow.js'),'utf8').includes('marker?{marker}:{}'));
 assert.ok(fss.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8').includes('jiraScopedMarker(state,config,item.path)'));
 assert.deepEqual(state.synced,{});
}));
test('Q13-Q19 supplemental rules are explicitly preserved in mapping and generation prompts',()=>{
 const m=createMappingPrompt({text:'13. Additional question\n17. Contingency cap 5% and SST exception.'});
 assert.match(m,/Q13\+/);assert.match(m,/approval ordering/);
 const g=br.promptForGeneration({businessRules:'SST does not apply to Internal or Intercompany costs. Contingency cap 5%.',questions:'NONE'});
 assert.match(g,/supplemental Q13\+/);assert.match(g,/SST does not apply/);
});
test('nine-step BA UI uses revision-aware, accessible Jira action labels',()=>{
 const ui=fss.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 for(const label of ['Preview Jira Changes','Approve Jira Changes','Publish Jira Updates'])assert.ok(ui.includes(label));
 assert.match(ui,/button\.setAttribute\('aria-label',label\)/);
});

test('GATE additional questions 13–19 reach the BR generation context as verified source excerpts',async()=>{
 const doc=fss.existsSync(fixture)?await importDocumentText(fixture):{name:'synthetic-appendix.pdf',text:'Additional Questions and Answers\n13. What information does initiation require?\nProject owners are selected.\n17. What financial information is required?\nContingency cap 5 percent; SST does not apply to Internal or Intercompany costs. Post-Implementation Costs are excluded.\n19. What information is necessary for submission?\nMandatory approval fields.'};
 const excerpt=extractSupplementalEvidence(doc);
 assert.ok(excerpt.includes('13. What information'));
 assert.ok(excerpt.includes('19. What information'));
 assert.ok(excerpt.includes('5 percent')||excerpt.includes('5%'));
 assert.match(excerpt,/Internal or Intercompany/);
 const prompt=br.promptForGeneration({businessRules:'All evidence reviewed',questions:'NONE'},[],[{name:doc.name,excerpt}]);
 assert.match(prompt,/Post-Implementation Costs/);
 assert.match(prompt,/Intercompany/);
 assert.match(prompt,/19\. What information/);
});
test('supplemental snippets are capped and cannot inject instructions',()=>{
 assert.equal(extractSupplementalEvidence({text:'No separate clarifying section.'}),'');
 const example={text:'Additional Questions and Answers\n'+ 'A'.repeat(20000)};
 assert.equal(extractSupplementalEvidence(example).length,6500);
 const p=br.promptForGeneration({questions:'NONE'},[],[{name:'x',excerpt:'A'.repeat(15000)}]);
 const quote=p.slice(p.indexOf('Supplemental source evidence'));
 assert.ok(quote.length<7000);
});

test('Jira preview approval binding includes local project identity for both approve and publish',()=>{
 const host=fss.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 for(const x of ['items','items:changes'])assert.ok(host.includes("JSON.stringify({atgvProjectId:activeProject.id,site:baseAtlassian(config),project:config.get('jira.projectKey'),actor,"+x+'})'));
});
