'use strict';
// Read-only Jira role prerequisite queries and remotely verified Story branches.
// Called before claim and before starting AI Development; no UI-supplied role
// can override the Jira labels, approved design or stack SHA.
const {requestJson,baseAtlassian}=require('./clients');
const {validProjectKey}=require('./remote-actions');
const {storyKey}=require('./jira-role-eligibility');
const {read}=require('./ux-design-pipeline');
const {verifyDeveloperHandoff,publishBackendStory}=require('./git-handoff-coordinator');
function sameStory(issue,key,modern){
 if(modern)return issue.fields?.parent?.key===key;
 const text=JSON.stringify(issue.fields?.description||{});
 return new RegExp('Jira parent Story:\\s*'+key.replace('-','\\-')+'\\b').test(text.replace(/\\n/g,'\\n'));
}
async function uiuxTaskForStory({config,token,story,issue}){
 const projectKey=validProjectKey(config.get('jira.projectKey'));
 const description=typeof issue.fields?.description==='string'?issue.fields.description:JSON.stringify(issue.fields?.description||{});
 const isLegacy=new RegExp('Jira parent Story:\\s*'+story+'\\b').test(description);
 const parent=isLegacy?issue.fields?.parent?.key:story;
 if(!parent)throw Error('Jira Developer subtask is missing its parent Story.');
 const result=await requestJson(`${baseAtlassian(config)}/rest/api/3/search/jql`,{token,basicEmail:config.get('jira.email'),method:'POST',data:{jql:`project = "${projectKey}" AND parent = "${parent}" AND labels = "atgv-role-ux-designer"`,maxResults:100,fields:['parent','description','labels','project','status']}});
 if(result.nextPageToken&&!result.isLast)throw Error('More than 100 related UI/UX tasks exist. Narrow the Story before proceeding.');
 return (result.issues||[]).filter(item=>item.fields?.project?.key===projectKey&&sameStory(item,story,!isLegacy));
}
async function ensureDeveloperReady({config,token,issue,project,root,aiRoot}){
 const role=require('./jira-role-eligibility');
 role.requireRole(issue,'software-developer',validProjectKey(config.get('jira.projectKey')));
 if(!Array.isArray(issue.fields?.labels)||!issue.fields.labels.includes('atgv-role-software-developer'))return null;
 const description=typeof issue.fields.description==='string'?issue.fields.description:JSON.stringify(issue.fields?.description||{});
 const story=storyKey(issue,description),approval=project?.techStackApproval;
 if(!approval?.remoteVerified||approval.sha!==approval.remoteSha)throw Error('Solution Architect has not published the approved technology-stack SHA.');
 const tasks=await uiuxTaskForStory({config,token,story,issue});
 if(tasks.length>1)throw Error('Multiple UI/UX role tasks for one Story require reviewed design reconciliation.');
 if(tasks.length){
  const ux=await read(aiRoot,tasks[0].key);
  if(ux.status!=='approved'||ux.sourceStoryKey!==story)throw Error('The parent Story UI/UX design is not yet approved.');
  const remote=await verifyDeveloperHandoff({root,storyKey:story,designKey:ux.key,designRevision:ux.revisionNumber,approvedStackSha:approval.sha});
  return {storyKey:story,branch:remote.branch,sha:remote.sha,designRequired:true,designKey:ux.key};
 }
 const backend=await publishBackendStory({root,storyKey:story,approvedStackSha:approval.sha});
 return {storyKey:story,branch:backend.branch,sha:backend.sha,designRequired:false};
}
module.exports={sameStory,uiuxTaskForStory,ensureDeveloperReady};
