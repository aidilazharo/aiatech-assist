'use strict';
// Persist repository identities, PR numbers and release tags only; PATs stay in the vault.
const crypto=require('node:crypto');
const api=require('./repo-sync-github-api');
const {githubUrl}=require('./repo-sync-pr');
const publisher=require('./repo-sync-release-publisher');
const KEY='atgvAssist.repoSync.releaseQueue';
const secretKey=(kind,repo)=>'atgvAssist.repoSync.'+kind+'.'+crypto.createHash('sha256').update(repo.name.toLowerCase()).digest('hex');
function identity(source,destination,prNumber,tag){
 const pair=publisher.pairFor(source,destination);
 publisher.tagInfo(tag,pair.kind);
 if(!Number.isSafeInteger(prNumber)||prNumber<1||prNumber>1000000000)throw Error('Invalid destination PR number.');
 return destination.name.toLowerCase()+'#'+prNumber+':'+tag;
}
function createQueue({preferences,secrets,onLog=()=>{},onChange=()=>{},request=api.githubRequest,publish=publisher.publish}){
 let ticking=false,serial=Promise.resolve();
 const rows=()=>{const value=preferences?.get?.(KEY,[]);return Array.isArray(value)?value:[];};
 const save=fn=>{
  const work=serial.then(async()=>{
   if(!preferences?.update)throw Error('Release queue storage unavailable.');
   const next=fn(rows());await preferences.update(KEY,next);onChange(next);
  });
  serial=work.catch(()=>{});return work;
 };
 async function enqueue({source,destination,prNumber,tag}){
  const id=identity(source,destination,prNumber,tag);
  await save(items=>items.some(x=>x.id===id)?items:[...items,{id,source:source.name,destination:destination.name,prNumber,tag,status:'awaiting-merge'}]);
 }
 async function set(id,patch){await save(items=>items.map(x=>x.id===id?{...x,...patch}:x));}
 async function tick(){
  if(ticking)return;
  ticking=true;
  try{
   for(const job of rows().filter(x=>!['published','closed-unmerged','superseded'].includes(x.status))){
    let sourcePat='',destPat='';
    try{
     const source=githubUrl('https://github.com/'+job.source),destination=githubUrl('https://github.com/'+job.destination);
     if(identity(source,destination,job.prNumber,job.tag)!==job.id)throw Error('Invalid queued release identity.');
     sourcePat=await secrets?.get?.(secretKey('Source',source));
     destPat=await secrets?.get?.(secretKey('Destination',destination));
     if(!sourcePat||!destPat)throw Error('Saved Source and Destination PATs are required. Reconnect in Workspace.');
     const result=await request(destination,destPat,'GET','/pulls/'+job.prNumber);
     if(result.status!==200)throw Error('Cannot check destination PR (HTTP '+result.status+').');
     if(!result.body?.merged){
      await set(job.id,{status:result.body?.state==='closed'?'closed-unmerged':'awaiting-merge',detail:''});continue;
     }
     await set(job.id,{status:'publishing',detail:''});
     const released=await publish({source,destination,sourcePat,destPat,prNumber:job.prNumber,tag:job.tag});
     await set(job.id,{status:'published',url:released.url,detail:''});
    }catch(error){
     let detail=String(error?.message||error);
     for(const token of [sourcePat,destPat])if(token)detail=detail.split(token).join('[REDACTED]');
     detail=detail.slice(0,450);
     await set(job.id,{status:error?.code==='RELEASE_SUPERSEDED'?'superseded':'retry',detail});onLog('Workspace release queue: '+detail);
    }
   }
  }finally{ticking=false;}
 }
 return {enqueue,tick,rows};
}
module.exports={createQueue,KEY,secretKey};
