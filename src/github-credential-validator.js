'use strict';
const HEADERS=Object.freeze({Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
function diagnostic(status,headers,body=''){
 const read=name=>typeof headers?.get==='function'?headers.get(name):headers?.[name];
 const message=String(body||'');
 if(status===401)return 'GitHub authentication failed: invalid, expired or revoked token.';
 if(status===429||status===403&&(read('x-ratelimit-remaining')==='0'||read('retry-after')||/rate limit/i.test(message)))return 'GitHub API rate limit reached. Respect Retry-After or the rate-limit reset before retrying.';
 if(status===403&&read('x-github-sso'))return 'GitHub SAML SSO authorization required for this token.';
 if(status===403&&/IP\s*(?:allow[ -]*list|allowlist)/i.test(message))return 'GitHub organization IP allowlist denied access; use an approved network.';
 if(status===403)return 'GitHub access denied. Check repository selection, token permissions, organization approval and SSO.';
 if(status===404)return 'GitHub repository or endpoint not found or not accessible with these credentials.';
 if(status>=500)return 'GitHub service error; retry later.';
 return '';
}
async function account(api,token,request){
 if(!token)throw Error('GitHub PAT or authenticated VS Code session is required.');
 const user=await request(api+'/user',{token,headers:HEADERS});
 if(typeof user?.login!=='string'||!user.login.trim())throw Error('GitHub authentication did not return an account.');
 return {login:user.login,id:user.id||null};
}
async function repository({api,route,owner,repo,token,branch='',request,requireAuthentication=true}){
 const user=token?await account(api,token,request):null;
 if(requireAuthentication&&!user)throw Error('GitHub PAT or authenticated VS Code session is required.');
 const options={token,headers:HEADERS};
 const meta=await request(route,options);
 if(String(meta?.full_name||'').toLowerCase()!==(owner+'/'+repo).toLowerCase())throw Error('GitHub returned a repository that does not match the requested owner/repository.');
 if(meta.permissions?.pull===false)throw Error('GitHub repository read permission denied.');
 const selected=branch||String(meta.default_branch||'');
 if(branch){
  const value=await request(route+'/branches/'+encodeURIComponent(branch),options);
  if(value?.name!==branch)throw Error('GitHub did not verify the requested branch.');
 }else{
  // Listing branches needs Contents: read for fine-grained PATs. Empty repos
  // may legitimately return an empty list; metadata alone is not proof.
  const value=await request(route+'/branches?per_page=1',options);
  if(!Array.isArray(value))throw Error('GitHub repository content access could not be verified.');
 }
 return {fullName:meta.full_name,private:!!meta.private,defaultBranch:String(meta.default_branch||''),branch:selected,
  authenticated:!!user,login:user?.login||'',permissions:{pull:true,push:!!user&&meta.permissions?.push===true&&!meta.archived&&!meta.disabled},
  writeAssessment:'Repository permission estimate only; token scope, rulesets and actual Git push may still restrict writes.'};
}
module.exports={HEADERS,diagnostic,account,repository};
