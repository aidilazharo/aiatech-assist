'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {jiraCreateIssue,jiraUpdateIssue,githubBranch,githubPullRequest}=require('../src/remote-actions');
const {DocumentSync}=require('../src/confluence-docsync');
const settings={jira:{baseUrl:'https://tenant.atlassian.net',email:'user@company.test',projectKey:'CSDLC'},confluence:{spaceKey:'CSDLC',spaceId:'123'},github:{owner:'team',repo:'app',apiUrl:'https://api.github.com'}};
const cfg={get(key){const [s,k]=key.split('.');return settings[s]?.[k]||'';}};
const ok=data=>({ok:true,status:200,json:async()=>data});
const runMock=async(fn,handler)=>{const original=global.fetch;global.fetch=async(url,opts)=>handler(String(url),opts);try{return await fn();}finally{global.fetch=original;}};
test('Jira create writes fields as ADF, update targets exact issue',async()=>{
 const hits=[];await runMock(async()=>{
  const c=await jiraCreateIssue(cfg,'secret',{summary:'New API',description:'Need file uploads'});assert.equal(c.key,'CSDLC-125');
  await jiraUpdateIssue(cfg,'secret',{key:'CSDLC-125',summary:'Updated API'});
 },(url,opts)=>{hits.push({url,opts});if(url.includes('issuetypes'))return ok({issueTypes:[{name:'Task',id:'1002'}]});if(opts.method==='POST')return ok({key:'CSDLC-125'});return {ok:true,status:204,json:async()=>({})};});
 const post=hits.find(h=>h.opts.method==='POST');const fields=JSON.parse(post.opts.body).fields;
 assert.equal(fields.project.key,'CSDLC');assert.equal(fields.description.type,'doc');assert.equal(fields.issuetype.id,'1002');
 assert.ok(hits.some(h=>h.url.endsWith('/rest/api/3/issue/CSDLC-125')&&h.opts.method==='PUT'));
});
test('GitHub branch derives base SHA, PR remains draft',async()=>{
 const calls=[];await runMock(async()=>{
  const branch=await githubBranch(cfg,'secret',{branch:'feature/CSDLC-125-docs'});assert.equal(branch.sha,'deadbeef');
  const pr=await githubPullRequest(cfg,'secret',{branch:'feature/CSDLC-125-docs',title:'CSDLC-125 Docs'});assert.equal(pr.draft,true);
 },(url,opts)=>{
  calls.push({url,opts});if(url.endsWith('/repos/team/app'))return ok({default_branch:'main'});
  if(url.endsWith('/git/ref/heads/main'))return ok({object:{sha:'deadbeef'}});
  if(url.endsWith('/git/refs'))return ok({ref:'refs/heads/feature/CSDLC-125-docs'});
  if(url.endsWith('/pulls'))return ok({number:43,html_url:'https://github.com/team/app/pull/43',draft:true});
  throw Error('Unexpected '+url);
 });
 assert.equal(JSON.parse(calls.find(x=>x.url.endsWith('/git/refs')).opts.body).sha,'deadbeef');
 assert.equal(JSON.parse(calls.find(x=>x.url.endsWith('/pulls')).opts.body).draft,true);
});
test('Confluence sync creates a page once and blocks when both sides changed',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-conf-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const documents=path.join(root,'documents','requirements');await fs.mkdir(documents,{recursive:true});const file=path.join(documents,'business-requirement.md');
 await fs.writeFile(file,'# Requirement\n\nUsers need to upload their claims to a secure service that verifies entitlements.\n');
 let version=1;let body='<p>first</p>';let creates=0,updates=0;
 const sync=new DocumentSync({folder:root,config:cfg,token:'secret'});
 const doSync=()=>runMock(()=>sync.sync(),(url,opts)=>{
  if(url.includes('/api/v2/spaces/123'))return ok({key:'CSDLC',id:'123'});
  if(url.includes('/api/v2/pages?'))return ok({results:[]});
  if(url.includes('/api/v2/pages/456?'))return ok({id:'456',version:{number:version},body:{storage:{value:body}}});
  if(url.endsWith('/api/v2/pages')&&opts.method==='POST'){creates++;body=JSON.parse(opts.body).body.value;return ok({id:'456',version:{number:1}});}
  if(url.endsWith('/api/v2/pages/456')&&opts.method==='PUT'){updates++;body=JSON.parse(opts.body).body.value;version++;return ok({id:'456',version:{number:version}});}
  throw new Error('Unexpected Confluence URL: '+url);
 });
 const created=await doSync();assert.equal(created.created.length,1);const noChange=await doSync();assert.equal(noChange.created.length,0);assert.equal(creates,1);
 await fs.appendFile(file,'\nNew acceptance details.');version=2;body='<p>Remote also edited</p>';
 const conflict=await doSync();assert.equal(conflict.conflicts.length,1);assert.equal(updates,0);
 assert.match(await fs.readFile(file,'utf8'),/New acceptance details/);
});
