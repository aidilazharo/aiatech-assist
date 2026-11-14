'use strict';
/**
 * ATGV Developer RED-test contract and scaffold migration guard.
 * Side-effect free: never rewrites a locked acceptance test.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const normalize = s => String(s || '').replace(/\/+$/,'') || '/';
const pathPattern = /\/api\/[A-Za-z0-9_:/-]+/g;
const starterSignatures = [
  'SQLite-backed task API supports create/list/delete',
  'ATGV React + SQLite',
  'Example task',
  'ATGV Starter Task API'
];

function apiPaths(source) {
  return [...new Set((String(source).match(pathPattern) || []).map(normalize))].sort();
}
function explicitTestEndpoints(source) {
  const result=[];
  const text=String(source);
  // Covers fetch(base + '/api/names', {...}), fetch(`${baseUrl}/api/names`, {...}),
  // and fetch('/api/names', {...}). Do not guess HTTP verb for all references.
  const re=/\bfetch\s*\(([\s\S]{0,280}?)\)\s*(?:;|\n|\.)?/g;
  for (const match of text.matchAll(re)) {
    const raw=match[1];
    const url=apiPaths(raw)[0];
    if (!url) continue;
    const method = /\bmethod\s*:\s*['"`]([A-Z]+)['"`]/i.exec(raw)?.[1]?.toUpperCase() || 'GET';
    result.push({method,path:url});
  }
  return [...new Map(result.map(x=>[`${x.method} ${x.path}`,x])).values()];
}
function isStarterExample({name='',source='',approvedPaths=[]}) {
  const evidence=starterSignatures.filter(x=>String(source).includes(x));
  const endpoints=apiPaths(source);
  const approved=new Set(approvedPaths.map(normalize));
  const onlyTaskPaths=endpoints.some(x=>x==='/api/tasks'||x.startsWith('/api/tasks/')) &&
    endpoints.every(x=>x==='/api/health'||x==='/api/docs'||x==='/api/openapi.json'||x==='/api/tasks'||x.startsWith('/api/tasks/'));
  const taskApproved=[...approved].some(x=>x==='/api/tasks'||x.startsWith('/api/tasks/'));
  const starter = !taskApproved && onlyTaskPaths && evidence.length >= 2 && /(?:server\/api\.test\.mjs|src\/App\.test\.tsx)$/.test(name.replace(/\\/g,'/'));
  return {starter, evidence, endpoints, taskApproved};
}
function reviewContract({approvedRoutes,lockedTests,extraTests=[]}) {
  if (!Array.isArray(approvedRoutes)||!approvedRoutes.length) throw new Error('approvedRoutes must be a non-empty array of {method,path}.');
  const allowed=new Set(approvedRoutes.map(r=>`${String(r.method).toUpperCase()} ${normalize(r.path)}`));
  const approvedPaths=approvedRoutes.map(r=>normalize(r.path));
  const conflicts=[];
  const accepted=[];
  for (const t of lockedTests) {
    const actual=explicitTestEndpoints(t.source);
    const unsupported=actual.filter(r=>!allowed.has(`${r.method} ${r.path}`) && r.path!=='/api/health');
    if (unsupported.length) conflicts.push({file:t.name, unsupported, reason:'LOCKED_TEST_ENDPOINT_NOT_IN_APPROVED_BR'});
    accepted.push({file:t.name,routes:actual});
  }
  const scaffold=extraTests.map(t=>({file:t.name,...isStarterExample({...t,approvedPaths})}));
  const excluded=scaffold.filter(t=>t.starter).map(t=>t.file);
  const ambiguous=scaffold.filter(t=>!t.starter && t.evidence.length && !t.taskApproved).map(t=>t.file);
  return {
    status:conflicts.length?'contract-review-required':ambiguous.length?'starter-review-required':'ready',
    conflicts, accepted, excludedStarterTests:excluded, ambiguousStarterTests:ambiguous,
    approvedRoutes:approvedRoutes.map(r=>({method:String(r.method).toUpperCase(),path:normalize(r.path)})),
    invariants:['Never edit or replace locked acceptance tests during GREEN','Do not accept generated code violating BR scope','Archive verified out-of-scope scaffold tests with audit trail','Run applicable BR tests and targeted API regressions before completion']
  };
}
function digestApplication(root, include=['server','src']) {
  const hash=crypto.createHash('sha256');
  const list=[];
  for(const folder of include){
    const start=path.join(root,folder);
    const todo=[start];
    while(todo.length){
      const dir=todo.pop(); if(!fs.existsSync(dir))continue;
      for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
        if(entry.name==='node_modules'||entry.name==='dist'||entry.name==='__tests__')continue;
        const full=path.join(dir,entry.name);
        if(entry.isSymbolicLink())continue;
        if(entry.isDirectory())todo.push(full);
        else if(entry.isFile() && /\.(?:mjs|cjs|js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name))list.push(full);
      }
    }
  }
  for(const file of list.sort()){hash.update(path.relative(root,file)).update('\0').update(fs.readFileSync(file)).update('\0');}
  return hash.digest('hex');
}
function repairDecision({testFailure, approvedRoutes, lockedTests, extraTests, sourceDigest, previousSourceDigest, repeats=0}) {
  const review=reviewContract({approvedRoutes,lockedTests,extraTests});
  if(review.status!=='ready')return {action:'block-for-contract-review',review,reason:'Contract or scaffold test mismatch must be resolved before any further GREEN retries.'};
  if(previousSourceDigest && sourceDigest===previousSourceDigest && repeats>=2)return {action:'stop-repeated-noop',review,reason:'Unchanged application source after repeated attempts.'};
  return {action:'targeted-repair',review,reason:testFailure||'Run BR-specific tests then applicable regressions.'};
}
// Only explicit method + literal URL pairs in the approved BR authorize a
// route lock. Entity names and generic CRUD descriptions are not API contracts.
function approvedRoutesFromBr(brText){
 const approved=[];
 const source=String(brText||'');
 const re=/\b(GET|POST|PUT|PATCH|DELETE|HEAD)\s+[`'"“”]?\s*(\/api\/[A-Za-z0-9_:/{}/.-]+)/gi;
 for(const m of source.matchAll(re)){
  const method=m[1].toUpperCase(),path=normalize(m[2].replace(/[.,;]+$/,''));
  if(!approved.some(x=>x.method===method&&x.path===path))approved.push({method,path});
 }
 return approved;
}
function reviewRedTestContract(brText,files){
 const approvedRoutes=approvedRoutesFromBr(brText);
 if(!approvedRoutes.length)return {status:'no-explicit-api-contract',approvedRoutes,conflicts:[],accepted:[]};
 const review=reviewContract({approvedRoutes,lockedTests:(files||[]).map(f=>({name:String(f.path||f.relative||f.name||''),source:String(f.content||f.source||'')}))});
 return review;
}
module.exports={apiPaths,explicitTestEndpoints,isStarterExample,reviewContract,digestApplication,repairDecision,approvedRoutesFromBr,reviewRedTestContract};
