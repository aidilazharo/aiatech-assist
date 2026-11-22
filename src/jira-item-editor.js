'use strict';
// Optimistic remote Jira editor: only changed fields and permitted transitions.
const {validIssueKey,validProjectKey,adf,remoteFingerprint,jiraReadIssue,jiraReadIssueAllFields,jiraIssueFieldMetadata,jiraAvailableTransitions}=require('./remote-actions');
const {requestJson,baseAtlassian}=require('./clients');
const {editedValues,sameValue,richTextValue,canSet}=require('./jira-field-values');
function cleanDraft({summary,description,transitionId,fieldValues}={}){
 if(typeof summary!=='string'||!summary.trim()||summary.trim().length>254||/\r|\n/.test(summary))throw Error('Summary must be 1–254 characters on one line.');
 if(typeof description!=='string'||description.length>32000)throw Error('Description must be text of at most 32,000 characters.');
 if(transitionId!==undefined&&transitionId!==''&&!/^[0-9]{1,12}$/.test(String(transitionId)))throw Error('Invalid Jira status transition.');
 return {summary:summary.trim(),description:description.replace(/\r\n?/g,'\n'),transitionId:String(transitionId||''),fieldValues};
}
function changedFields(live,draft){
 const fields={};
 if(draft.summary!==String(live.fields?.summary||''))fields.summary=draft.summary;
 if(draft.description!==richTextValue(live.fields?.description))fields.description=adf(draft.description);
 return fields;
}
async function save({config,token,key,expectedUpdated,draft,read=draft?.fieldValues!==undefined?jiraReadIssueAllFields:jiraReadIssue,metadata=jiraIssueFieldMetadata,transitions=jiraAvailableTransitions,request=requestJson}){
 validIssueKey(key);
 const projectKey=validProjectKey(config.get('jira.projectKey'));
 if(!key.startsWith(projectKey+'-'))throw Error('Issue is outside the configured Jira project.');
 if(!token)throw Error('Connect Jira before saving changes.');
 if(!expectedUpdated||typeof expectedUpdated!=='string')throw Error('Jira version unavailable. Refresh the issue before editing.');
 const clean=cleanDraft(draft);
 const latest=await read(config,token,key);
 if(latest.key!==key||latest.fields?.project?.key!==projectKey)throw Error('Jira issue/project identity changed. Refresh before saving.');
 if(String(latest.fields?.updated||'')!==expectedUpdated)throw Error('Jira issue changed since it was opened. Refresh and review the latest version before saving.');
 const fields=changedFields(latest,clean);
 const schema=clean.fieldValues===undefined?null:await metadata(config,token,{key}).catch(error=>{
  if(Object.keys(fields).length||Object.keys(clean.fieldValues||{}).length)throw error;
  return null; // Status-only edits are validated through the Jira transition API.
 });
 const custom=schema?editedValues(schema,clean.fieldValues,latest.fields):{};
 if(schema){
  for(const id of Object.keys(fields)){
   if(!schema.some(field=>field.id===id&&canSet(field)))throw Error('Jira '+id+' is no longer editable. Refresh the issue.');
  }
 }
 Object.assign(fields,custom);
 const contentChanged=Object.keys(fields).length>0;
 let transition;
 if(clean.transitionId){
  const options=await transitions(config,token,key);
  transition=options.find(x=>x.id===clean.transitionId);
  if(!transition)throw Error('Selected Jira workflow transition is no longer available. Refresh and choose a valid status.');
 }
 if(!contentChanged&&!transition)return {key,changed:false,contentChanged:false,statusChanged:false,issue:latest,remoteDigest:remoteFingerprint(latest),summary:String(latest.fields?.summary||''),description:richTextValue(latest.fields?.description),status:String(latest.fields?.status?.name||'')};
 const auth={token,basicEmail:String(config.get('jira.email')||'').trim()};
 let wrote=false;
 try{
  if(contentChanged){await request(`${baseAtlassian(config)}/rest/api/3/issue/${encodeURIComponent(key)}`,{...auth,method:'PUT',data:{fields}});wrote=true;}
  if(transition){await request(`${baseAtlassian(config)}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,{...auth,method:'POST',data:{transition:{id:transition.id}}});wrote=true;}
  const updated=await read(config,token,key);
  if(updated.key!==key||updated.fields?.project?.key!==projectKey||String(updated.fields?.summary||'')!==clean.summary||richTextValue(updated.fields?.description)!==clean.description||transition&&String(updated.fields?.status?.name||'')!==transition.to)throw Error('Jira write completed but verification did not match. Refresh Jira and reconcile before editing again.');
  for(const id of Object.keys(custom)){
   const field=schema.find(row=>row.id===id);
   if(!sameValue(field,custom[id],updated.fields?.[id]))throw Error('Jira saved but could not verify '+field.name+'.');
  }
  return {key,changed:true,contentChanged,editedFieldIds:Object.keys(custom),
   summaryOrDescriptionChanged:Object.hasOwn(fields,'summary')||Object.hasOwn(fields,'description'),statusChanged:!!transition,previousStatus:String(latest.fields?.status?.name||''),status:String(updated.fields?.status?.name||''),issue:updated,remoteDigest:remoteFingerprint(updated),summary:clean.summary,description:clean.description};
 }catch(error){
  if(wrote)throw Error('Jira may have saved part of the edit. '+String(error.message||error)+' Refresh Jira before retrying.');
  throw error;
 }
}
module.exports={cleanDraft,changedFields,save};
