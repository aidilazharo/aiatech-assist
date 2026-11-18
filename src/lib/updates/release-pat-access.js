'use strict';
// A Release Download PAT is deliberately separate from Git, Jira, PRs, source
// sync and the SDLC Catalog's main-branch credential. Only GitHub Releases GET.
const releases=require('./github-release-updater');
const library=require('./library-release-updater');
const REPOSITORIES=Object.freeze([releases.REPO,library.REPO]);
function normalizeToken(raw){
 const value=String(raw||'').trim();
 if(value.length<20||value.length>512||/\s/.test(value)||!/^(?:github_pat_|ghp_)[A-Za-z0-9_]+$/.test(value)){
  throw Error('Enter a fine-grained GitHub PAT (github_pat_…) or classic PAT (ghp_…) without spaces. For minimum access use a fine-grained token with Contents: Read-only.');
 }
 return value;
}
async function verifyReadOnlyReleaseAccess(raw,{request=releases.getBytes,repositories=REPOSITORIES}={}){
 const token=normalizeToken(raw),results=[];
 for(const repository of repositories){
  if(!REPOSITORIES.includes(repository))throw Error('Only the ATGV release repositories may be checked.');
  const url='https://api.github.com/repos/'+repository+'/releases?per_page=1';
  const parse=data=>{
   const response=JSON.parse(Buffer.from(data).toString('utf8'));
   if(!Array.isArray(response))throw Error('GitHub returned an unexpected Releases response.');
   return response;
  };
  try{
   parse(await request(url,{token,maxBytes:1024*1024}));
   results.push({repository,access:'PAT'});
  }catch(error){
   // A PAT scoped to one private repository must not block public releases
   // in the other repository; fall back to anonymous read for that repository.
   try{
    parse(await request(url,{token:'',maxBytes:1024*1024}));
    results.push({repository,access:'public'});
   }catch{
    throw Error('Release access denied for '+repository+'. Give the PAT Contents: Read-only access to private release repositories, or make releases public.');
   }
  }
 }
 if(!results.some(x=>x.access==='PAT'))throw Error('The PAT did not authenticate to either ATGV release repository. Check its repository selection, expiration and access.');
 return {results,summary:results.map(x=>x.repository+' ('+(x.access==='PAT'?'PAT read verified':'public read')+')').join(' · ')};
}
module.exports={REPOSITORIES,normalizeToken,verifyReadOnlyReleaseAccess};
