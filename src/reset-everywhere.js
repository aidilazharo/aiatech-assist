'use strict';
/**
 * Destructive ATGV Reset planning. Remote candidates MUST originate from the
 * trusted BR/Confluence mapping and pass remote-br-deletion.preflight; never
 * search Jira for an entire project and delete the results.
 */
const path=require('node:path');
const MAX_REQUIREMENTS=25;
function registeredIds(register){
 const ids=(register?.brs||[]).map(row=>String(row?.id||''));
 if(ids.some(id=>!/^BR-[0-9]+$/.test(id))||new Set(ids).size!==ids.length)
  throw Error('Business Requirement register has invalid or duplicate identities. Repair it before resetting.');
 if(ids.length>MAX_REQUIREMENTS)throw Error(`Reset includes ${ids.length} Business Requirements; safely delete some requirements first (maximum ${MAX_REQUIREMENTS} in one verified remote deletion).`);
 const owned=new Set(ids);
 for(const node of Object.keys(register?.synced||{})){
  if(!ids.some(id=>node===id||node.startsWith(id+'/')))
   throw Error(`Unmapped Jira publication ${node} exists. Reconcile it before Reset.`);
 }
 return ids.sort();
}
function approvedLinks(links,ids){
 const result=[];
 for(const [key,value] of Object.entries(links?.entries||{})){
  if(!key.startsWith('approved-brs/'))continue;
  const match=/^approved-brs\/(BR-[0-9]+)\.md$/.exec(key);
  if(!match||!ids.includes(match[1]))throw Error(`Unlinked approved Confluence page ${key}. Reconcile before Reset.`);
  result.push({key,pageId:String(value?.pageId||'')});
 }
 return result;
}
function checkPlanScope(items){
 const jira=new Set(),confluence=new Set();
 for(const item of items){
  if(!item.project?.id)throw Error('Reset plan contains an unidentified project.');
  for(const record of item.plan?.jira||[]){
   const id=`${item.plan.site}|${record.key}`;
   if(jira.has(id))throw Error(`Jira issue ${record.key} is linked to multiple projects. Reconcile before Reset.`);
   jira.add(id);
  }
  for(const record of item.plan?.confluence||[]){
   const id=`${item.plan.site}|${record.pageId}`;
   if(confluence.has(id))throw Error(`Confluence page ${record.pageId} is linked to multiple projects. Reconcile before Reset.`);
   confluence.add(id);
  }
 }
 return {jira:jira.size,confluence:confluence.size};
}
function preview(items,root){
 const counts=checkPlanScope(items);
 const lines=[
  'ATGV RESET — IRREVERSIBLE PROJECT DELETION',
  `Local directory: ${root}`,
  'Delete all local projects, uploaded/archived source files, Business Requirements, generated artifacts, local repository clones and their LOCAL Git branches.',
  'Clear ATGV extension settings, caches and saved credentials.',
  `Delete ${counts.jira} mapped, ownership-verified Jira issues permanently and move ${counts.confluence} mapped Confluence BR pages to Trash.`,
  'Unrelated Jira issues, Confluence pages, GitHub repositories, remote branches and pull requests are NOT deleted.',
  'Uncommitted files and local commits/branches stored ONLY in the project folder will be lost.',
  'No remote request is made until you confirm and type the exact reset phrase.',
 ];
 for(const item of items){
  lines.push('',`PROJECT: ${item.project.name||item.project.id} [${item.project.id}]`);
  lines.push(`  Business Requirements: ${item.ids.join(', ')||'none'}`);
  lines.push(`  Jira: ${(item.plan?.jira||[]).map(r=>r.key).join(', ')||'none'}`);
  lines.push(`  Confluence: ${(item.plan?.confluence||[]).map(r=>r.pageId).join(', ')||'none'}`);
  lines.push(`  Local checkout: ${path.join(root,item.project.id)} (removed with project folder)`);
 }
 const message=lines.join('\n');
 if(message.length>9500)throw Error('Full reset deletion preview exceeds safe dialog size. Delete a smaller project scope first.');
 return message;
}
module.exports={registeredIds,approvedLinks,checkPlanScope,preview};
