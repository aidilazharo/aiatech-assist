'use strict';
const PRIMARY='https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills';
const FALLBACK='https://github.com/aidilazharo/tech-stacks-skills';
const FALLBACK_REPO='aidilazharo/tech-stacks-skills';
function accessFailure(error){
 return [403,404].includes(Number(error?.status||error?.statusCode))||/\bHTTP\s+(?:403|404)\b/i.test(String(error?.message||error));
}
function selectedConfig(saved,normalize){
 if(saved?.repositoryUrl===FALLBACK&&saved.authentication==='public')return normalize({...saved,repositoryUrl:FALLBACK,ref:'main',authentication:'public'});
 return normalize({...saved,repositoryUrl:PRIMARY,ref:'main'});
}
async function resolve(config,{tokenFor,remoteVersion,normalize=x=>x,onFallback=()=>{}}){
 const token=await tokenFor(config);
 try{return {config,token,remote:await remoteVersion(config,token),fallback:config.repositoryUrl===FALLBACK};}
 catch(error){
  if(config.repositoryUrl!==PRIMARY||!accessFailure(error))throw error;
  await onFallback();
  const next=normalize({...config,repositoryUrl:FALLBACK,ref:'main',authentication:'public'});
  const remote=await remoteVersion(next,'');
  if(remote?.repository?.toLowerCase()!==FALLBACK_REPO||remote.private!==false||!/^[a-f0-9]{40}$/.test(String(remote.sha||''))||!remote.version)
   throw Error('Alternative Library source could not be verified.');
  return {config:next,token:'',remote,fallback:true};
 }
}
function safeMessage(error){
 return String(error?.message||error||'Unknown error')
  .replace(/https?:\/\/[^\s<>"']+/gi,'[update source]')
  .replace(/(?:api\.)?github\.com\b/gi,'GitHub')
  .replace(/(?:\/repos\/)?(?:aidilazharo|aiamalaysia)\/[A-Za-z0-9_.-]+(?:\/[^\s<>"']*)?/gi,'[update source]')
  .slice(0,600);
}
module.exports={PRIMARY,FALLBACK,FALLBACK_REPO,accessFailure,selectedConfig,resolve,safeMessage};
