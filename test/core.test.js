const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const fs=require('node:fs/promises');
const path=require('node:path');
const {textFromAdf,htmlToText,markdownToStorage,validateUrl}=require('../src/utils');
const {KnowledgeStore,splitChunks,searchChunks,makeChunks}=require('../src/knowledge');
const {parseVersion}=require('../scripts/set-version');
const {listJira,listConfluence,listGithub,discoverJiraProjects,discoverConfluenceSpaces,testJiraConnection,testGithubConnection}=require('../src/clients');
function config(obj){return {get(k){return obj[k]??'';}};}
function ok(o){return {ok:true,status:200,json:async()=>o};}

test('version display and semver are both correct and capped at 99',()=>{
 assert.deepEqual(parseVersion('0.00.00'),{semver:'0.0.0',display:'0.0.00'});
 assert.deepEqual(parseVersion('1.09.99'),{semver:'1.9.99',display:'1.9.99'});
 assert.deepEqual(parseVersion('0.1.00'),{semver:'0.1.0',display:'0.1.00'});
 assert.throws(()=>parseVersion('100.00.00'));
 assert.throws(()=>parseVersion('0.0.100'));
 assert.throws(()=>parseVersion('1.2.3-beta'));
});
test('safe XML-ish markdown serialization and document text conversion',()=>{
 const converted=markdownToStorage('# Intro\n\n- A&B\n- <script>\n\n```\na < b\n```');
 assert.match(converted,/<h1>Intro<\/h1>/);
 assert.match(converted,/<li>A&amp;B<\/li>/);
 assert.doesNotMatch(converted,/<script>/);
 assert.equal(htmlToText('<h1>Hello</h1><p>A&amp;B</p><script>bad()</script>').includes('bad'),false);
 assert.match(textFromAdf({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'hello'}]}]}),/hello/);
});
test('URLs require TLS except loopback model endpoint',()=>{
 assert.equal(validateUrl('https://my.atlassian.net/'),'https://my.atlassian.net');
 assert.throws(()=>validateUrl('http://example.com'));
 assert.throws(()=>validateUrl('https://a.com?token=abc'));
 assert.equal(validateUrl('http://localhost:11434',{local:true}),'http://localhost:11434');
});
test('BM25 rank and chunk boundaries',()=>{
 const docs=[{id:'a',title:'Deploy playbook',provider:'Workspace',text:'Deployment pipeline staging production approval.'},{id:'b',title:'HR',provider:'Workspace',text:'Annual holidays lunch.'}];
 assert.equal(searchChunks(makeChunks(docs),'deploy pipeline')[0].docId,'a');
 assert.equal(searchChunks(makeChunks(docs),'needle-not-found').length,0);
 assert.ok(splitChunks('x'.repeat(2500),1000,150).length>=3);
});
test('Confluence mirrors preserve offline edits and index replacements are provider scoped',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-test-'));
 try{
 const store=new KnowledgeStore(dir);await store.load();
 const doc={id:'confluence:test:123',provider:'Confluence',remoteId:'123',spaceId:'8',title:'Hello',version:3,rawHtml:'<p>body</p>',text:'body'};
 const m=await store.mirrorConfluence(doc);await store.saveMirrors();
 assert.equal(m.locallyEdited,false);
 await fs.appendFile(m.file,'\nlocal edit');
 const r=await store.mirrorConfluence({...doc,version:4,rawHtml:'<p>remote edit</p>'});
 assert.equal(r.locallyEdited,true);
 assert.match(await fs.readFile(m.file,'utf8'),/local edit/);
 await store.replace('Confluence',[doc]);await store.replace('Jira',[{id:'jira:a',provider:'Jira',title:'J',text:'J'}]);
 assert.equal(store.docs.length,2);
 await store.replace('Confluence',[]);assert.equal(store.docs.length,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Confluence space and page sync supports v2 API',async()=>{
 const prior=global.fetch;const visits=[];
 global.fetch=async(url)=>{
 visits.push(url);
 if(url.includes('/spaces?'))return ok({results:[{id:'42',key:'DOC'}]});
 if(url.includes('/spaces/42/pages?'))return ok({results:[{id:'100',title:'API'}],_links:{}});
 if(url.includes('/pages/100?'))return ok({id:'100',title:'API',version:{number:5},body:{storage:{value:'<p>A&amp;B</p>'}}});
 throw Error(url);
 };
 try{const c=config({'jira.baseUrl':'https://acme.atlassian.net','jira.email':'a@b.com','confluence.spaceKey':'DOC'});
 const docs=await listConfluence(c,'test_token',10);
 assert.equal(docs[0].text,'A&B');assert.equal(docs[0].version,5);assert.equal(visits.length,3);
 }finally{global.fetch=prior;}
});
test('Jira JQL enhanced POST search paginates using nextPageToken',async()=>{
 const prior=global.fetch;let calls=0;
 global.fetch=async(url,opts)=>{calls++;assert.match(url,/search\/jql$/);assert.equal(opts.method,'POST');
 const sent=JSON.parse(opts.body);if(calls===2)assert.equal(sent.nextPageToken,'more');
 return ok(calls===1?{issues:[{key:'IT-1',fields:{summary:'Test',description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'A bug'}]}]}}}],nextPageToken:'more',isLast:false}:{issues:[{key:'IT-2',fields:{summary:'Done'}}],isLast:true});};
 try{const docs=await listJira(config({'jira.baseUrl':'https://acme.atlassian.net','jira.email':'a@b.com','jira.jql':'project = IT'}),'token',10);
 assert.equal(docs.length,2);assert.match(docs[0].text,/A bug/);}
 finally{global.fetch=prior;}
});
test('GitHub docs fetches only markdown content in pathPrefix',async()=>{
 const prior=global.fetch;
 global.fetch=async(url)=>{
 if(url.endsWith('/repos/o/r'))return ok({default_branch:'main'});
 if(url.includes('/git/trees/'))return ok({tree:[{path:'docs/guide.md',type:'blob',size:10,sha:'sha123'},{path:'src/test.js',type:'blob',size:10,sha:'sha456'}]});
 if(url.includes('/git/blobs/'))return ok({encoding:'base64',content:Buffer.from('Guide content').toString('base64')});
 throw Error(url);
 };
 try{const result=await listGithub(config({'github.owner':'o','github.repo':'r','github.branch':'','github.pathPrefix':'docs','github.apiUrl':'https://api.github.com'}),'token',10,1000);
 assert.equal(result.docs.length,1);assert.equal(result.docs[0].text,'Guide content');}
 finally{global.fetch=prior;}
});

test('Confluence exact key TCR is found without an API-side type filter',async()=>{
 const previous=global.fetch,urls=[];
 global.fetch=async(url,opts)=>{urls.push(url);assert.equal(opts.method,'GET');
  const u=new URL(url);assert.equal(u.pathname,'/wiki/api/v2/spaces');
  assert.equal(u.searchParams.get('keys'),'TCR');assert.equal(u.searchParams.has('type'),false);
  return ok({results:[{id:'1',key:'~me',name:'Personal',type:'personal'},
    {id:'22',key:'TCR',name:'TECH COCKPIT',type:'global'}]});
 };
 try{const result=await discoverConfluenceSpaces(config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'a@b.com'}),'token','tcr');
  assert.deepEqual(result.map(x=>x.key),['TCR']);assert.equal(urls.length,1);
 }finally{global.fetch=previous;}
});
test('Confluence name TECH COCKPIT uses unfiltered v2 pages, never CQL',async()=>{
 const previous=global.fetch,urls=[];
 global.fetch=async url=>{
  urls.push(url);assert.equal(new URL(url).pathname,'/wiki/api/v2/spaces');
  assert.equal(new URL(url).searchParams.has('type'),false);
  assert.equal(new URL(url).searchParams.has('cql'),false);
  const cursor=new URL(url).searchParams.get('cursor');
  return cursor?ok({results:[{id:'33',key:'TCR',name:'TECH COCKPIT',type:'global'}]}):
    ok({results:[{id:'1',key:'~user',name:'TECH COCKPIT Personal',type:'personal'},
      {id:'2',key:'DEV',name:'Developer Team',type:'global'}],_links:{next:'/wiki/api/v2/spaces?limit=100&cursor=next'}});
 };
 try{const result=await discoverConfluenceSpaces(config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'a@b.com'}),'token',' TECH COCKPIT ');
  assert.deepEqual(result.map(x=>x.key),['TCR']);assert.equal(urls.length,2);
 }finally{global.fetch=previous;}
});
test('Confluence name fallback scans after 2000 spaces without excluding valid unspecified-type spaces',async()=>{
 const previous=global.fetch;let pages=0;
 global.fetch=async url=>{
  assert.equal(new URL(url).searchParams.has('type'),false);
  const n=Number(new URL(url).searchParams.get('cursor')||0);pages++;
  const results=Array.from({length:100},(_,i)=>({id:String(n*100+i+1),key:'S'+(n*100+i+1),name:'Other Project'}));
  if(n===25)results.push({id:'90001',key:'TCR',name:'TECH COCKPIT'});
  return ok({results,_links:{next:n<25?'/wiki/api/v2/spaces?limit=100&cursor='+(n+1):undefined}});
 };
 try{const result=await discoverConfluenceSpaces(config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'a@b.com'}),'token','TECH COCKPIT');
  assert.deepEqual(result.map(x=>x.key),['TCR']);assert.equal(pages,26);
 }finally{global.fetch=previous;}
});
test('Confluence returns no more than 10 relevant unique non-personal spaces',async()=>{
 const previous=global.fetch;
 global.fetch=async()=>ok({results:[...Array.from({length:20},(_,i)=>({id:String(i+1),key:'TC'+i,name:'Tech Cockpit '+i,type:'global'})),
  {id:'1',key:'TC0',name:'Tech Cockpit 0',type:'global'},
  {id:'99',key:'~self',name:'Tech Cockpit Personal',type:'personal'}]});
 try{const result=await discoverConfluenceSpaces(config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'a@b.com'}),'token','TECH COCKPIT',40);
  assert.equal(result.length,10);assert.equal(new Set(result.map(v=>v.id)).size,10);
  assert.ok(result.every(v=>!v.key.startsWith('~')));
 }finally{global.fetch=previous;}
});
test('Confluence exact-key lookup 400 falls back to unfiltered directory',async()=>{
 const previous=global.fetch,urls=[];
 global.fetch=async url=>{
  urls.push(url);
  if(new URL(url).searchParams.has('keys'))return {ok:false,status:400,text:async()=>'Unsupported key parameter'};
  return ok({results:[{id:'11',key:'TCR',name:'TECH COCKPIT',type:'global'}]});
 };
 try{const result=await discoverConfluenceSpaces(config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'a@b.com'}),'token','TCR');
  assert.deepEqual(result.map(x=>x.key),['TCR']);assert.equal(urls.length,2);
 }finally{global.fetch=previous;}
});
test('Confluence errors do not appear as empty results (authentication, access, rate limit)',async()=>{
 const previous=global.fetch;
 try{
  for(const code of [401,403,429]){
   global.fetch=async()=>({ok:false,status:code,text:async()=>'{"message":"Request failed"}'});
   await assert.rejects(discoverConfluenceSpaces(config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'a@b.com'}),'token','TCR'),new RegExp('HTTP '+code));
  }
 }finally{global.fetch=previous;}
});
test('Confluence diagnostics expose only counts, phase and HTTP status',async()=>{
 const previous=global.fetch,events=[];
 global.fetch=async url=>new URL(url).searchParams.has('keys')?
  ok({results:[]}):ok({results:[{id:'25',key:'TCR',name:'TECH COCKPIT',type:'global'}]});
 try{const result=await discoverConfluenceSpaces(config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'private@example.com'}),'super-secret-token','TCR',10,{onDiagnostic:e=>events.push(e)});
  assert.deepEqual(result.map(x=>x.key),['TCR']);assert.ok(events.some(e=>e.phase==='completed'));
  const log=JSON.stringify(events);
  assert.doesNotMatch(log,/TCR|TECH COCKPIT|private@example.com|super-secret-token/);
  assert.equal(events.at(-1).matches,1);
 }finally{global.fetch=previous;}
});
test('Confluence pagination blocks off-site and unexpected paths and rejects invalid searches',async()=>{
 const previous=global.fetch;
 try{for(const link of ['https://attacker.test/wiki/api/v2/spaces','/wiki/api/v2/pages']){
  global.fetch=async()=>ok({results:[],_links:{next:link}});
  await assert.rejects(discoverConfluenceSpaces(config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'a@b.com'}),'token','TECH COCKPIT'),/Untrusted Confluence pagination URL/);
 }
 await assert.rejects(discoverConfluenceSpaces(config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'a@b.com'}),'token',' '),/at least 2 characters/);
 }finally{global.fetch=previous;}
});
test('Confluence page cursor repetition is reported rather than silently returning no results',async()=>{
 const previous=global.fetch;
 global.fetch=async()=>ok({results:[],_links:{next:'/wiki/api/v2/spaces?limit=100'}});
 try{await assert.rejects(discoverConfluenceSpaces(config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'a@b.com'}),'token','TECH COCKPIT'),/Repeated Confluence pagination cursor/);
 }finally{global.fetch=previous;}
});

test('Jira connection test uses read-only myself endpoint with Basic auth and rejects unauthorized requests',async()=>{
  const original=global.fetch;let calls=0;
  global.fetch=async(url,options)=>{
    calls++;assert.equal(url,'https://example.atlassian.net/rest/api/3/myself');
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Basic '+Buffer.from('person@example.com:secret').toString('base64'));
    return calls===1?ok({accountId:'account-1',displayName:'Account Name'}):{ok:false,status:401,text:async()=>'{"message":"Unauthorized"}'};
  };
  try{
    const c=config({'jira.baseUrl':'https://example.atlassian.net','jira.email':'person@example.com'});
    assert.equal((await testJiraConnection(c,'secret')).displayName,'Account Name');
    await assert.rejects(()=>testJiraConnection(c,'secret'),/HTTP 401/);
    assert.equal(calls,2);
  }finally{global.fetch=original;}
});

test('GitHub connection test accepts public unauthenticated repositories and validates API owner/repo',async()=>{
  const original=global.fetch;
  const c=config({'github.owner':'n6ffp2r5m5-prog','github.repo':'app-test','github.apiUrl':'https://api.github.com'});
  global.fetch=async(url,options)=>{
    assert.equal(url,'https://api.github.com/repos/n6ffp2r5m5-prog/app-test');
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,undefined);
    return ok({full_name:'n6ffp2r5m5-prog/app-test',private:false,default_branch:'main'});
  };
  try{
    assert.deepEqual(await testGithubConnection(c,undefined),{fullName:'n6ffp2r5m5-prog/app-test',private:false,defaultBranch:'main'});
    global.fetch=async()=>ok({full_name:'other-org/different-repo'});
    await assert.rejects(()=>testGithubConnection(c,undefined),/does not match/);
  }finally{global.fetch=original;}
});
