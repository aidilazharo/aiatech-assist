'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pull}=require('../src/architect-custom-pull');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const original='a'.repeat(40),remote='b'.repeat(40);
function fixture({clean=true,branch='main',sha=original,remoteUrl='https://github.com/acme/project.git',running=false,diverged=false}={}){
 let head=sha;const calls=[];
 const driver={
  repository:async()=>({root:'/safe/project',sha:head,branch,clean,remote:remoteUrl}),
  matchesGithubRepo:(url,owner,name)=>url.toLowerCase()==='https://github.com/'+owner+'/'+name+'.git',
  localLogs:()=>({running})
 };
 const run=async(_root,...args)=>{
  calls.push(args.join(' '));
  if(args[0]==='fetch')return '';
  if(args[0]==='rev-parse')return remote;
  if(args[0]==='merge-base'){if(diverged)throw Error('Not ancestor');return '';}
  if(args[0]==='merge'){head=remote;return '';}
  throw Error('Unexpected command '+args.join(' '));
 };
 return {driver,run,calls};
}
const args=x=>({...x,expectedSha:original,owner:'acme',name:'project'});
test('fast-forward only after scan, matching origin, clean checkout and exact SHA',async()=>{
 const x=fixture();const result=await pull('/safe/project',args(x));
 assert.equal(result.updated,true);
 assert.equal(result.sha,remote);
 assert.ok(x.calls.some(v=>v.startsWith('fetch --no-tags origin refs/heads/main:')));
 assert.ok(x.calls.includes('merge --ff-only refs/remotes/origin/main'));
 assert.equal(x.calls.some(v=>/(?:reset|stash|push|switch|checkout)/.test(v)),false);
});
test('dirty, detached, changed or wrong-origin repository is not pulled',async()=>{
 for(const options of [{clean:false},{branch:''},{sha:'c'.repeat(40)},{remoteUrl:'https://github.com/other/project.git'},{running:true}]){
  const x=fixture(options);await assert.rejects(pull('/safe/project',args(x)));
  assert.equal(x.calls.length,0);
 }
});
test('divergent branch refuses unsafe merge and preserves local commit',async()=>{
 const x=fixture({diverged:true});
 await assert.rejects(pull('/safe/project',args(x)),/diverged/);
 assert.equal(x.calls.some(x=>x.startsWith('merge --ff-only')),false);
});
test('Custom Stack keeps Scan and Pull separate and re-scans after successful pull',()=>{
 const ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js'),html=read('src/lib/webview/dashboard-html.js');
 assert.match(ui,/\$\('architectCustomScan'\)\.textContent='Scan Repository'/);
 assert.match(ui,/\$\('architectCustomPull'\)\.disabled=/);
 assert.match(ui,/send\('architectCustomPull',\{projectId:activeId,expectedSha:current.sha\}\)/);
 assert.match(ui,/send\('architectCustomScan',\{projectId:activeId\}\)/);
 assert.match(ui,/m.type==='architectCustomPullResult'/);
 assert.match(host,/case 'architectCustomPull':/);
 assert.match(host,/architectRepository\.resolve/);
 assert.match(host,/require\('\.\.\/\.\.\/architect-custom-pull'\)\.pull/);
 assert.match(host,/require\('\.\.\/\.\.\/architect-custom-stack'\)\.scan\(root\)/);
 assert.match(html,/id="architectCustomScan"/);
 assert.match(html,/id="architectCustomPull"/);
});
