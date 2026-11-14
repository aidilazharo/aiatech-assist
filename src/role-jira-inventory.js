'use strict';
const ownership = require('./br-ownership');
// All visible project issues are shown. Only verified approved BR root Epics
// support atomic whole-BR assignment; descendants stay browse-only.
function enrich(issues,register,accountId){
 const mapped=new Map(), roots=new Map(), brStatuses=new Map();
 for(const br of register?.brs||[]){
  if(br.status!=='approved'||br.needsRefresh||!br.approvedContent)continue;
  brStatuses.set(br.id,br.externalReviewRequired?'Updated':'Completed');
  let scope;try{scope=ownership.tree(register,br.id);}catch{continue;}
  roots.set(scope.rootKey,{brId:br.id,descendantCount:scope.entries.length-1});
  for(const entry of scope.entries)mapped.set(entry.key,br.id);
 }
 return (issues||[]).map(issue=>{
  const root=roots.get(issue.key);
  const brId=mapped.get(issue.key)||mapped.get(issue.parentKey)||'';
  const assigneeId=String(issue.assigneeId||'');
  return {...issue,issueType:issue.type||'Unknown',brId,brStatus:brStatuses.get(brId)||'',brRoot:!!root,
   descendantCount:root?.descendantCount||0,
   mine:!!assigneeId&&assigneeId===accountId,unassigned:!assigneeId,
   scopeSummary:root?`${root.descendantCount+1} linked Jira issues in entire BR`:''};
 });
}
module.exports={enrich};
