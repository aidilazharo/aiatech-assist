'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {JiraConfluenceCoordination,encodeState,decodeState,pageTitle}=require('../src/atlassian-coordination');
const {transitionOwnership}=require('../src/ownership');
const script=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
function fixture({colonAccounts=false}={}){
 const state={page:null,requests:[],reads:0};
 const previous=global.fetch;
 const send=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
 global.fetch=async(url,opts)=>{
  const u=new URL(url);const method=opts.method||'GET';const auth=String(opts.headers.Authorization||'');
  const email=auth.startsWith('Basic ')?Buffer.from(auth.slice(6),'base64').toString('utf8').split(':')[0]:'';
  state.requests.push({pathname:u.pathname,method,email});
  if(u.pathname==='/rest/api/3/myself')return send({accountId:(colonAccounts?'712020:':'')+(email==='alice@company.test'?'alice-atlassian':email==='bob@company.test'?'bob-atlassian':'other-atlassian'),displayName:email});
  if(u.pathname==='/wiki/api/v2/spaces/123')return send({id:'123',key:'TCR'});
  if(u.pathname==='/wiki/rest/api/content')return send({results:state.page?[{id:'99',title:state.page.title,type:'page'}]:[]});
  if(u.pathname==='/wiki/api/v2/spaces/123/pages')return send({results:state.page?[{id:'99',title:state.page.title,type:'page'}]:[]});
  if(u.pathname==='/wiki/api/v2/pages/99'&&method==='GET'){
    state.reads++;
    return state.page?send(state.page):send({message:'Missing'},404);
  }
  if(u.pathname==='/wiki/api/v2/pages'&&method==='POST'){
    if(state.page)return send({message:'Page already exists'},409);
    const data=JSON.parse(opts.body);state.page={id:'99',spaceId:'123',title:data.title,body:{storage:{value:data.body.value}},version:{number:1}};
    return send(state.page);
  }
  if(u.pathname==='/wiki/api/v2/pages/99'&&method==='PUT'){
    const data=JSON.parse(opts.body);
    if(!state.page||data.version.number!==state.page.version.number+1)return send({message:'Concurrent update'},409);
    state.page={...state.page,version:{number:data.version.number},body:{storage:{value:data.body.value}}};
    return send(state.page);
  }
  throw Error('Unexpected endpoint: '+method+' '+u.pathname);
 };
 function user(email){return new JiraConfluenceCoordination({project:'tech-cockpit',config:{get:key=>({'jira.baseUrl':'https://company.test','jira.email':email,'confluence.spaceKey':'TCR','confluence.spaceId':'123','confluence.baseUrl':'https://company.test/wiki'})[key]||''},token:'individual-token'});}
 return {state,user,close:()=>{global.fetch=previous;}};
}
test('Jira + Confluence is the default selectable provider, with optional service and local mode',()=>{
 assert.match(source,/get\('atgvAssist.coordinationProvider','jira-confluence'\)/);
 assert.match(source,/new JiraConfluenceCoordination/);
 assert.match(source,/case 'setCoordinationProvider'/);
 for(const provider of ['jira-confluence','service','local'])assert.match(source,new RegExp('value="'+provider+'"'));
 assert.match(script,/send\('setCoordinationProvider'/);
});
test('Jira identity and Confluence versioned registry share claims and approved transfers across users',async t=>{
 const x=fixture();t.after(x.close);
 const alice=x.user('alice@company.test'),bob=x.user('bob@company.test');
 assert.equal((await alice.list()).documents.length,0,'List never creates a page');
 assert.equal(x.state.page,null);
 const first=await alice.act({document:'business-analyst--requirements',action:'claim',expectedRevision:0});
 assert.equal(first.document.ownerId,'alice-atlassian');
 assert.equal(x.state.page.title,pageTitle('tech-cockpit'));
 assert.equal((await bob.list()).documents[0].ownerId,'alice-atlassian');
 await assert.rejects(bob.act({document:'business-analyst--requirements',action:'claim',expectedRevision:1}),/already owned/);
 let next=await bob.act({document:'business-analyst--requirements',action:'request-transfer',expectedRevision:1});
 assert.equal(next.document.pending.to,'bob-atlassian');
 await assert.rejects(bob.act({document:'business-analyst--requirements',action:'approve-transfer',expectedRevision:2}),/Only the current/);
 await assert.rejects(alice.act({document:'business-analyst--requirements',action:'approve-transfer',expectedRevision:1}),/revision conflict/);
 next=await alice.act({document:'business-analyst--requirements',action:'approve-transfer',expectedRevision:2});
 assert.equal(next.document.ownerId,'bob-atlassian');
 assert.equal(next.document.pending,null);
 assert.equal((await bob.list()).documents[0].revision,3);
 assert.equal(x.state.page.version.number,3);
 assert.ok(x.state.requests.some(r=>r.pathname==='/rest/api/3/myself'));
});
test('Confluence version conflicts are never overwritten, impersonation is not accepted',async t=>{
 const x=fixture();t.after(x.close);
 const alice=x.user('alice@company.test');
 await alice.act({document:'doc',action:'claim',expectedRevision:0});
 const original=global.fetch;
 global.fetch=async(u,opts)=>{if(new URL(u).pathname==='/wiki/api/v2/pages/99'&&opts.method==='PUT')return new Response('{"message":"conflict"}',{status:409});return original(u,opts);};
 await assert.rejects(alice.act({document:'other',action:'claim',expectedRevision:0}),/Refresh ownership.*version conflict/);
 assert.equal(Object.keys(decodeState(x.state.page.body.storage.value)).length,1);
 global.fetch=original;
 const bob=x.user('bob@company.test');
 await bob.act({document:'doc',action:'request-transfer',expectedRevision:1});
 await assert.rejects(bob.act({document:'doc',action:'reject-transfer',expectedRevision:2}),/Only the current/);
});
test('Confluence registry refuses foreign or malformed page data',async t=>{
 const x=fixture();t.after(x.close);
 x.state.page={id:'99',title:pageTitle('tech-cockpit'),spaceId:'123',version:{number:1},body:{storage:{value:'<p>This page was not created by ATGV</p>'}}};
 await assert.rejects(x.user('alice@company.test').list(),/does not contain an ATGV registry/);
 assert.throws(()=>decodeState('<p>ATGV_OWNERSHIP_V1:bad</p>'),/Invalid ATGV coordination registry encoding/);
 assert.throws(()=>encodeState({many:'x'.repeat(800000)}),/too large/);
});
test('Local and Confluence provider use the same revision and owner-only approval rules',()=>{
 const alice=transitionOwnership(null,{actor:'alice',action:'claim',expectedRevision:0});
 const requested=transitionOwnership(alice,{actor:'bob',action:'request-transfer',expectedRevision:1});
 assert.throws(()=>transitionOwnership(requested,{actor:'bob',action:'approve-transfer',expectedRevision:2}),/Only the current/);
 assert.equal(transitionOwnership(requested,{actor:'alice',action:'reject-transfer',expectedRevision:2}).ownerId,'alice');
});

test('Atlassian-issued colon account IDs work through real client flow and Confluence registry',async t=>{
 const x=fixture({colonAccounts:true});t.after(x.close);
 const alice=x.user('alice@company.test'),bob=x.user('bob@company.test');
 const claimed=await alice.act({document:'business-analyst--requirements',action:'claim',expectedRevision:0});
 assert.equal(claimed.document.ownerId,'712020:alice-atlassian');
 assert.equal((await bob.list()).documents[0].ownerId,'712020:alice-atlassian');
 await bob.act({document:'business-analyst--requirements',action:'request-transfer',expectedRevision:1});
 await assert.rejects(bob.act({document:'business-analyst--requirements',action:'approve-transfer',expectedRevision:2}),/Only the current/);
 const approved=await alice.act({document:'business-analyst--requirements',action:'approve-transfer',expectedRevision:2});
 assert.equal(approved.document.ownerId,'712020:bob-atlassian');
});
