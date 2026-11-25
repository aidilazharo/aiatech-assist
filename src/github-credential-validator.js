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
// A failed policy lookup means unknown, never permission denied or unprotected.
async function branchPolicy({route,branch='main',token,request}){
 const options={token,headers:HEADERS};
 let protectedBranch=null,requiresPullRequest=null;
 try{const data=await request(route+'/branches/'+encodeURIComponent(branch),options);if(data?.name===branch&&typeof data.protected==='boolean')protectedBranch=data.protected;}catch{}
 try{const rules=await request(route+'/rules/branches/'+encodeURIComponent(branch),options);
  if(Array.isArray(rules)&&rules.some(rule=>rule?.type==='pull_request'))requiresPullRequest=true;
 }catch{}
 if(requiresPullRequest!==true){
  try{const protection=await request(route+'/branches/'+encodeURIComponent(branch)+'/protection',options);
   if(protection?.required_pull_request_reviews&&typeof protection.required_pull_request_reviews==='object')requiresPullRequest=true;
  }catch{}
 }
 return {protectedBranch,requiresPullRequest};
}
function gitFailure(error){
 const message=String(error?.stderr||error?.message||error||'');
 if(/GH013|GH006|repository rule violations|protected branch update failed|changes must be made through a pull request/i.test(message)){
  if(/pull request/i.test(message))return 'GitHub branch policy requires a pull request. Credentials were not rejected; push an approved work branch and open a PR. No rules were bypassed.';
  return 'GitHub branch protection or repository rules rejected the update. Review the repository rules and use the approved workflow.';
 }
 if(/authentication failed|invalid username or token|could not read username|terminal prompts disabled|HTTP 401|returned error: 401/i.test(message))return 'Git authentication failed. Check the selected credential, Git Credential Manager, or VS Code GitHub sign-in.';
 if(/permission denied|403|write access.*not granted/i.test(message))return 'Git access denied. Check repository permissions, SSO and organization restrictions.';
 if(/could not resolve host|ENOTFOUND/i.test(message))return 'Git could not resolve the GitHub host. Check DNS or corporate proxy.';
 if(/certificate|SSL|TLS/i.test(message))return 'Git TLS certificate verification failed. Check the trusted corporate certificate and proxy.';
 if(/timeout|timed out|ETIMEDOUT/i.test(message))return 'Git connection timed out. Check network or proxy.';
 return 'Git operation failed. Check network, repository access and branch configuration.';
}
module.exports={HEADERS,diagnostic,account,repository,branchPolicy,gitFailure};
