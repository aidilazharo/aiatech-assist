'use strict';
// Access to the editor is never conditional on an integration probe. This policy
// reports the capabilities required by the active role; host-side API actions
// retain their own authentication and authorization checks.
const CAPABILITIES=Object.freeze([
 ['jiraRead','Jira read'],['jiraWrite','Jira write'],
 ['confluenceRead','Confluence read'],['confluenceWrite','Confluence write'],
 ['githubRead','GitHub read'],['githubWrite','GitHub write']
]);
function isDeveloperRole(roleId){
 return /^(?:developer|software-developer)$/i.test(String(roleId||'').trim());
}
function evaluate(roleId,observed={},projectId=''){
 const developer=isDeveloperRole(roleId);
 const capabilities={};
 for(const [key] of CAPABILITIES)capabilities[key]=observed[key]===true;
 const missing=CAPABILITIES.filter(([key])=>(key!=='githubWrite'||developer)&&!capabilities[key])
  .map(([key,label])=>label);
 return {roleId:String(roleId||'business-analyst'),projectId:String(projectId||''),developer,
  capabilities,required:CAPABILITIES.filter(([key])=>key!=='githubWrite'||developer).map(([key])=>key),
  missing,ready:missing.length===0};
}
module.exports={CAPABILITIES,isDeveloperRole,evaluate};
