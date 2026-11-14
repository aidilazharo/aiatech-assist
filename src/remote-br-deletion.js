'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {requestJson, baseAtlassian, baseConfluence, getConfluencePage, getConfluenceSpace} = require('./clients');
const {jiraReadIssue, validIssueKey, validProjectKey, remoteFingerprint} = require('./remote-actions');
const {DocumentSync} = require('./confluence-docsync');
const roleTaskRepair = require('./jira-role-task-repair');

const MAX_ISSUES = 250;
const brIdPattern = /^BR-[0-9]+$/;
const markerPattern = /^atgv-[a-f0-9]{24}$/;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function ownsPath(nodePath, brId) { return nodePath === brId || nodePath.startsWith(brId + '/'); }
function assertIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 25 || new Set(ids).size !== ids.length || ids.some(id => !brIdPattern.test(id))) throw Error('Select 1–25 unique Business Requirements.');
  return [...ids].sort();
}
function assertRegister(register, ids) {
  const wanted = assertIds(ids);
  if (wanted.some(id => !(register.brs || []).some(br => br.id === id))) throw Error('The selected Business Requirement has changed or was removed.');
  if (Object.keys(register.pending || {}).some(nodePath => wanted.some(id => ownsPath(nodePath, id)))) throw Error('Pending Jira publication must be reconciled before Delete Everywhere.');
  if (Object.keys(register.roleTaskPending || {}).some(nodePath => wanted.some(id => ownsPath(nodePath, id)))) throw Error('Pending Jira role-subtask creation must be reconciled before Delete Everywhere.');
  if ((register.changeQueue || []).some(entry => entry.status === 'pending' && (entry.targetIds || []).some(nodePath => wanted.some(id => ownsPath(nodePath, id))))) throw Error('Pending BR change proposals must be resolved before remote deletion.');
  return wanted;
}
function getJiraRows(register, ids, config) {
  const projectKey = validProjectKey(config.get('jira.projectKey'));
  const reconciledPaths=new Set((register.jiraLinkReconciliations||[]).flatMap(entry=>(entry.rows||[]).map(row=>row.nodePath)));
  const reconciledKeys=new Set((register.jiraLinkReconciliations||[]).flatMap(entry=>(entry.rows||[]).map(row=>row.key)));
  const synced=register.synced||{}, role=register.roleTaskMappings||{};
  const allMappings=[...Object.entries(synced),...Object.entries(role)];
  const seen = new Map(), rows=[];
  for (const [nodePath,item] of Object.entries(synced).filter(([p])=>ids.some(id=>ownsPath(p,id)))) {
    const key=validIssueKey(item?.key);
    if(seen.has(key))throw Error(`Jira key ${key} is linked more than once. Resolve mappings before deletion.`);
    seen.set(key,nodePath);
    if(!markerPattern.test(String(item?.marker||'')))throw Error(`${nodePath} lacks a verified ATGV Jira marker; deletion is blocked.`);
    if(!item?.remoteDigest)throw Error(`${nodePath} lacks a trusted Jira publication baseline; deletion is blocked.`);
    if(key.split('-')[0]!==projectKey)throw Error(`Jira ${key} is outside the configured project.`);
    if(allMappings.some(([p,other])=>!ids.some(id=>ownsPath(p,id))&&other?.key===key))throw Error(`Jira ${key} is shared by an unrelated BR.`);
    const ancestorPath=nodePath.includes('/')?nodePath.slice(0,nodePath.lastIndexOf('/')):'';
    const parentKey=ancestorPath?String(synced[ancestorPath]?.key||''):'';
    if(ancestorPath&&!parentKey&&!reconciledPaths.has(ancestorPath))throw Error(`Parent Jira mapping missing for ${nodePath}.`);
    rows.push({kind:'jira',nodePath,key,marker:item.marker,remoteDigest:item.remoteDigest,issueType:item.issueType||'',parentKey,projectKey,depth:nodePath.split('/').length});
  }
  // Repair-created role subtasks are kept outside `synced` in historical
  // projects. They MUST be removed before their parent Jira Feature/Story.
  for(const brId of ids) {
    const roleEntries=Object.entries(role).filter(([p])=>ownsPath(p,brId));
    if(!roleEntries.length)continue;
    const expected=new Map(roleTaskRepair.plan(register,brId).map(row=>[row.path,row]));
    for(const [nodePath,item] of roleEntries){
      const key=validIssueKey(item?.key),planned=expected.get(nodePath);
      if(!planned||!item?.marker||!markerPattern.test(item.marker)||!item.roleLabel||item.roleLabel!==planned.roleLabel||
          item.storyKey!==planned.storyKey||item.parentKey!==planned.parentKey)throw Error(`Role-task mapping ${nodePath} cannot be verified; reconcile before deletion.`);
      if(key.split('-')[0]!==projectKey)throw Error(`Role-task Jira ${key} is outside the configured project.`);
      if(allMappings.some(([p,other])=>!ids.some(id=>ownsPath(p,id))&&other?.key===key))throw Error(`Jira ${key} is shared by an unrelated BR.`);
      if(seen.has(key)){
        if(seen.get(key)!==nodePath||synced[nodePath]?.marker!==item.marker)throw Error(`Conflicting Jira mappings for ${key}.`);
        continue;
      }
      seen.set(key,nodePath);
      rows.push({kind:'jira',nodePath,key,marker:item.marker,remoteDigest:item.remoteDigest||'',
        issueType:'Sub-task',roleLabel:item.roleLabel,expectedSummary:planned.title,
        roleVerifiedLegacy:!item.remoteDigest,parentKey:planned.parentKey,projectKey,depth:nodePath.split('/').length});
    }
  }
  if (!rows.length && (register.completedCycles||[]).some(cycle=>(cycle.requirements||[]).some(br=>ids.includes(br.id)&&[br.jiraKey,...(br.jiraIssues||[]).map(issue=>issue.key)].filter(Boolean).some(key=>!reconciledKeys.has(key))))) throw Error('Published Jira issues lack trusted mapping. Reconcile before deletion.');
  if(rows.length>MAX_ISSUES)throw Error('Remote Jira deletion exceeds the safe batch limit.');
  return rows.sort((a,b)=>b.depth-a.depth||a.key.localeCompare(b.key));
}
function assertJiraIdentity(row, issue) {
  const f = issue?.fields || {};
  if (issue?.key !== row.key || f.project?.key !== row.projectKey || !Array.isArray(f.labels) || !f.labels.includes(row.marker)) throw Error(`Jira ${row.key} ownership marker, key, or project has changed.`);
  if (row.issueType && String(f.issuetype?.name || '').toLowerCase() !== row.issueType.toLowerCase()) throw Error(`Jira ${row.key} issue type has changed.`);
  if(row.roleVerifiedLegacy){
    // Historical repair records lack a remote fingerprint. Require the original
    // one-off marker, SDLC role label, exact generated summary and parent.
    if(!f.labels.includes(row.roleLabel)||f.summary!==row.expectedSummary||String(f.parent?.key||'')!==row.parentKey)
      throw Error(`Jira ${row.key} repaired role task changed outside ATGV; manual reconciliation required.`);
  }else if (remoteFingerprint(issue) !== row.remoteDigest) throw Error(`Jira ${row.key} content was changed outside ATGV. Reconcile before deleting.`);
  // Parent is a hierarchy attribute, not proof of ownership. A Jira issue may
  // have been reparented or flattened since ATGV published it. Deleting the
  // explicitly selected, marker-verified issue does not delete its parent.
  // Child safety and verified ownership are checked separately before DELETE.
}
function auth(config,token) {
  if (!token) throw Error('Atlassian credentials with deletion permission are required.');
  return {token,basicEmail:String(config.get('jira.email') || '').trim()};
}
async function childrenOfJira(config,token,key,request=requestJson) {
  const result = new Set(); let nextPageToken;
  for (let p=0; p<5; p++) {
    const data={jql:`parent = ${validIssueKey(key)}`,maxResults:100,fields:['parent','project']};
    if (nextPageToken) data.nextPageToken=nextPageToken;
    const res=await request(`${baseAtlassian(config)}/rest/api/3/search/jql`,{...auth(config,token),method:'POST',data});
    if (!Array.isArray(res.issues)) throw Error(`Jira child listing is incomplete for ${key}.`);
    for (const issue of res.issues) {
      if (!issue?.key) throw Error('Jira returned an unnamed child issue.');
      result.add(issue.key);
      if (result.size>MAX_ISSUES) throw Error('Too many child Jira issues to delete safely.');
    }
    if (res.isLast === true || !res.nextPageToken) return [...result];
    nextPageToken=res.nextPageToken;
  }
  throw Error(`Jira child listing exceeds the pagination safety limit for ${key}.`);
}
async function checkJiraChildren(config,token,row,allowed,request=requestJson) {
  const children=await childrenOfJira(config,token,row.key,request);
  const unknown=children.filter(key=>!allowed.has(key));
  if (unknown.length) throw Error(`Jira ${row.key} has unmapped child issue(s): ${unknown.join(', ')}. Reconcile them before deletion.`);
}
function assertPageIdentity(row,page,spaceId) {
  if (String(page?.id || '') !== row.pageId || String(page?.spaceId || '') !== String(spaceId) || page?.title !== row.title || page?.status !== 'current') throw Error(`Confluence page ${row.pageId} identity, space or status has changed.`);
  if (Number(page?.version?.number || 0) !== row.version) throw Error(`Confluence page ${row.pageId} was edited since the last sync. Review before deletion.`);
}
async function assertNoPageChildren(config,token,pageId,request=requestJson) {
  const data=await request(`${baseConfluence(config)}/api/v2/pages/${pageId}/children?limit=1`,auth(config,token));
  if (!Array.isArray(data.results)) throw Error(`Confluence child list unavailable for page ${pageId}.`);
  if (data.results.length || data._links?.next) throw Error(`Confluence page ${pageId} has child content. Move/review children before deletion.`);
}
async function readMapping(folder,config,token) {
  return new DocumentSync({folder,config,token}).read();
}
async function preflight({register,brIds,config,token,projectId,folder,request=requestJson,readJira=jiraReadIssue,getPage=getConfluencePage,getSpace=getConfluenceSpace,readLinks=readMapping,onProgress=async()=>{}}) {
  const ids=assertRegister(register,brIds);
  const jira=getJiraRows(register,ids,config);
  const allowed=new Set(jira.map(row=>row.key));
  const mapping=await readLinks(folder,config,token);
  const hasLinkedPages=ids.some(brId=>!!mapping.entries?.[`approved-brs/${brId}.md`]);
  const space=hasLinkedPages?await getSpace(config,token):null;
  const confluence=[];const pageIds=new Set();
  for (const brId of ids) {
    const relative=`approved-brs/${brId}.md`;
    const entry=mapping.entries?.[relative];
    if (!entry) continue;
    if (!/^\d+$/.test(String(entry.pageId || '')) || String(entry.spaceId) !== String(space.id)) throw Error(`Confluence mapping is unsafe for ${brId}.`);
    if (pageIds.has(String(entry.pageId))) throw Error('Confluence page is shared by multiple BRs.');
    if (Object.entries(mapping.entries || {}).some(([key,other]) => key !== relative && String(other.pageId || '') === String(entry.pageId))) throw Error(`Confluence page ${entry.pageId} is shared with another document.`);
    pageIds.add(String(entry.pageId));
    confluence.push({kind:'confluence',brId,pageId:String(entry.pageId),spaceId:String(space.id),title:String(entry.title),version:Number(entry.version)});
  }
  for (const [index,row] of jira.entries()) {
    await onProgress({phase:'jira',done:index,total:jira.length+confluence.length,key:row.key});
    const issue=await readJira(config,token,row.key);
    assertJiraIdentity(row,issue);
    row.observedParentKey=String(issue.fields?.parent?.key || '');
    row.parentChanged=row.observedParentKey!==row.parentKey;
    await checkJiraChildren(config,token,row,allowed,request);
  }
  for (const [index,row] of confluence.entries()) {
    await onProgress({phase:'confluence',done:jira.length+index,total:jira.length+confluence.length,key:row.pageId});
    const page=await getPage(config,token,row.pageId);
    assertPageIdentity(row,page,space.id);
    await assertNoPageChildren(config,token,row.pageId,request);
  }
  const site=baseAtlassian(config);
  const plan={schema:1,atgvProjectId:projectId,brIds:ids,registerRevision:register.revision,site,jiraProject:validProjectKey(config.get('jira.projectKey')),confluenceSpaceId:space?String(space.id):'',jira,confluence,createdAt:new Date().toISOString()};
  plan.fingerprint=digest({projectId,brIds:ids,revision:plan.registerRevision,site,jira,confluence});
  return plan;
}
function journalFile(registry,projectId) { return path.join(path.dirname(registry.fileFor(projectId)),'documents','requirements','remote-deletion-jobs.json'); }
async function readJobs(registry,projectId) {
  const file=journalFile(registry,projectId);
  const st=await fs.lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if (!st) return {schema:1,jobs:[]};
  if (!st.isFile() || st.isSymbolicLink()) throw Error('Unsafe deletion journal.');
  const value=JSON.parse(await fs.readFile(file,'utf8'));
  if (value.schema!==1 || !Array.isArray(value.jobs)) throw Error('Invalid remote deletion journal.');
  return value;
}
async function saveJobs(registry,projectId,state) {
  const file=journalFile(registry,projectId),dir=path.dirname(file);
  await fs.mkdir(dir,{recursive:true});
  const st=await fs.lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) throw Error('Unsafe deletion journal directory.');
  const tmp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try { await fs.writeFile(tmp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});await fs.rename(tmp,file); }
  finally { await fs.rm(tmp,{force:true}); }
}
function unresolvedJob(state,brIds) {
  const ids=assertIds(brIds);
  const jobs=(state.jobs || []).filter(j=>j.status!=='completed' && j.brIds?.some(id=>ids.includes(id)));
  if (jobs.length>1 || jobs.some(j=>JSON.stringify(j.brIds)!==JSON.stringify(ids))) throw Error('An overlapping remote deletion is unfinished. Complete or reconcile that job first.');
  return jobs[0] || null;
}
function createJob(plan,actor) {
  return {id:crypto.randomUUID(),status:'pending',brIds:plan.brIds,plan,actor,createdAt:new Date().toISOString(),results:{},lastError:'',finalized:false};
}
const recordId=row=>row.kind==='jira'?'jira:'+row.key:'confluence:'+row.pageId;
async function execute({registry,projectId,job,config,token,loadRegister,finalize,request=requestJson,readJira=jiraReadIssue,getPage=getConfluencePage,getSpace=getConfluenceSpace,onProgress=async()=>{}}) {
  const state=await readJobs(registry,projectId);
  const saved=state.jobs.find(j=>j.id===job.id);
  if (!saved) throw Error('Deletion job does not exist. Restart the preview.');
  const plan=saved.plan;
  if (saved.status==='completed') return saved;
  const all=[...plan.confluence,...plan.jira];
  const allowed=new Set(plan.jira.map(row=>row.key));
  const save=async()=>{await saveJobs(registry,projectId,state);};
  const verifyScope=async()=>{
    if (baseAtlassian(config)!==plan.site || validProjectKey(config.get('jira.projectKey'))!==plan.jiraProject) throw Error('Jira target changed since deletion approval.');
    const current=await loadRegister();
    if (current.revision!==plan.registerRevision) throw Error('BR register changed during remote deletion. Manual reconciliation is required.');
    assertRegister(current,plan.brIds);
    const actual=getJiraRows(current,plan.brIds,config).map(r=>r.key).sort();
    if (JSON.stringify(actual)!==JSON.stringify(plan.jira.map(r=>r.key).sort())) throw Error('Jira mapping changed during remote deletion.');
    return current;
  };
  try {
    for (const row of all) {
      const id=recordId(row);
      if (saved.results[id]?.status==='deleted') continue;
      if (saved.results[id]?.status==='attempting') throw Error(`${id} has an interrupted delete attempt. Verify its remote state manually before retrying.`);
      await verifyScope();
      if (row.kind==='confluence') {
        const space=await getSpace(config,token);
        if (String(space.id)!==row.spaceId) throw Error('Confluence space changed since deletion approval.');
        const page=await getPage(config,token,row.pageId);
        assertPageIdentity(row,page,row.spaceId);
        await assertNoPageChildren(config,token,row.pageId,request);
      } else {
        const remote=await readJira(config,token,row.key);
        assertJiraIdentity(row,remote);
        // Reject *new* hierarchy changes after the destructive plan was reviewed.
        // Changes already present in the preview are permitted when ownership
        // and the set of removable descendants remain verified.
        if (String(remote.fields?.parent?.key || '') !== String(row.observedParentKey ?? row.parentKey))
          throw Error(`Jira ${row.key} parent changed after deletion preview. Restart the preview.`);
        await checkJiraChildren(config,token,row,allowed,request);
      }
      saved.results[id]={status:'attempting',at:new Date().toISOString()};await save();
      const url=row.kind==='jira'?`${baseAtlassian(config)}/rest/api/3/issue/${encodeURIComponent(row.key)}?deleteSubtasks=false`:`${baseConfluence(config)}/api/v2/pages/${encodeURIComponent(row.pageId)}`;
      try { await request(url,{...auth(config,token),method:'DELETE'}); }
      catch (error) {
        // A definite client rejection means the server did not accept deletion.
        // Network loss and server errors may be ambiguous: do not blindly retry.
        if (/HTTP (400|401|403|404|409|412|429)\b/.test(String(error.message || error))) saved.results[id]={status:'failed',at:new Date().toISOString(),reason:String(error.message || error).slice(0,250)};
        await save();
        throw error;
      }
      saved.results[id]={status:'deleted',at:new Date().toISOString()};
      await save();await onProgress({record:id,deleted:Object.values(saved.results).filter(v=>v.status==='deleted').length,total:all.length});
    }
    await verifyScope();
    if (!saved.finalized) {
      // This is the only place that may delete local BRs. It runs only after all remote deletes were acknowledged.
      await finalize(plan);
      saved.finalized=true;
    }
    saved.status='completed';saved.completedAt=new Date().toISOString();saved.lastError='';await save();
    return saved;
  } catch (error) {
    saved.status='partial';saved.lastError=String(error.message || error).slice(0,1200);await save();
    throw error;
  }
}
module.exports={assertRegister,preflight,execute,readJobs,saveJobs,unresolvedJob,createJob,getJiraRows,assertJiraIdentity,childrenOfJira,checkJiraChildren,assertNoPageChildren,recordId};
