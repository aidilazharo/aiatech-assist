'use strict';
// Accept one-time username:PAT GitHub URLs and immediately normalize away userinfo.
// Never put PATs in Git URLs, remote config, PR bodies or log output.
const https=require('node:https');
const repoSync=require('./repo-sync-pr');
function parseCredentialUrl(input){
 const raw=String(input||'').trim();
 if(raw.length>2048)throw Error('GitHub repository URL is too long.');
 let url;
 try{url=new URL(raw);}catch{throw Error('Enter an HTTPS github.com repository URL.');}
 if(url.protocol!=='https:'||url.hostname.toLowerCase()!=='github.com'||url.port||url.search||url.hash)
  throw Error('Use HTTPS github.com with no port, query or fragment.');
 if(Boolean(url.username)!==Boolean(url.password))throw Error('Include both a GitHub username and PAT, or neither.');
 let token='';
 try{if(url.password)token=decodeURIComponent(url.password);}catch{throw Error('Invalid URL-encoded PAT.');}
 if(token)repoSync.patEnvironment(token);
 const repo=repoSync.githubUrl('https://github.com'+url.pathname);
 return {...repo,webUrl:'https://github.com/'+repo.name,token};
}
function requestRepository(repo,token){
 return new Promise((resolve,reject)=>{
  const url='https://api.github.com/repos/'+encodeURIComponent(repo.owner)+'/'+encodeURIComponent(repo.repo);
  const req=https.get(url,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'ATGV-AIATECH-Assist',Authorization:'Bearer '+token}},response=>{
   let body='',size=0;
   response.setEncoding('utf8');
   response.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>262144){req.destroy(Error('Oversized GitHub response.'));return;}body+=chunk;});
   response.on('end',()=>{let parsed=null;try{parsed=JSON.parse(body);}catch{}resolve({status:response.statusCode||0,body:parsed});});
   response.on('error',()=>reject(Error('GitHub response failed.')));
  });
  req.setTimeout(15000,()=>req.destroy(Error('GitHub connection timed out.')));
  req.on('error',()=>reject(Error('Cannot reach GitHub API. Check network access.')));
 });
}
async function verifyConnection(repo,token,kind,request=requestRepository){
 if(!['Source','Destination'].includes(kind))throw Error('Unknown GitHub repository access check.');
 repoSync.patEnvironment(token);
 let result;
 try{result=await request(repo,token);}catch{throw Error('GitHub connection test failed. Check network or API access.');}
 const status=Number(result?.status)||0;
 if(status===401)throw Error(kind+' PAT authentication failed (HTTP 401). Replace the token.');
 if(status===404)throw Error(kind+' repository not found or inaccessible with this PAT (HTTP 404).');
 if(status===403)throw Error(kind+' PAT denied by GitHub (HTTP 403); review token scope and organization restrictions.');
 if(status!==200)throw Error('GitHub '+kind+' connection returned HTTP '+status+'.');
 const details=result.body||{};
 if(String(details.full_name||'').toLowerCase()!==repo.name.toLowerCase())
  throw Error('GitHub returned a different repository identity.');
 const access=kind==='Source'?'pull':'push';
 if(details.permissions?.[access]!==true)throw Error(kind+' PAT does not have repository '+(kind==='Source'?'read':'write')+' access.');
 return {repo:repo.name,kind,permission:access,private:details.private===true};
}
module.exports={parseCredentialUrl,verifyConnection,requestRepository};
