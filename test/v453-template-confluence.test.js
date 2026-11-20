'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const knowledge=require('../src/jira-template-knowledge');
const projectId='test-project',projectKey='TC';
const config={get:key=>({'jira.email':'tester@example.invalid'})[key]||''};
function mock(remote){let page=remote||null,created=0;const clients={getConfluenceSpace:async()=>({id:'12'}),baseConfluence:()=> 'https://example.atlassian.net/wiki',
 requestJson:async()=>({results:page?[{id:'34',status:'current',title:page.title}]:[]}),getConfluencePage:async()=>({...page,id:'34',spaceId:'12'}),
 writeConfluence:async(_c,_t,data)=>{created++;page={title:data.title,body:{storage:{value:data.bodyHtml}}};return {id:'34'}}};return {clients,get page(){return page},get created(){return created}};}
const temp=()=>fs.mkdtemp(path.join(os.tmpdir(),'atgv-template-'));
test('approved local TRM template syncs to Confluence, then imports to another computer',async()=>{
 const a=await temp(),b=await temp();try{
  await knowledge.approve(a,'Business Analyst');const m=mock();
  const first=await knowledge.syncConfluence(a,{projectId,projectKey,config,token:'fake',clients:m.clients});
  assert.equal(first.status,'published');assert.equal(m.created,1);
  const second=await knowledge.syncConfluence(b,{projectId,projectKey,config,token:'fake',clients:m.clients});
  assert.equal(second.status,'imported');assert.equal((await knowledge.load(b)).status,'approved');
  const third=await knowledge.syncConfluence(b,{projectId,projectKey,config,token:'fake',clients:m.clients});assert.equal(third.status,'already-synced');
 }finally{await fs.rm(a,{recursive:true,force:true});await fs.rm(b,{recursive:true,force:true})}
});
test('Confluence sync rejects unapproved, foreign and conflicting records without writing',async()=>{
 const a=await temp(),b=await temp();try{
  const m=mock();await assert.rejects(knowledge.syncConfluence(a,{projectId,projectKey,config,token:'fake',clients:m.clients}),/No approved template/);
  assert.equal(m.created,0);
  await knowledge.approve(a,'BA');await knowledge.syncConfluence(a,{projectId,projectKey,config,token:'fake',clients:m.clients});
  const body=m.page.body.storage.value;
  assert.throws(()=>knowledge.parseRemoteBody(body,'different-project'),/another project/);
  await knowledge.approve(b,'BA');const local=await knowledge.load(b);local.items[0]='Different approved item';local.sourceHash=knowledge.hash({origin:local.origin,items:local.items});
  await fs.writeFile(path.join(b,'knowledge','jira-story-template.json'),JSON.stringify(local));
  await assert.rejects(knowledge.syncConfluence(b,{projectId,projectKey,config,token:'fake',clients:m.clients}),/differs/);assert.equal(m.created,1);
 }finally{await fs.rm(a,{recursive:true,force:true});await fs.rm(b,{recursive:true,force:true})}
});
