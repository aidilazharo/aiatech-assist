'use strict';
// Non-destructive role-subtask repair for published historical and current BRs.
// Existing Jira Story subtasks cannot contain nested subtasks, so generated role
// subtasks are siblings under the existing Feature, with an explicit Story key.
const crypto=require('node:crypto');
const {safeKey}=require('./developer-task-artifacts');
const {sha}=require('./utils');
const ROLES=Object.freeze({
 'uiux':{role:'UI/UX Designer',label:'atgv-role-ux-designer',title:'UI/UX Design'},
 'developer':{role:'Developer',label:'atgv-role-software-developer',title:'Development'},
 'qa':{role:'QA Engineer',label:'atgv-role-qa-engineer',title:'QA Verification'},
 'uat':{role:'UAT Tester',label:'atgv-role-uat-tester',title:'User Acceptance Testing'}
});
function isVisual(text){return /\b(dashboard|user interface|ui\/ux|screen|page|wireframe|mockup|form|navigation|frontend|front.end|responsive|modal|button|visual|web app|user journey|table view|user portal|mobile app|search filter)\b/i.test(text);}
function isTechnical(text){return /\b(api|database|sql|backend|service|infrastructure|server|migration|integration|endpoint|batch|pipeline|algorithm|data processing|security policy)\b/i.test(text);}
function applicable(story,feature){
 const text=[story.title,story.description].join(' ').trim()||[feature.title,feature.description].join(' ');
 const uiux=isVisual(text),technical=isTechnical(text);
 return ['developer','qa',...(uiux?['uiux']:[]),...(uiux||!technical?['uat']:[])].sort((a,b)=>['uiux','developer','qa','uat'].indexOf(a)-['uiux','developer','qa','uat'].indexOf(b));
}
function approvedBR(register,brId){
 const br=(register.brs||[]).find(x=>x.id===brId&&x.approvedContent&&x.status==='approved');
 if(br)return br.approvedContent;
 for(const cycle of [...(register.completedCycles||[])].reverse()){
  const record=(cycle.requirements||[]).find(x=>x.id===brId&&x.approvedContent);
  if(record)return record.approvedContent;
 }
 throw Error('No approved Business Requirement source is available for '+brId+'. Nothing was changed.');
}
function originalKey(register,path){
 const mapped=register.synced?.[path]?.key;
 if(mapped)return safeKey(mapped);
 for(const cycle of [...(register.completedCycles||[])].reverse()){
  for(const br of cycle.requirements||[])for(const item of br.jiraIssues||[]){if(item.path===path&&item.key)return safeKey(item.key);}
 }
 for(const item of register.completedIndex||[])for(const issue of item.jiraIssues||[]){if(issue.path===path&&issue.key)return safeKey(issue.key);}
 return '';
}
function plan(register,brId){
 const content=approvedBR(register,brId),rows=[];
 const brRecord=(register.brs||[]).find(x=>x.id===brId)||(register.completedCycles||[]).flatMap(x=>x.requirements||[]).find(x=>x.id===brId);
 const modern=brRecord?.jiraHierarchyVersion===2;
 const epicKey=originalKey(register,brId);
 if(!epicKey)throw Error('BR '+brId+' is not published to Jira. Publish the BR before repairing its role subtasks.');
 for(const [fi,feature] of (content.features||[]).entries()){
  const featurePath=brId+'/'+(feature.id||'F-'+(fi+1)),parentKey=originalKey(register,featurePath);
  if(!parentKey)throw Error('The Jira Feature mapping is missing for '+featurePath+'. Reconcile published Jira links before repairing role tasks.');
  for(const [si,story] of (feature.stories||[]).entries()){
   const storyPath=featurePath+'/'+(story.id||'S-'+(si+1)),storyKey=originalKey(register,storyPath);
   if(!storyKey)throw Error('The published Jira Story is missing for '+storyPath+'. Reconcile its Jira mapping before repair.');
   for(const roleId of applicable(story,feature)){
    const role=ROLES[roleId],path=storyPath+'/ROLE-'+roleId.toUpperCase();
    rows.push({path,brId,storyPath,storyKey,parentKey:modern?storyKey:parentKey,epicKey,modern,roleId,role:role.role,roleLabel:role.label,
     title:role.title+' — '+story.title.slice(0,170),
     description:[`ATGV SDLC role: ${role.role}`,`Jira parent Story: ${storyKey}`,`Approved Business Requirement: ${brId}`,`BR story identity: ${storyPath}`,'',story.description||story.title,
      '',`Role deliverable: ${role.title}. Preserve original Story and existing tasks.`,
      '',`Traceability: ${brId} / ${storyPath}`].join('\n').slice(0,9000),
     mapping:register.roleTaskMappings?.[path]?.key||register.synced?.[path]?.key||''});
   }
  }
 }
 if(rows.length>400)throw Error('Too many role tasks for a single BR; split the repair into a reviewed plan.');
 return rows;
}
function digestPlan(rows){return sha(JSON.stringify(rows.map(r=>[r.path,r.parentKey,r.storyKey,r.roleId,r.title,r.description,r.mapping])));}
function validateRemote(remote,row,projectKey,marker,{strictContent=false}={}){
 if(!remote?.key||remote.fields?.project?.key!==projectKey)throw Error('Unexpected remote Jira project or missing issue.');
 if(remote.fields?.parent?.key!==row.parentKey)throw Error('Remote Jira role task parent changed: '+remote.key);
 if(!remote.fields?.issuetype?.subtask&&!/sub.?task/i.test(String(remote.fields?.issuetype?.name||'')))throw Error('Existing Jira role item is not a subtask: '+remote.key);
 if(!Array.isArray(remote.fields?.labels)||!remote.fields.labels.includes(marker)||!remote.fields.labels.includes(row.roleLabel))throw Error('Jira role task metadata is missing for '+remote.key);
 if(strictContent&&(remote.fields?.summary!==row.title))throw Error('Published role task summary differs from the planned role: '+remote.key);
 return true;
}
async function begin(registry,projectId,brWorkflow,row,marker,actor){
 let state=await brWorkflow.load(registry,projectId);
 return brWorkflow.write(registry,projectId,state.revision,next=>{
  next.roleTaskPending=next.roleTaskPending||{};
  const old=next.roleTaskPending[row.path];
  if(old?.attempted)throw Error('Previous Jira creation may have succeeded. Reconcile Jira before retrying '+row.path);
  if(next.roleTaskMappings?.[row.path])throw Error('Role task already has a Jira mapping: '+row.path);
  next.roleTaskPending[row.path]={marker,startedAt:new Date().toISOString(),attempted:true,actor:String(actor||'').slice(0,140)};
 });
}
async function record(registry,projectId,brWorkflow,row,key,marker,actor){
 const valid=safeKey(key),state=await brWorkflow.load(registry,projectId);
 return brWorkflow.write(registry,projectId,state.revision,next=>{
  next.roleTaskMappings=next.roleTaskMappings||{};next.roleTaskPending=next.roleTaskPending||{};
  const previous=next.roleTaskMappings[row.path];
  if(previous?.key&&previous.key!==valid)throw Error('Role task mapping conflicts with previously published Jira work: '+row.path);
  next.roleTaskMappings[row.path]={key:valid,marker,roleId:row.roleId,roleLabel:row.roleLabel,storyKey:row.storyKey,parentKey:row.parentKey,
   brId:row.brId,recordedAt:new Date().toISOString(),recordedBy:String(actor||'').slice(0,140)};
  delete next.roleTaskPending[row.path];
  next.events=(next.events||[]).concat({at:new Date().toISOString(),action:'jira-role-task-repaired',path:row.path,key:valid}).slice(-200);
 });
}
module.exports={ROLES,isVisual,isTechnical,applicable,approvedBR,originalKey,plan,digestPlan,validateRemote,begin,record};
