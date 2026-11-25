'use strict';
// A 403 is not permission to try other releases. Only an explicitly approved,
// unexpired local policy can authorize same-registry, same-major candidates.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const VERSION=/^\d+\.\d+\.\d+$/;
const NAME=/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i;
function registry(value){
 try{const u=new URL(String(value).trim());if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)return '';return u.href.replace(/\/+$/,'')+'/';}catch{return '';}
}
function parse403(text){
 const raw=String(text||'');if(!/\bE403\b/.test(raw)||!/403 Forbidden/i.test(raw)||/\bE401\b|authentication required|package (?:is )?(?:prohibited|blocked in its entirety)/i.test(raw))return null;
 const hit=/403 Forbidden\s*-\s*GET\s+(https:\/\/[^\s'"<>]+)/i.exec(raw);if(!hit)return null;
 try{const u=new URL(hit[1]);if(u.username||u.password||u.search||u.hash)return null;
  const p=decodeURIComponent(u.pathname),m=/\/(?:((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+))\/-\/([a-z0-9_.-]+)-(\d+\.\d+\.\d+)\.tgz$/i.exec(p);
  if(!m||m[1].split('/').at(-1)!==m[2])return null;return {package:m[1],version:m[3],url:u.href};
 }catch{return null;}
}
async function readPolicy(historyFile){
 const file=path.join(path.dirname(historyFile),'npm-version-policy.json');
 const stat=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(!stat)return null;if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128000)throw Error('Unsafe npm version policy file.');
 const data=JSON.parse(await fs.readFile(file,'utf8'));
 if(!data||typeof data.policyId!=='string'||!data.policyId.trim()||!registry(data.registry)||!(Date.parse(data.expiresAt)>Date.now())||!data.packages||typeof data.packages!=='object'||Array.isArray(data.packages))return null;
 const packages=Object.create(null);
 for(const [name,versions] of Object.entries(data.packages))if(NAME.test(name)&&Array.isArray(versions))packages[name]=[...new Set(versions.filter(v=>typeof v==='string'&&VERSION.test(v)))];
 return {registry:registry(data.registry),packages,expiresAt:Date.parse(data.expiresAt),key:crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),db:path.join(path.dirname(file),'npm-policy-recovery.sqlite')};
}
async function scopeFor(policy,name,range,{cwd,runner,env,signal}){
 if(!policy?.packages[name]?.length||!range||policy.expiresAt<=Date.now())return null;
 const {npmCommand}=require('./platform-process');
 const query=async args=>{const c=npmCommand(args);const r=await runner(c.bin,c.args,{cwd,timeout:30000,maxBuffer:65536,windowsHide:true,shell:false,signal,env:{...process.env,CI:'1',...env}});return String(r.stdout||'').trim();};
 let actual=name.startsWith('@')?await query(['config','get',name.split('/')[0]+':registry']):'';
 if(!actual||actual==='undefined'||actual==='null')actual=await query(['config','get','registry']);
 if(registry(actual)!==policy.registry)return null;
 const npm=await query(['--version']);if(!VERSION.test(npm))return null;
 const scope=crypto.createHash('sha256').update(JSON.stringify([policy.key,name,range,process.platform,process.arch,process.versions.node,npm])).digest('hex');
 return {scope,name,range,policy};
}
async function withDb(ctx,fn){
 const file=ctx.policy.db,stat=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw Error('Unsafe npm recovery database.');
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file);
 try{await fs.chmod(file,0o600).catch(()=>{});db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS dependency_version_history(scope TEXT NOT NULL, package TEXT NOT NULL, version TEXT NOT NULL, outcome TEXT NOT NULL, successes INTEGER NOT NULL, failures INTEGER NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(scope,package,version));');return fn(db);}finally{db.close();}
}
async function history(ctx){return withDb(ctx,db=>db.prepare('SELECT version,outcome FROM dependency_version_history WHERE scope=? AND package=? ORDER BY updated DESC').all(ctx.scope,ctx.name));}
async function record(ctx,version,outcome){
 if(!VERSION.test(version)||!['rejected','dependency-verified'].includes(outcome))throw Error('Invalid npm recovery outcome.');
 return withDb(ctx,db=>db.prepare('INSERT INTO dependency_version_history VALUES(?,?,?,?,?,?,?) ON CONFLICT(scope,package,version) DO UPDATE SET outcome=excluded.outcome,successes=successes+excluded.successes,failures=failures+excluded.failures,updated=excluded.updated').run(ctx.scope,ctx.name,version,outcome,outcome==='dependency-verified'?1:0,outcome==='rejected'?1:0,new Date().toISOString()));
}
function matches(ctx,failure){return ctx&&ctx.name===failure.package&&failure.url.startsWith(ctx.policy.registry)&&ctx.policy.expiresAt>Date.now();}
function candidates(ctx,available,rows,original){
 if(!VERSION.test(original)||ctx.policy.expiresAt<=Date.now())return [];
 const failed=new Set(rows.filter(r=>r.outcome==='rejected').map(r=>r.version));
 const verified=new Set(rows.filter(r=>r.outcome==='dependency-verified').map(r=>r.version));
 const prefix=original.split('.').slice(0,2).join('.')+'.';
 return available.filter(v=>VERSION.test(v)&&v!==original&&v.split('.')[0]===original.split('.')[0]&&ctx.policy.packages[ctx.name].includes(v)&&!failed.has(v)).sort((a,b)=>Number(verified.has(b))-Number(verified.has(a))||Number(b.startsWith(prefix))-Number(a.startsWith(prefix)));
}
module.exports={parse403,readPolicy,scopeFor,history,record,matches,candidates};
