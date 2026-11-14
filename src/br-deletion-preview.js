'use strict';
// The destructive confirmation is deliberately a concise sample. The complete
// preflight-verified ownership list is made available as a read-only editor.
// No data is omitted from the full preview and no confirmation is skipped.
const SAMPLE_COUNT=8;
const text=value=>String(value??'');
function render({plan,job,ids,source,exclusiveUploadedSources=[],localOwnership={},todo=[]}){
 if(!plan||!Array.isArray(plan.jira)||!Array.isArray(plan.confluence)||!Array.isArray(ids))throw Error('Invalid BR deletion preview plan.');
 const jira=plan.jira,confluence=plan.confluence,branches=plan.gitBranches||[];
 const remaining=jira.filter(row=>job?.results?.['jira:'+row.key]?.status!=='deleted').length;
 const sample=jira.slice(0,SAMPLE_COUNT).map(row=>text(row.key)).join(', ');
 const extra=Math.max(0,jira.length-SAMPLE_COUNT);
 const summary=[
  'DELETE EVERYWHERE — IRREVERSIBLE',
  `Business Requirements: ${ids.join(', ')}`,
  `Jira issues to permanently delete: ${jira.length} (${remaining} remaining)`,
  sample?`Sample Jira keys: ${sample}${extra?` … +${extra} more`:''}`:'NO VERIFIED JIRA LINKS are mapped to the selected BR(s). Other BRs remain unaffected.',
  `Confluence pages to move to Trash: ${confluence.length}`,
  `Exclusive uploaded documents affected: ${exclusiveUploadedSources.length}`,
  `Local artifact issue keys: ${(localOwnership.keys||[]).length}`,
  `Git branches inspected: ${branches.length} (safely eligible only)`,
  'Unrelated Jira items, shared assets and main branch are protected.',
  'Select “View Full Deletion Preview” below to see every record.',
  'A separate typed confirmation is required before deleting.'
 ].join('\n');
 const details=[
  '# Full verified BR deletion preview',
  '',
  `**Business Requirements:** ${ids.join(', ')}`,
  `**Jira issues:** ${jira.length} (${remaining} remaining)`,
  `**Confluence pages:** ${confluence.length}`,
  `**Remote operations still pending:** ${todo.length}`,
  '',
  '## Jira issues (verified descendants first)',
  ...(jira.length?jira.map((row,i)=>`${i+1}. **${text(row.key)}** · ${text(row.issueType)||'Issue'} · ${text(row.nodePath)} · parent: ${text(row.parentKey)||'none'} · ${job?.results?.['jira:'+row.key]?.status==='deleted'?'already deleted':'scheduled'}`):['No mapped Jira issue.']),
  '',
  '## Confluence pages (moved to Trash)',
  ...(confluence.length?confluence.map((row,i)=>`${i+1}. **${text(row.pageId)}** · ${text(row.title)} · ${text(row.brId)}`):['No linked Confluence page.']),
  '',
  '## Uploaded source documents',
  source?`- Selected source: ${text(source.name)}`:'- Original source documents remain unless separately selected.',
  ...(exclusiveUploadedSources.length?exclusiveUploadedSources.map(row=>`- ${text(row.name)} · SHA256 ${text(row.digest)}`):['- No exclusive source document scheduled for removal.']),
  '',
  '## Generated local artifacts',
  `- ${(localOwnership.keys||[]).length} mapped issue keys`,
  '',
  '## Git branches',
  ...(branches.length?branches.map(row=>`- ${text(row.storyKey)}: ${text(row.branch||row.name)||'not available'} · ${text(row.status)||'not eligible'}`):['- No owned feature branches were identified.']),
  ...(plan.gitInspectionError?[`- Inspection warning: ${text(plan.gitInspectionError)}`]:[]),
  '',
  '## Safeguards',
  '- A preview does not authorize deletion.',
  '- Only verified Jira issues are eligible for remote deletion. Other Jira issues, shared assets, Git main and unrelated Confluence content remain protected.',
  '- Return to ATGV and enter the exact confirmation phrase to authorize the listed deletion.',
 ].join('\n');
 return {summary,details};
}
module.exports={render,SAMPLE_COUNT};
