'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {filterOwnershipRows,ownerStatus}=require('../media/ownership-filters');
const {JiraConfluenceCoordination}=require('../src/atlassian-coordination');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const ext=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const rows=[
 {documentId:'ba-discovery',label:'Business Analyst — Discovery',role:'Business Analyst',ownerId:'alice',updatedAt:'2026-10-25T12:00:00Z'},
 {documentId:'ba-br-BR-001',label:'Business Requirement — Customer Login',role:'Business Analyst',ownerId:'bob',updatedAt:'2026-10-27T12:00:00Z',pending:{from:'bob',to:'alice',requestedAt:'2026-10-27T12:00:00Z'}},
 {documentId:'handoff-dev',label:'Handoff — Development',role:'Software Developer',ownerId:null,updatedAt:''},
 {documentId:'handoff-qa',label:'Handoff — QA',role:'QA Engineer',ownerId:'alice',pending:{from:'alice',to:'carol',requestedAt:'2026-10-26T12:00:00Z'},updatedAt:'2026-10-26T12:00:00Z'}
];
test('ownership filters support role, document name, username, date range, and status',()=>{
 assert.deepEqual(filterOwnershipRows(rows,{role:'Software Developer'},'alice').map(r=>r.documentId),['handoff-dev']);
 assert.deepEqual(filterOwnershipRows(rows,{document:'customer login'},'alice').map(r=>r.documentId),['ba-br-BR-001']);
 assert.equal(filterOwnershipRows(rows,{username:'bob'},'alice').length,1);
 assert.equal(filterOwnershipRows(rows,{username:'carol'},'alice').length,1);
 assert.deepEqual(filterOwnershipRows(rows,{from:'2026-10-27',to:'2026-10-27'},'alice').map(r=>r.documentId),['ba-br-BR-001']);
 assert.deepEqual(filterOwnershipRows(rows,{status:'requested-by-me'},'alice').map(r=>r.documentId),['ba-br-BR-001']);
 assert.deepEqual(filterOwnershipRows(rows,{status:'awaiting-me'},'alice').map(r=>r.documentId),['handoff-qa']);
 assert.deepEqual(filterOwnershipRows(rows,{status:'unassigned'},'alice').map(r=>r.documentId),['handoff-dev']);
 assert.equal(filterOwnershipRows(rows,{status:'pending'},'alice').length,2);
 assert.equal(filterOwnershipRows(rows,{from:'2026-10-01'},'alice').length,3);
 assert.equal(ownerStatus(rows[0],'alice'),'mine');
});
test('ownership screen presents filters, selectable table and recovery path',()=>{
 for(const id of ['opsFilterRole','opsFilterName','opsFilterUsername','opsFilterStatus','opsFilterFrom','opsFilterTo','opsOwnerRows','opsClearFilters','opsOwnerError','opsConnectionSettings'])assert.match(ext,new RegExp(`id="${id}"`));
 assert.match(ext,/ownershipFilters/);
 assert.match(ui,/ATGVOwnershipFilters\.filterOwnershipRows/);
 assert.match(ui,/m\.type==='ownerListError'/);
 assert.match(ui,/m\.type==='ownerActionError'/);
 assert.match(ui,/navigate\('project-settings'\)/);
});
function client(){return new JiraConfluenceCoordination({project:'tech-cockpit',config:{get:k=>({'jira.baseUrl':'https://aiamy.atlassian.net','jira.email':'ba@example.com','confluence.baseUrl':'https://aiamy.atlassian.net/wiki','confluence.spaceKey':'TECH','confluence.spaceId':'123'})[k]||''},token:'token'});}
function json(o,status=200){return new Response(JSON.stringify(o),{status,headers:{'Content-Type':'application/json'}});}
test('Confluence modern pages lookup avoids failing legacy title endpoint',async()=>{
 const original=global.fetch,paths=[];
 global.fetch=async(u,opt)=>{const p=new URL(u).pathname;paths.push(p);
  if(p==='/rest/api/3/myself')return json({accountId:'alice',displayName:'Alice'});
  if(p==='/wiki/api/v2/spaces/123')return json({id:'123',key:'TECH'});
  if(p==='/wiki/api/v2/spaces/123/pages')return json({results:[]});
  if(p==='/wiki/rest/api/content')return json({code:'not_found',title:'not found',details:null},404);
  if(p==='/wiki/api/v2/pages'&&opt.method==='POST')return json({id:'11'});
  throw Error('Unexpected URL '+p);
 };
 try{const result=await client().act({document:'ba-discovery',action:'claim',expectedRevision:0});assert.equal(result.document.ownerId,'alice');assert.equal(paths.includes('/wiki/rest/api/content'),false);}finally{global.fetch=original;}
});
test('Confluence 404 on modern lookup falls back safely to legacy lookup',async()=>{
 const previous=global.fetch,paths=[];
 global.fetch=async(u)=>{const p=new URL(u).pathname;paths.push(p);
  if(p==='/rest/api/3/myself')return json({accountId:'alice',displayName:'Alice'});
  if(p==='/wiki/api/v2/spaces/123')return json({id:'123',key:'TECH'});
  if(p==='/wiki/api/v2/spaces/123/pages')return json({code:'not_found',title:'not found',details:null},404);
  if(p==='/wiki/rest/api/content')return json({results:[]});
  throw Error('Unexpected URL '+p);
 };
 try{assert.equal((await client().list()).documents.length,0);assert(paths.includes('/wiki/rest/api/content'));}finally{global.fetch=previous;}
});
test('Confluence 404 on both lookup paths explains permission and settings without claiming success',async()=>{
 const previous=global.fetch;
 global.fetch=async(u)=>{const p=new URL(u).pathname;
  if(p==='/rest/api/3/myself')return json({accountId:'alice',displayName:'Alice'});
  if(p==='/wiki/api/v2/spaces/123')return json({id:'123',key:'TECH'});
  return json({code:'not_found',title:'not found',details:null},404);
 };
 try{await assert.rejects(client().act({document:'ba-discovery',action:'claim',expectedRevision:0}),/Confluence ownership registry endpoint.*not found.*Project Settings.*not saved/);}finally{global.fetch=previous;}
});
test('Confluence 404 on configured space ID is explained before any ownership mutation',async()=>{
 const previous=global.fetch;
 global.fetch=async(u)=>new URL(u).pathname==='/rest/api/3/myself'?json({accountId:'alice',displayName:'Alice'}):json({code:'not_found',title:'not found',details:null},404);
 try{await assert.rejects(client().list(),/space TECH.*not found.*Project Settings/);}finally{global.fetch=previous;}
});

test('verified display names persist on ownership claims and transfers without replacing account IDs',()=>{
 const {transitionOwnership}=require('../src/ownership');
 const first=transitionOwnership(null,{actor:'atlassian-id-alice',actorName:'Alice Owner',action:'claim',expectedRevision:0});
 assert.equal(first.ownerId,'atlassian-id-alice');assert.equal(first.ownerName,'Alice Owner');
 const request=transitionOwnership(first,{actor:'atlassian-id-bob',actorName:'Bob Reviewer',action:'request-transfer',expectedRevision:1});
 assert.equal(request.pending.toName,'Bob Reviewer');
 const approved=transitionOwnership(request,{actor:'atlassian-id-alice',actorName:'Alice Owner',action:'approve-transfer',expectedRevision:2});
 assert.equal(approved.ownerId,'atlassian-id-bob');assert.equal(approved.ownerName,'Bob Reviewer');
 assert.equal(filterOwnershipRows([{documentId:'br',label:'BR',role:'BA',...approved}],{username:'bob reviewer'},'atlassian-id-alice').length,1);
});
