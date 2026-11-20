'use strict';
// Read-only validation. Missing proposed DoD is a review warning, not
// permission to insert unapproved engineering policy into Jira.
const validKey=/^[A-Z][A-Z0-9_]{1,20}-[0-9]{1,12}$/;
function assess(plan=[],register={}){
 const entries=plan.filter(x=>x.action!=='retire');const errors=[],warnings=[],counts={create:0,update:0,retire:0,skip:0,conflict:0};
 for(const item of plan)if(Object.hasOwn(counts,item.action))counts[item.action]++;
 for(const item of entries){
  if(!item.path||!String(item.path).startsWith('BR-'))errors.push({path:item.path||'unknown',problem:'Missing BR traceability path'});
  if(!String(item.title||'').trim())errors.push({path:item.path,problem:'Missing Jira summary'});
  if(item.action==='update'&&!validKey.test(String(item.key||'')))errors.push({path:item.path,problem:'Missing existing Jira key for UPDATE'});
  if(item.kind==='Story'){
   if(!String(item.jiraDetails?.acceptanceCriteria||'').trim())warnings.push({path:item.path,problem:'Review and save Story-specific Acceptance Criteria'});
   if(!String(item.jiraDetails?.definitionOfDone||'').trim())warnings.push({path:item.path,problem:'Review the approved Story Definition of Done template'});
  }
  if(item.staleJiraDetails)errors.push({path:item.path,problem:'Jira details are stale after the approved BR revision'});
 }
 const tracked=Object.entries(register.synced||{}).filter(([,row])=>row?.key).length;
 const modified=new Set(plan.filter(x=>x.action==='update'||x.action==='retire').map(x=>x.path));
 counts.skip=Math.max(0,tracked-modified.size);
 counts.conflict=errors.length;
 return {counts,errors,warnings,eligible:errors.length===0,source:'Approved BR revision and current Jira mapping'};
}
module.exports={assess};
