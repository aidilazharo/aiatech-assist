'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {OwnershipRegistry}=require('../src/ownership');
const {WorkflowEngine}=require('../src/workflow-engine');
const {validBranch,adf}=require('../src/remote-actions');
const {DocumentSync,toMarkdown,supportedStorage}=require('../src/confluence-docsync');
const {createServer,hash}=require('../service/server');
const {endpoint}=require('../src/companion-client');
async function temp(){return fs.mkdtemp(path.join(os.tmpdir(),'atgv-new-'));}
test('ownership claim and transfer require current owner approval and exact revision',async t=>{
 const root=await temp();t.after(()=>fs.rm(root,{recursive:true,force:true}));const db=new OwnershipRegistry(path.join(root,'registry.json'));
 const claimed=await db.act({project:'proj',document:'business-requirement',actor:'alice',action:'claim',expectedRevision:0});assert.equal(claimed.ownerId,'alice');
 await assert.rejects(()=>db.act({project:'proj',document:'business-requirement',actor:'bob',action:'claim',expectedRevision:1}),/already owned/);
 const requested=await db.act({project:'proj',document:'business-requirement',actor:'bob',action:'request-transfer',expectedRevision:1});assert.equal(requested.ownerId,'alice');
 await assert.rejects(()=>db.act({project:'proj',document:'business-requirement',actor:'bob',action:'approve-transfer',expectedRevision:2}),/Only the current/);
 await assert.rejects(()=>db.act({project:'proj',document:'business-requirement',actor:'alice',action:'approve-transfer',expectedRevision:1}),/revision conflict/);
 const approved=await db.act({project:'proj',document:'business-requirement',actor:'alice',action:'approve-transfer',expectedRevision:2});assert.equal(approved.ownerId,'bob');assert.equal(approved.pending,null);
});
test('concurrent claims serialize into one owner',async t=>{
 const root=await temp();t.after(()=>fs.rm(root,{recursive:true,force:true}));const db=new OwnershipRegistry(path.join(root,'db.json'));
 const x=await Promise.allSettled(['alice','bob'].map(actor=>db.act({project:'p',document:'a',actor,action:'claim',expectedRevision:0})));
 assert.equal(x.filter(v=>v.status==='fulfilled').length,1);assert.equal(x.filter(v=>v.status==='rejected').length,1);
});
test('workflow never overwrites documents and saves AI proposal separate',async t=>{
 const root=await temp();t.after(()=>fs.rm(root,{recursive:true,force:true}));const engine=new WorkflowEngine({root,generate:async({task})=>'# '+task.title+'\nDRAFT\n'});
 const answers={problem:'Task',scope:'API',targetProcess:'Create API',dependencies:'Database',constraints:'Security',acceptance:'Login works',businessRules:'No blank'};
 const result=await engine.prepare('proj',answers,{allowModel:true});assert.equal(result.filter(x=>x.status==='draft').length,3);
 await fs.mkdir(path.join(root,'proj','documents','architecture'),{recursive:true});await fs.writeFile(path.join(root,'proj','documents','architecture','architecture-proposal.md'),'HUMAN');
 await engine.prepare('proj',{...answers,scope:'API v2'},{allowModel:true});assert.equal(await fs.readFile(path.join(root,'proj','documents','architecture','architecture-proposal.md'),'utf8'),'HUMAN');
 assert.equal((await engine.inspect('proj',answers)).tasks.find(t=>t.id==='planning').status,'ready');
});
test('unsupported Confluence content rejects automatic lossy conversions',()=>{
 assert.equal(supportedStorage('<ac:structured-macro ac:name="jira"/>'),false);
 assert.equal(supportedStorage('<table><tr><td>X</td></tr></table>'),false);
 assert.equal(toMarkdown('<h1>Heading</h1><p>Paragraph</p>').trim(),'# Heading\n\nParagraph');
 assert.equal(typeof DocumentSync,'function');
});
test('Jira/GitHub inputs are validated',()=>{
 assert.equal(validBranch('feature/CSDLC-125-auth'),'feature/CSDLC-125-auth');assert.throws(()=>validBranch('feature/../main'));
 assert.equal(adf('test').content[0].content[0].text,'test');
 assert.throws(()=>endpoint('https://example.com','../../system','ownership'));
});
test('companion service denies unauthenticated ownership and uses server identity',async t=>{
 const root=await temp();t.after(()=>fs.rm(root,{recursive:true,force:true}));const alice='alice-test-token-that-is-over-20';
 const app=createServer({root,users:{[hash(alice)]:{id:'alice',projects:['proj']}}});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>app.close());const url=`http://127.0.0.1:${app.address().port}`;
 const unauth=await fetch(url+'/v1/projects/proj/ownership');assert.equal(unauth.status,401);
 const req=await fetch(url+'/v1/projects/proj/ownership/doc',{method:'POST',headers:{Authorization:`Bearer ${alice}`,'Content-Type':'application/json'},body:JSON.stringify({action:'claim',expectedRevision:0})});
 assert.equal(req.status,200);assert.equal((await req.json()).document.ownerId,'alice');
 const ai=await fetch(url+'/v1/projects/proj/automation',{method:'POST',headers:{Authorization:`Bearer ${alice}`,'Content-Type':'application/json'},body:JSON.stringify({answers:{problem:'x'}})});assert.equal(ai.status,403);
});
test('background service processes saved discovery while VS Code is not running',async t=>{
 const root=await temp();t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const shared=path.join(root,'projects'),file=path.join(shared,'proj','documents','requirements','discovery-12.json');
 await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify({answers:{problem:'Claims upload',scope:'Claims',targetProcess:'Upload flow',dependencies:'Database',constraints:'TLS',acceptance:'Uploaded',businessRules:'No empty files'}}));
 const app=createServer({root,sharedProjectsRoot:shared,autoProjects:['proj'],model:async({task})=>'Draft for '+task.id});
 t.after(()=>app.close());
                                                                                    
 let files=[];for(let i=0;i<20;i++){files=await fs.readdir(path.join(shared,'proj','sdlc','ai-proposals')).catch(()=>[]);if(files.length===3)break;await new Promise(r=>setTimeout(r,25));}
 assert.equal(files.length,3);
                                                                            
 const stateFile=path.join(shared,'proj','sdlc','automation.json');
 for(let i=0;i<20;i++){const ok=await fs.readFile(stateFile,'utf8').then(Boolean).catch(()=>false);if(ok)break;await new Promise(r=>setTimeout(r,25));}
 const before=files.slice();const current=JSON.parse(await fs.readFile(file));current.answers.scope='Claims 2';await fs.writeFile(file,JSON.stringify(current));
 const engine=new WorkflowEngine({root:shared,generate:async({task})=>'Updated draft '+task.id});
 const updated=await engine.prepare('proj',current.answers,{allowModel:true});
 assert.equal(updated.filter(x=>x.status==='draft').length,2,'Only planning and architecture require regeneration after scope change.');
});
test('AI workflow refuses symlinked proposal directories',async t=>{
 const root=await temp();t.after(()=>fs.rm(root,{recursive:true,force:true}));const outside=await temp();t.after(()=>fs.rm(outside,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'proj','sdlc'),{recursive:true});await fs.symlink(outside,path.join(root,'proj','sdlc','ai-proposals'));
 const engine=new WorkflowEngine({root,generate:async()=> '# AI proposal'});
 await assert.rejects(()=>engine.prepare('proj',{problem:'Claims',scope:'Uploads'},{allowModel:true}),/Symlinked/);
 assert.deepEqual(await fs.readdir(outside),[]);
});
