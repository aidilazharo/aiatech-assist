'use strict';
// PM Jira assignee planning and safe updates. Jira is authoritative for the
// caller's ASSIGN_ISSUES permission and the selected user's assignability.
// A BR/Epic transfer covers development work only; role-specific tasks for
// UI/UX, QA, UAT, BA, architecture or other roles remain unchanged.
const KEY=/^[A-Z][A-Z0-9_]{1,20}-[1-9][0-9]*$/;
const ACCOUNT=/^[^\s<>]{1,240}$/;
function issueKey(value){const key=String(value||'').toUpperCase();if(!KEY.test(key))throw Error('Invalid Jira issue key.');return key;}
function group(type){
 const name=String(type||'').trim().toLowerCase().replace(/[\s_-]+/g,' ');
 if(/^(?:br|business requirement|business requirements)$/.test(name))return 'br';
 if(name==='epic')return 'epic';
 if(/^(?:story|stories|user story|user stories)$/.test(name))return 'story';
 return 'other';
}
const DEV_LABEL='atgv-role-software-developer';
const ROLE_LABELS=Object.freeze({
 'atgv-role-software-developer':'Developer',
 'atgv-role-ux-designer':'UI/UX Designer',
 'atgv-role-qa-engineer':'QA Engineer',
 'atgv-role-uat-tester':'UAT Tester',
 'atgv-role-business-analyst':'Business Analyst',
 'atgv-role-solution-architect':'Solution Architect',
 'atgv-role-project-manager':'Project Manager'
});
function roleForIssue(issue,register){
 if(!issue)return '';
 const labels=(Array.isArray(issue.labels)?issue.labels:[]).map(s=>String(s).toLowerCase()).filter(s=>s.startsWith('atgv-role-'));
 if(new Set(labels).size>1)return '';
 if(labels.length)return ROLE_LABELS[labels[0]]||'';
 const key=String(issue.key||'').toUpperCase();
 const mapped=[...Object.entries(register?.roleTaskMappings||{}),...Object.entries(register?.synced||{})].find(([,row])=>String(row?.key||'').toUpperCase()===key);
 if(mapped){
  const role=String(mapped[1].roleId||'').toLowerCase(),path=mapped[0].toUpperCase();
  if(role==='uiux'||role==='ux-designer'||path.endsWith('/ROLE-UIUX'))return 'UI/UX Designer';
  if(role==='qa'||role==='qa-engineer'||path.endsWith('/ROLE-QA'))return 'QA Engineer';
  if(role==='uat'||role==='uat-tester'||path.endsWith('/ROLE-UAT'))return 'UAT Tester';
  if(role==='developer'||role==='software-developer'||path.endsWith('/ROLE-DEVELOPER'))return 'Developer';
  if(/\/ROLE-/.test(path))return '';
 }
 const summary=String(issue.summary||'');
 if(/^\s*(?:UI\/UX Design|UI Design|UX Design|Wireframe|Mockup)\s*(?:[-—:|]|$)/i.test(summary))return 'UI/UX Designer';
 if(/^\s*(?:QA Verification|Quality Assurance|QA Testing)\s*(?:[-—:|]|$)/i.test(summary))return 'QA Engineer';
 if(/^\s*(?:User Acceptance Testing|UAT)\s*(?:[-—:|]|$)/i.test(summary))return 'UAT Tester';
 if(/^\s*(?:Business Analyst|Requirements Analysis|BA Review)\s*(?:[-—:|]|$)/i.test(summary))return 'Business Analyst';
 if(/^\s*(?:Solution Architect|Architecture Review)\s*(?:[-—:|]|$)/i.test(summary))return 'Solution Architect';
 if(/^\s*(?:Project Manager|PMO)\s*(?:[-—:|]|$)/i.test(summary))return 'Project Manager';
 if(['br','epic','story'].includes(group(issue.type)))return 'Developer';
 // Generic Jira Tasks are development work only if their role is known;
 // unlabeled Subtasks must be explicitly classified, not guessed.
 if(String(issue.type||'').toLowerCase()==='task'&&mapped&&/\/task\//i.test(mapped[0]))return 'Developer';
 return '';
}
function rosterCandidates(rows,role){
 if(!role)return [];
 return (Array.isArray(rows)?rows:[]).filter(row=>typeof row.id==='string'&&ACCOUNT.test(row.id)&&
  Array.isArray(row.roles)&&row.roles.some(value=>String(value).trim().toLowerCase()===role.toLowerCase()))
  .map(row=>({accountId:row.id,name:String(row.name||'Jira user').slice(0,140)})).slice(0,400);
}
function excludedRole(issue){
 const labels=(Array.isArray(issue?.labels)?issue.labels:[]).map(v=>String(v).toLowerCase());
 const other=labels.find(s=>s.startsWith('atgv-role-')&&s!==DEV_LABEL);
 if(other)return other;
 const summary=String(issue?.summary||'');
 if(/^\s*(?:UI\/UX Design|UI Design|UX Design|QA Verification|Quality Assurance|User Acceptance Testing|UAT|Business Analyst|Solution Architect|Architecture Review|Project Manager|PMO|Security Review)\s*(?:[-—:|]|$)/i.test(summary))
  return 'role-specific: '+summary.slice(0,45);
 return '';
}
function developable(issue,register){
 return !!issue&&roleForIssue(issue,register)==='Developer';
}
function linkedDevelopmentKeys(register,rootKey){
 const synced=register?.synced||{},roleMappings=register?.roleTaskMappings||{};
 const root=Object.entries(synced).find(([path,item])=>/^BR-\d+$/.test(path)&&String(item?.key||'').toUpperCase()===rootKey);
 if(!root)return {keys:[],rootId:''};
 const rootId=root[0],keys=new Set();
 for(const [path,row] of Object.entries(synced)){
  if(path!==rootId&&!path.startsWith(rootId+'/'))continue;
  if(/\/ROLE-(?!DEVELOPER(?:\/|$))[A-Z0-9_-]+/i.test(path))continue;
  if(row?.key)keys.add(issueKey(row.key));
 }
 for(const [path,row] of Object.entries(roleMappings)){
  if(!path.startsWith(rootId+'/'))continue;
  if(String(row?.roleId||'').toLowerCase()!=='developer'&&!/\/ROLE-DEVELOPER$/i.test(path))continue;
  if(row?.key)keys.add(issueKey(row.key));
 }
 return {keys:[...keys],rootId};
}
function plan({rootKey,items,projectKey,register}){
 const root=issueKey(rootKey),p=String(projectKey||'').toUpperCase();
 if(!/^[A-Z][A-Z0-9_]{1,20}$/.test(p)||!root.startsWith(p+'-'))throw Error('Selected Jira project does not match this issue.');
 if(!Array.isArray(items)||items.length>20000)throw Error('Refresh the full Jira project inventory before assigning.');
 const map=new Map();
 for(const item of items){
  const key=issueKey(item.key);
  if(!key.startsWith(p+'-')||map.has(key))throw Error('Jira inventory has duplicate or foreign-project keys.');
  map.set(key,{...item,key});
 }
 const record=map.get(root);
 if(!record)throw Error('Root issue is missing from the complete Jira inventory. Refresh Jira.');
 if(!['br','epic'].includes(group(record.type)))throw Error('Whole-development assignment applies only to BR and Epic issues.');
 const linked=linkedDevelopmentKeys(register,root);
 const targets=[],excluded=[],orphaned=[];
 for(const item of map.values()){
  let current=item,owned=item.key===root,depth=0;
  const seen=new Set();
  while(!owned&&current?.parentKey&&depth++<30){
   const parent=String(current.parentKey||'').toUpperCase();
   if(seen.has(parent))throw Error('Cyclic Jira parent hierarchy; cannot assign.');
   seen.add(parent);
   if(parent===root){owned=true;break;}
   current=map.get(parent);
  }
  if(!owned&&!linked.keys.includes(item.key))continue;
  if(item.key!==root&&!developable(item,register)){excluded.push({key:item.key,reason:excludedRole(item)||'No verified Developer role'});continue;}
  targets.push({key:item.key,updated:String(item.updated||''),owner:String(item.assigneeId||''),type:item.type});
 }
 for(const key of linked.keys)if(!map.has(key))orphaned.push(key);
 if(orphaned.length)throw Error('Some published BR issues are absent from the Jira inventory: '+orphaned.slice(0,5).join(', ')+'. Refresh or reconcile before assigning.');
 if(!targets.some(x=>x.key===root))throw Error('Root Jira issue could not be validated.');
 targets.sort((a,z)=>a.key===root?-1:z.key===root?1:a.key.localeCompare(z.key));
 if(targets.length>500)throw Error('Assignment affects over 500 Jira issues. Narrow the BR and review the hierarchy first.');
 return {rootKey:root,rootId:linked.rootId,targets,excluded,count:targets.length,excludedCount:excluded.length};
}
async function change({targets,projectKey,accountId,expectedUpdated,readIssue,setAssignee}){
 if(!Array.isArray(targets)||!targets.length||targets.length>500)throw Error('Invalid Jira assignment scope.');
 if(accountId!==null&&(!ACCOUNT.test(String(accountId||''))||String(accountId).length>240))throw Error('Invalid Jira assignee.');
 if(typeof readIssue!=='function'||typeof setAssignee!=='function')throw Error('Jira read/write callbacks are required.');
 const validProject=String(projectKey||'').toUpperCase();
 const original=[];
 const seen=new Set();
 for(const target of targets){
  const key=issueKey(target.key);
  if(seen.has(key))throw Error('Duplicate Jira assignment target.');seen.add(key);
  const issue=await readIssue(key),fields=issue?.fields||{};
  if(issue?.key!==key||fields.project?.key!==validProject)throw Error('Jira issue '+key+' changed project or identity; nothing assigned.');
  if(!String(target.updated||'')||String(fields.updated||'')!==String(target.updated)||key===targets[0].key&&String(fields.updated||'')!==String(expectedUpdated||''))throw Error(key+' was updated after it was loaded. Refresh Jira before assigning.');
  const before=String(fields.assignee?.accountId||'');
  if(before!==String(target.owner||''))throw Error(key+' assignee changed. Refresh Jira before assigning.');
  original.push({key,updated:String(fields.updated||''),owner:before});
 }
 const desired=String(accountId||'');
 const applied=[];
 try{
  for(const prior of original){
   if(prior.owner===desired)continue;
   const latest=await readIssue(prior.key);
   if(latest?.fields?.project?.key!==validProject||String(latest.fields?.updated||'')!==prior.updated||String(latest.fields?.assignee?.accountId||'')!==prior.owner)
    throw Error(prior.key+' changed during assignment.');
   await setAssignee(prior.key,accountId);
   applied.push(prior);
   const verified=await readIssue(prior.key);
   if(String(verified?.fields?.assignee?.accountId||'')!==desired)throw Error(prior.key+' assignment could not be verified.');
  }
 }catch(error){
  const rollbackErrors=[];
  for(const item of [...applied].reverse())try{
   const current=await readIssue(item.key);
   if(String(current?.fields?.assignee?.accountId||'')===desired)await setAssignee(item.key,item.owner||null);
   else rollbackErrors.push(item.key+' changed concurrently');
  }catch(rollback){rollbackErrors.push(item.key+': '+String(rollback.message||rollback));}
  throw Error('Jira assignment failed: '+String(error.message||error)+'. '+(rollbackErrors.length?'Rollback incomplete: '+rollbackErrors.join('; ')+'. Refresh Jira and reconcile.':'Completed updates rolled back.'));
 }
 return {count:original.length,changed:applied.length,accountId:accountId||null};
}
function canAssign(permissionResponse){return permissionResponse?.permissions?.ASSIGN_ISSUES?.havePermission===true;}
module.exports={group,roleForIssue,rosterCandidates,excludedRole,developable,linkedDevelopmentKeys,plan,change,canAssign};
