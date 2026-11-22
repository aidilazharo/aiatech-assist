'use strict';
const { requestJson, baseAtlassian, githubRepoInfo } = require('./clients');
const { validateUrl, textFromAdf, sha } = require('./utils');
const fieldValues = require('./jira-field-values');
function validProjectKey(raw) { const key = String(raw || '').trim().toUpperCase(); if (!/^[A-Z][A-Z0-9_]{1,20}$/.test(key))
    throw new Error('Invalid Jira project key. Select a valid Jira project in Settings or when generating the Jira preview.'); return key; }
function jiraAuth(config, token) {
    if (!token)
        throw new Error('Jira token required for writes.');
    return { token, basicEmail: String(config.get('jira.email') || '').trim() };
}
function adf(text) { return fieldValues.toRichText(text || ''); }
function validIssueKey(key) { if (!/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(key))
    throw new Error('Invalid Jira issue key.'); return key; }
function validBranch(name) {
    if (typeof name !== 'string' || name.length > 140 || !/^(?:feature|bugfix|hotfix|test)\/[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(name) || name.includes('..') || name.includes('//') || name.endsWith('/') || name.endsWith('.lock'))
        throw new Error('Invalid branch name.');
    return name;
}
// Jira Cloud's create-metadata endpoint can return 404 for either a missing
// Create Issues permission or a token whose authentication/scopes do not apply
// to that endpoint. Diagnose before giving users a misleading "project missing".
async function jiraIssueTypes(config, token) {
    const p = validProjectKey(config.get('jira.projectKey'));
    const site = baseAtlassian(config), auth = jiraAuth(config, token);
    try {
        const types = [], seen = new Set();
        let startAt = 0;
        for (let page = 0; page < 5; page++) {
            const reply = await requestJson(`${site}/rest/api/3/issue/createmeta/${p}/issuetypes?startAt=${startAt}&maxResults=100`, auth);
            const batch = Array.isArray(reply.issueTypes) ? reply.issueTypes : [];
            for (const t of batch) if (t && t.id && !seen.has(t.id)) { types.push(t); seen.add(t.id); }
            startAt += batch.length;
            if (!batch.length || reply.isLast === true || Number.isFinite(Number(reply.total)) && Number(reply.total) > 0 && startAt >= Number(reply.total) || batch.length < 100) break;
        }
        if (!types.length) throw new Error(`Jira returned no creatable issue types in project ${p}. Verify the account has Create Issues permission and issue types are enabled.`);
        return types;
    } catch (error) {
        if (!/HTTP (401|403|404)\b/.test(String(error.message || error))) throw error;
        let perms, project, identity;
        try { identity = await requestJson(`${site}/rest/api/3/myself`, auth); } catch { /* Auth may be rejected. */ }
        try { project = await requestJson(`${site}/rest/api/3/project/${encodeURIComponent(p)}`, auth); } catch { /* No browse access or wrong key. */ }
        try { perms = await requestJson(`${site}/rest/api/3/mypermissions?projectKey=${encodeURIComponent(p)}&permissions=BROWSE_PROJECTS%2CCREATE_ISSUES`, auth); } catch { /* Treat unknown as unknown, never as permission granted. */ }
        const browse = perms?.permissions?.BROWSE_PROJECTS?.havePermission;
        const create = perms?.permissions?.CREATE_ISSUES?.havePermission;
        const actor = String(identity?.displayName || identity?.emailAddress || 'the configured Jira account').slice(0, 120);
        if (browse === false || create === false) {
            const denied = [browse === false ? 'Browse Projects' : '', create === false ? 'Create Issues' : ''].filter(Boolean).join(' and ');
            throw new Error(`Jira project ${p}: ${actor} lacks ${denied} permission. If ${p} is the intended Jira destination, ask a Jira project administrator to grant it. If the project key is wrong, correct the Jira Project Key in ATGV Project Settings; Extension Settings provides only the default. Recheck project permissions before previewing. No Jira issues were created.`, { cause: error });
        }
        // A confirmed Create Issues grant allows the project-scoped issue-type
        // API as a read-only fallback for a broken create-metadata endpoint.
        if (browse === true && create === true && /^\d+$/.test(String(project?.id || ''))) {
            try {
                const types = await requestJson(`${site}/rest/api/3/issuetype/project?projectId=${encodeURIComponent(project.id)}`, auth);
                if (Array.isArray(types) && types.some(t => t?.id)) return types.filter(t => t?.id);
            } catch { /* Preserve actionable original error below. */ }
        }
        const evidence = project?.id ? `Project ${p} exists and is readable` : `Project ${p} could not be verified with this token`;
        throw new Error(`${evidence}, but Jira issue-creation metadata was rejected (${String(error.message).match(/HTTP (401|403|404)/)?.[0] || 'authorization error'}). Check the Jira email/API-token pair, project Browse Projects and Create Issues permissions, and token scope. Scoped Atlassian API tokens may require the api.atlassian.com gateway instead of the site URL; use a compatible standard API token for ATGV's site-URL configuration. No Jira issues were created.`, { cause: error });
    }
}

function jiraFieldMetadata(id,info){
 return {id,name:String(info?.name||id),required:info?.required===true,hasDefaultValue:info?.hasDefaultValue===true,
  schema:info?.schema||{},operations:Array.isArray(info?.operations)?info.operations:[],
  allowedValues:Array.isArray(info?.allowedValues)?info.allowedValues:[],
  defaultValue:info?.defaultValue,writable:info?.writable!==false};
}

async function jiraIssueFieldMetadata(config,token,{issueTypeId,key}={}){
 const site=baseAtlassian(config),auth=jiraAuth(config,token);
 if(key){
  validIssueKey(key);
  const response=await requestJson(site+'/rest/api/3/issue/'+encodeURIComponent(key)+'/editmeta',auth);
  if(!response||!response.fields||typeof response.fields!=='object'||Array.isArray(response.fields))throw Error('Jira edit field metadata is unavailable.');
  return Object.entries(response.fields).map(([id,info])=>jiraFieldMetadata(id,info));
 }
 if(!/^[0-9]+$/.test(String(issueTypeId||'')))throw Error('Select a valid Jira issue type before checking fields.');
 const project=validProjectKey(config.get('jira.projectKey'));
 let startAt=0;const list=[],seen=new Set();
 for(let page=0;page<10;page++){
  const data=await requestJson(site+'/rest/api/3/issue/createmeta/'+encodeURIComponent(project)+'/issuetypes/'+encodeURIComponent(String(issueTypeId))+'?startAt='+startAt+'&maxResults=100',auth);
  const rows=Array.isArray(data.fields)?data.fields:Object.entries(data.fields||{}).map(([id,value])=>({fieldId:id,...value}));
  if(!rows.length)break;
  for(const info of rows){const id=String(info.fieldId||info.key||info.id||'');if(!id||seen.has(id))continue;seen.add(id);list.push(jiraFieldMetadata(id,info));}
  startAt+=rows.length;
  if(data.isLast===true||(Number.isFinite(Number(data.total))&&Number(data.total)>0&&startAt>=Number(data.total))||rows.length<100)break;
 }
 if(!list.length)throw Error('Jira returned no creatable fields for issue type '+issueTypeId+'.');
 return list;
}
async function jiraReadIssueAllFields(config,token,key){
 validIssueKey(key);
 return requestJson(baseAtlassian(config)+'/rest/api/3/issue/'+encodeURIComponent(key)+'?fields=*all',jiraAuth(config,token));
}
function safeExtraFields(extraFields,metadata){
 if(!extraFields||typeof extraFields!=='object'||Array.isArray(extraFields))throw Error('Invalid custom Jira field values.');
 const result={};
 const keys=Object.keys(extraFields);
 if(keys.length>100)throw Error('Too many custom Jira fields.');
 const byId=metadata?new Map(metadata.map(field=>[field.id,field])):null;
 for(const key of keys){
  const value=extraFields[key];
  if(byId){
   const field=byId.get(key);
   if(!field||!fieldValues.isEditable(field))throw Error('Unsafe Jira field ID: '+key);
   if(JSON.stringify(value??null).length>100000)throw Error('Jira field content exceeds safe limit.');
   result[key]=fieldValues.encode(field,fieldValues.editorValue(field,value));
   continue;
  }
  if(!/^customfield_\d+$/.test(key)&&key!=='environment')throw Error('Unsafe Jira field ID: '+key);
  if(typeof value!=='string'&&!(value&&typeof value==='object'&&!Array.isArray(value)&&value.type==='doc'&&value.version===1&&Array.isArray(value.content)))throw Error('Unsupported Jira field value for '+key);
  if(JSON.stringify(value).length>100000)throw Error('Jira field content exceeds safe limit.');
  result[key]=value;
 }
 return result;
}
function resolveJiraIssueType(types, requested) {
    const wanted = String(requested || '').trim().toLowerCase();
    const isSubtask = wanted === 'subtask' || wanted === 'sub-task';
    const found = (types || []).find(type => {
        const name = String(type?.name || '').trim().toLowerCase();
        return isSubtask ? !!type?.subtask && (name === 'subtask' || name === 'sub-task') :
            !type?.subtask && name === wanted;
    });
    if (!found?.id)
        throw new Error(`Issue type ${requested} is unavailable or has an unsupported hierarchy level.`);
    return found;
}
async function jiraCreateIssue(config, token, { summary, description = '', issueType = 'Task', parentKey, marker, issueTypes, extraLabels = [], extraFields = {}, fieldMetadata } = {}) {
    const projectKey = validProjectKey(config.get('jira.projectKey'));
    const types = Array.isArray(issueTypes) && issueTypes.length ? issueTypes : await jiraIssueTypes(config, token);
    const type = resolveJiraIssueType(types, issueType);
    if (type.subtask && !parentKey)
        throw new Error('Jira Subtask requires an existing parent issue key.');
    if (parentKey && type.name.toLowerCase() === 'epic')
        throw new Error('Jira Epic cannot be created under a parent issue.');
    const fields = { project: { key: projectKey }, issuetype: { id: type.id }, summary: String(summary || '').trim().slice(0, 254), description: adf(description) };
    if (!fields.summary)
        throw new Error('Issue summary required.');
    if (parentKey)
        fields.parent = { key: validIssueKey(parentKey) };
    if (marker) {
        if (!/^atgv-[a-f0-9]{24}$/.test(marker))
            throw Error('Invalid Jira operation marker.');
        fields.labels = [marker];
    }
    if (extraLabels.length) {
        if (!Array.isArray(extraLabels) || extraLabels.length > 8 || extraLabels.some(v => !/^atgv-role-[a-z-]{2,45}$/.test(String(v))))
            throw Error('Invalid SDLC role label.');
        fields.labels = [...new Set([...(fields.labels||[]),...extraLabels])];
    }
    Object.assign(fields,safeExtraFields(extraFields,fieldMetadata));
    const data = await requestJson(`${baseAtlassian(config)}/rest/api/3/issue`, { ...jiraAuth(config, token), method: 'POST', data: { fields } });
    if (!data.key)
        return Promise.reject(new Error('Jira did not return issue key. Check remote for a created issue before retrying.'));
    return { key: data.key, url: `${baseAtlassian(config)}/browse/${encodeURIComponent(data.key)}` };
}
function jiraMarker(config, nodePath, atgvProjectId) {
    const project = validProjectKey(config.get('jira.projectKey'));
    if (atgvProjectId !== undefined && !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(String(atgvProjectId || '')))
        throw Error('Invalid ATGV project identity for Jira synchronization.');
    const prefix = atgvProjectId === undefined ? '' : '|atgv-project:' + String(atgvProjectId);
    return 'atgv-' + sha(baseAtlassian(config) + '|' + project + prefix + '|' + nodePath).slice(0, 24);
}
async function jiraFindIssueByMarker(config, token, marker) {
    if (!/^atgv-[a-f0-9]{24}$/.test(marker))
        throw Error('Invalid Jira marker.');
    const project = validProjectKey(config.get('jira.projectKey'));
    const jql = `project = ${project} AND labels = "${marker}"`;
    const result = await requestJson(`${baseAtlassian(config)}/rest/api/3/search/jql`, { ...jiraAuth(config, token), method: 'POST', data: { jql, maxResults: 10, fields: ['summary', 'description', 'labels', 'issuetype', 'parent', 'project'] } });
    const found = (result.issues || []).filter(i => i.fields?.labels?.includes(marker));
    if (found.length > 1)
        throw Error('Multiple Jira issues have the same identity marker. Resolve duplicates manually.');
    return found[0] || null;
}
async function jiraReadIssue(config, token, key) {
    validIssueKey(key);
    return requestJson(`${baseAtlassian(config)}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,labels,issuetype,parent,project,status,assignee,updated`, jiraAuth(config, token));
}
async function jiraReadIssueChangelog(config, token, key) {
    validIssueKey(key);
    const entries = [];
    let startAt = 0;
    const MAX_HISTORY = 2000;
    for (let page = 0; page < 25; page++) {
        const data = await requestJson(`${baseAtlassian(config)}/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${startAt}&maxResults=100`, jiraAuth(config, token));
        if (!Array.isArray(data.values))
            throw Error('Jira changelog response unavailable.');
        for (const value of data.values)
            entries.push(...(value.items || []));
        const count = data.values.length, total = Number(data.total);
        startAt += count;
        if (!count || Number.isFinite(total) && startAt >= total || data.isLast === true)
            return { entries, complete: true };
        if (startAt >= MAX_HISTORY)
            break;
    }
    return { entries, complete: false };
}
function remoteFingerprint(issue) { return sha(JSON.stringify({ summary: String(issue.fields?.summary || ''), description: textFromAdf(issue.fields?.description) })); }
async function jiraUpdateIssue(config, token, { key, summary, description, extraFields = {}, fieldMetadata } = {}) {
    validIssueKey(key);
    const fields = {};
    if (summary !== undefined) {
        if (!String(summary).trim())
            throw new Error('Summary cannot be empty.');
        fields.summary = String(summary).slice(0, 254);
    }
    if (description !== undefined)
        fields.description = adf(description);
    Object.assign(fields,safeExtraFields(extraFields,fieldMetadata));
    if (!Object.keys(fields).length)
        throw new Error('No Jira fields changed.');
    return requestJson(`${baseAtlassian(config)}/rest/api/3/issue/${encodeURIComponent(key)}`, { ...jiraAuth(config, token), method: 'PUT', data: { fields } });
}
async function jiraRetireIssue(config, token, { key } = {}) {
    validIssueKey(key);
    const auth = jiraAuth(config, token), url = `${baseAtlassian(config)}/rest/api/3/issue/${encodeURIComponent(key)}`;
    const current = await requestJson(url + '?fields=labels', { ...auth });
    const labels = Array.isArray(current.fields?.labels) ? current.fields.labels : [];
    if (!labels.includes('atgv-obsolete'))
        await requestJson(url, { ...auth, method: 'PUT', data: { fields: { labels: [...labels, 'atgv-obsolete'] } } });
    return { key, retired: true };
}
const ghHeaders = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
async function githubBranch(config, token, { branch, baseBranch } = {}) {
    if (!token)
        throw new Error('GitHub token with Contents: write permission required.');
    const { route } = githubRepoInfo(config);
    validBranch(branch);
    const repo = await requestJson(route, { token, headers: ghHeaders });
    const parent = baseBranch || repo.default_branch;
    if (!parent || parent.length > 120 || parent.includes('..'))
        throw new Error('Invalid base branch.');
    const current = await requestJson(`${route}/git/ref/heads/${parent.split('/').map(encodeURIComponent).join('/')}`, { token, headers: ghHeaders });
    const result = await requestJson(`${route}/git/refs`, { token, headers: ghHeaders, method: 'POST', data: { ref: `refs/heads/${branch}`, sha: current.object.sha } });
    return { ref: result.ref || `refs/heads/${branch}`, sha: current.object.sha };
}
async function githubPullRequest(config, token, { branch, baseBranch, title, body = '', draft = true } = {}) {
    if (!token)
        throw new Error('GitHub token with Pull requests: write permission required.');
    const { route } = githubRepoInfo(config);
    validBranch(branch);
    const repo = await requestJson(route, { token, headers: ghHeaders });
    const base = baseBranch || repo.default_branch;
    if (!base)
        throw new Error('No base branch configured.');
    const t = String(title || '').trim();
    if (!t)
        throw new Error('Pull request title required.');
    const result = await requestJson(`${route}/pulls`, { token, headers: ghHeaders, method: 'POST', data: { head: branch, base, title: t.slice(0, 254), body: String(body).slice(0, 20000), draft: !!draft } });
    return { number: result.number, url: result.html_url, draft: result.draft };
}
async function jiraAssignCurrentUser(config, token, key, expectedUpdated) {
    validIssueKey(key);
    if (!token)
        throw Error('Jira credentials required.');
    const root = baseAtlassian(config), auth = jiraAuth(config, token);
    const issue = await jiraReadIssue(config, token, key);
    if (String(issue.fields?.updated || '') !== expectedUpdated)
        throw Error('Jira changed since preview. Retrieve the story again before assigning.');
    const me = await requestJson(`${root}/rest/api/3/myself`, auth);
    if (!me.accountId)
        throw Error('Jira account ID unavailable.');
    const existing = issue.fields?.assignee?.accountId;
    if (existing && existing !== me.accountId)
        throw Error('Story is already assigned to another user. Obtain a transfer before claiming.');
    if (existing !== me.accountId)
        await requestJson(`${root}/rest/api/3/issue/${encodeURIComponent(key)}/assignee`, { ...auth, method: 'PUT', data: { accountId: me.accountId } });
    return { key, assignee: me.displayName || me.accountId, accountId: me.accountId };
}
/**
 * Jira has a single assignee field shared by all SDLC workspaces. Attach one
 * exclusive ATGV role label BEFORE claiming an unlabelled issue, so another
 * role cannot display the resulting assignment as its own work.
 * We never replace other labels or override a task assigned to someone else.
 */
async function jiraAssignRoleCurrentUser(config,token,key,expectedUpdated,roleId){
 const {requireRole,roleLabel}=require('./jira-role-eligibility');
 const role=roleLabel(roleId);
 if(!role)throw Error('Unsupported Jira SDLC role for assignment.');
 const issue=await jiraReadIssue(config,token,key);
 requireRole(issue,roleId,validProjectKey(config.get('jira.projectKey')));
 if(String(issue.fields?.updated||'')!==String(expectedUpdated||''))throw Error('Jira issue changed. Refresh before assigning.');
 const labels=Array.isArray(issue.fields?.labels)?issue.fields.labels:[];
 const root=baseAtlassian(config),auth=jiraAuth(config,token);
 const me=await requestJson(`${root}/rest/api/3/myself`,auth);
 if(!me?.accountId)throw Error('Jira account identity is unavailable.');
 if(issue.fields?.assignee?.accountId&&issue.fields.assignee.accountId!==me.accountId)throw Error('Jira task is assigned to another user.');
 let latestUpdated=String(expectedUpdated||'');
 let labelAdded=false;
 if(!labels.includes(role)){
  await requestJson(`${root}/rest/api/3/issue/${encodeURIComponent(key)}`,{...auth,method:'PUT',data:{update:{labels:[{add:role}]}}});
  labelAdded=true;
  const tagged=await jiraReadIssue(config,token,key);
  requireRole(tagged,roleId,validProjectKey(config.get('jira.projectKey')));
  if(!Array.isArray(tagged.fields?.labels)||!tagged.fields.labels.includes(role))throw Error('Jira did not persist the requested role label. Refresh before assigning.');
  if(tagged.fields?.assignee?.accountId&&tagged.fields.assignee.accountId!==me.accountId)throw Error('Jira assignee changed during role tagging. Refresh before assigning.');
  latestUpdated=String(tagged.fields?.updated||'');
 }
 try{
  const result=await jiraAssignCurrentUser(config,token,key,latestUpdated);
  return {...result,roleId,roleLabel:role};
 }catch(error){
  // Undo only our own label when the subsequent claim failed. Do not touch
  // other role labels, an issue claimed in the meantime or the existing assignee.
  if(labelAdded)try{
   const current=await jiraReadIssue(config,token,key);
   if(!current.fields?.assignee?.accountId&&Array.isArray(current.fields?.labels)&&current.fields.labels.includes(role))
    await requestJson(`${root}/rest/api/3/issue/${encodeURIComponent(key)}`,{...auth,method:'PUT',data:{update:{labels:[{remove:role}]}}});
  }catch{ /* The original failure is the useful error; refresh if rollback fails. */ }
  throw error;
 }
}
async function jiraUnassignCurrentUser(config,token,key,expectedUpdated){
 validIssueKey(key);
 if(!token)throw Error('Jira credentials required.');
 const issue=await jiraReadIssue(config,token,key);
 if(String(issue.fields?.updated||'')!==String(expectedUpdated||''))throw Error('Jira issue changed. Refresh before unassigning.');
 const root=baseAtlassian(config),auth=jiraAuth(config,token);
 const me=await requestJson(`${root}/rest/api/3/myself`,auth);
 if(!me?.accountId||issue.fields?.assignee?.accountId!==me.accountId)throw Error('Only your own Jira assignment can be removed.');
 await requestJson(`${root}/rest/api/3/issue/${encodeURIComponent(key)}/assignee`,{...auth,method:'PUT',data:{accountId:null}});
 return {key,unassigned:true};
}
async function jiraAvailableTransitions(config, token, key) {
    validIssueKey(key);
    const res = await requestJson(`${baseAtlassian(config)}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, jiraAuth(config, token));
    return (res.transitions || []).filter(x => /^[0-9]{1,12}$/.test(String(x.id))).map(t => ({ id: String(t.id), name: String(t.name || ''), to: String(t.to?.name || '') }));
}
async function jiraMove(config, token, key, transitionId, expectedUpdated) {
    validIssueKey(key);
    const current = await jiraReadIssue(config, token, key);
    if (String(current.fields?.updated || '') !== String(expectedUpdated || ''))
        throw Error('Jira story was modified. Refresh before updating status.');
    const options = await jiraAvailableTransitions(config, token, key), selected = options.find(x => x.id === String(transitionId));
    if (!selected)
        throw Error('Selected Jira workflow transition is no longer available.');
    await requestJson(`${baseAtlassian(config)}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, { ...jiraAuth(config, token), method: 'POST', data: { transition: { id: selected.id } } });
    return { key, transition: selected.name, status: selected.to };
}
module.exports = { validIssueKey, validProjectKey, resolveJiraIssueType, jiraIssueTypes, jiraIssueFieldMetadata, jiraReadIssueAllFields, safeExtraFields, jiraCreateIssue, jiraUpdateIssue, jiraRetireIssue, jiraFindIssueByMarker, jiraReadIssue, jiraReadIssueChangelog, jiraMarker, remoteFingerprint, githubBranch, githubPullRequest, jiraAssignCurrentUser, jiraAssignRoleCurrentUser, jiraUnassignCurrentUser, jiraAvailableTransitions, jiraMove, validBranch, adf };
