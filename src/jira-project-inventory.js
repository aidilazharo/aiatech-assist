'use strict';
const {requestJson,baseAtlassian} = require('./clients');
const {validProjectKey} = require('./remote-actions');
const {textFromAdf}=require('./utils');
const PAGE_SIZE = 100;
const MAX_ISSUES = 20000;
function clean(value,limit=500){return String(value??'').slice(0,limit);}
function normalizeIssue(issue,projectKey){
    const f=issue?.fields||{};
    const key=String(issue?.key||'');
    if (!new RegExp('^'+projectKey.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'-\\d+$','i').test(key) || f.project?.key && String(f.project.key).toUpperCase()!==projectKey) return null;
    const user=f.creator||{};
    const assignee=f.assignee||{};
    return {key,summary:clean(f.summary,350),type:clean(f.issuetype?.name||'Unknown',80),status:clean(f.status?.name||'Unknown',80),creator:clean(user.displayName||user.name||user.accountId||'Unavailable',160),creatorId:clean(user.accountId,200),created:clean(f.created,50),
      assignee:clean(assignee.displayName||assignee.accountId||'',160),assigneeId:clean(assignee.accountId,200),
      priority:clean(f.priority?.name||'',80),dueDate:clean(f.duedate,30),updated:clean(f.updated,50),
      resolution:clean(f.resolution?.name||'',80),statusCategory:clean(f.status?.statusCategory?.key||'',30),
      blocked:(Array.isArray(f.issuelinks)&&f.issuelinks.some(link=>/blocks|is blocked by/i.test(String(link.type?.name||''))&&!!link.inwardIssue)),
      parentKey:clean(f.parent?.key,80),sourceStoryKey:clean((textFromAdf(f.description||'').match(/^Jira parent Story:\s*([A-Z][A-Z0-9]{1,19}-[1-9][0-9]*)\s*$/m)||[])[1],80),labels:(Array.isArray(f.labels)?f.labels:[]).filter(x=>typeof x==='string').slice(0,60).map(x=>clean(x,100)),
      originalEstimateSeconds:Number(f.timeoriginalestimate||f.timetracking?.originalEstimateSeconds)||0,
      remainingEstimateSeconds:Number(f.timeestimate||f.timetracking?.remainingEstimateSeconds)||0,
      timeSpentSeconds:Number(f.timespent)||0,
      dependsOn:(Array.isArray(f.issuelinks)?f.issuelinks:[]).filter(link=>/is blocked by/i.test(String(link.type?.inward||''))&&link.inwardIssue).map(link=>clean(link.inwardIssue.key,80))};
}
// Read-only enhanced JQL search. Never silently stop on the first 100 results.
async function scanProject({config,token,projectKey,onPage,request=requestJson,shouldContinue=()=>true,maxIssues=MAX_ISSUES}){
    const key=validProjectKey(projectKey);
    if (!token) throw Error('Connect Jira in Extension Settings before searching project items.');
    const endpoint=baseAtlassian(config)+'/rest/api/3/search/jql';
    const seen=new Set();let nextPageToken='',scanned=0,page=0;
    while (scanned<maxIssues) {
        if (!shouldContinue()) return {count:scanned,cancelled:true,truncated:false};
        const data={jql:`project = "${key}" ORDER BY created DESC`,maxResults:Math.min(PAGE_SIZE,maxIssues-scanned),fields:['project','summary','issuetype','status','creator','created','assignee','priority','duedate','updated','resolution','parent','labels','timeoriginalestimate','timeestimate','timespent','timetracking','issuelinks','description']};
        if(nextPageToken)data.nextPageToken=nextPageToken;
        const response=await request(endpoint,{token,basicEmail:config.get('jira.email'),method:'POST',data});
        if (!Array.isArray(response?.issues))throw Error('Jira returned an invalid search result.');
        const issues=response.issues.map(issue=>normalizeIssue(issue,key)).filter(Boolean);
        scanned+=issues.length;
        page++;
        if(typeof onPage==='function')await onPage({issues,projectKey:key,scanned,page});
        if (response.isLast===true || !response.nextPageToken || !response.issues.length) return {count:scanned,truncated:false};
        if(seen.has(response.nextPageToken))throw Error('Jira returned a repeated pagination token. Search stopped to prevent a loop.');
        seen.add(response.nextPageToken);
        nextPageToken=response.nextPageToken;
        if(page>1000)throw Error('Jira search exceeded the safe pagination limit.');
    }
    return {count:scanned,truncated:true};
}
module.exports={PAGE_SIZE,MAX_ISSUES,normalizeIssue,scanProject};
