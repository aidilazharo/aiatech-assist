'use strict';
/**
 * Read-only Jira diagnosis followed by an explicitly confirmed LOCAL unlink.
 * Jira 404 can mean deletion OR issue-security restrictions. Never treat it as
 * proof of remote deletion and never issue a DELETE request from this module.
 */
const {requestJson,baseAtlassian}=require('./clients');
const {jiraReadIssue,validIssueKey,validProjectKey}=require('./remote-actions');
const MAX_CHECK=250;
const scope=(path,brId)=>path===brId||path.startsWith(brId+'/');
const is404=error=>/\bHTTP 404\b/.test(String(error?.message||error||''));
const validBR=id=>/^BR-[0-9]+$/.test(String(id||''));
function savedLinks(register,brId){
 if(!validBR(brId)||!(register.brs||[]).some(br=>br.id===brId))throw Error('Business Requirement was removed or changed. Refresh and retry.');
 if(Object.keys(register.pending||{}).some(path=>scope(path,brId)))throw Error('Pending Jira publishing must be resolved before link reconciliation.');
 const rows=new Map();
 const elsewhere=new Set(Object.entries(register.synced||{}).filter(([p])=>!scope(p,brId)).map(([,r])=>r?.key).filter(Boolean));
 for(const cycle of register.completedCycles||[])for(const br of cycle.requirements||[])if(br.id!==brId){
  if(br.jiraKey)elsewhere.add(br.jiraKey);
  for(const row of br.jiraIssues||[])if(row?.key)elsewhere.add(row.key);
 }
 for(const [nodePath,item] of Object.entries(register.synced||{}))if(scope(nodePath,brId)&&item?.key){
  const key=validIssueKey(item.key);
  rows.set(key,{key,nodePath});
 }
 for(const cycle of register.completedCycles||[])for(const br of cycle.requirements||[])if(br.id===brId){
  for(const item of br.jiraIssues||[])if(item?.key){
   const key=validIssueKey(item.key),nodePath=String(item.path||'');
   if(!scope(nodePath,brId))throw Error(`Historical Jira ${key} has an invalid BR path.`);
   if(rows.has(key)&&rows.get(key).nodePath!==nodePath)throw Error(`Jira ${key} has conflicting historical mappings.`);
   if([...rows.values()].some(row=>row.nodePath===nodePath&&row.key!==key))throw Error(`Jira path ${nodePath} was remapped. Review its history before reconciliation.`);
   rows.set(key,{key,nodePath});
  }
  if(br.jiraKey&&!rows.has(br.jiraKey))rows.set(validIssueKey(br.jiraKey),{key:validIssueKey(br.jiraKey),nodePath:brId});
 }
 const prior=new Set((register.jiraLinkReconciliations||[]).filter(e=>e.brId===brId).flatMap(e=>(e.rows||[]).map(r=>r.key)));
 const result=[...rows.values()].filter(r=>!prior.has(r.key));
 if(result.length>MAX_CHECK)throw Error('Jira link reconciliation exceeds the 250-issue review limit.');
 if(result.some(r=>elsewhere.has(r.key)))throw Error('A Jira issue is shared by another BR. Resolve ownership before unlinking.');
 return result;
}
async function inspect({register,brId,config,token,projectId,request=requestJson,readJira=jiraReadIssue}){
 if(!token)throw Error('Jira authentication is required before checking links.');
 const projectKey=validProjectKey(config.get('jira.projectKey'));
 const site=baseAtlassian(config);
 const permissions=await request(`${site}/rest/api/3/mypermissions?projectKey=${encodeURIComponent(projectKey)}&permissions=BROWSE_PROJECTS`,{token,basicEmail:String(config.get('jira.email')||'').trim()});
 if(permissions?.permissions?.BROWSE_PROJECTS?.havePermission!==true)throw Error(`Browse Projects permission is required for Jira ${projectKey}. A 404 cannot be reconciled without project access.`);
 const rows=savedLinks(register,brId);
 const missing=[],available=[];
 for(const row of rows){
  if(row.key.split('-')[0]!==projectKey)throw Error(`Saved Jira issue ${row.key} does not belong to ${projectKey}. No links changed.`);
  try{
   const issue=await readJira(config,token,row.key);
   if(issue?.key!==row.key||issue?.fields?.project?.key!==projectKey)throw Error(`Unexpected Jira identity for ${row.key}. No links changed.`);
   available.push(row);
  }catch(error){
   if(!is404(error))throw error;
   missing.push(row);
  }
 }
 return {schema:1,brId,projectId,registerRevision:register.revision,projectKey,site,missing,available,checkedAt:new Date().toISOString()};
}
function apply(next,plan,actor){
 if(!validBR(plan?.brId)||!Array.isArray(plan?.missing)||plan.missing.length===0)throw Error('No Jira links selected for local reconciliation.');
 if(!(next.brs||[]).some(br=>br.id===plan.brId))throw Error('Business Requirement changed. Refresh and retry.');
 const current=savedLinks(next,plan.brId);
 const known=new Map(current.map(r=>[r.key,r.nodePath]));
 if(new Set(plan.missing.map(r=>r.key)).size!==plan.missing.length)throw Error('Duplicate Jira keys in reconciliation.');
 for(const row of plan.missing){
  if(!known.has(row.key)||known.get(row.key)!==row.nodePath||row.key.split('-')[0]!==plan.projectKey)throw Error(`Jira mapping for ${row.key} changed during review.`);
  if(next.synced?.[row.nodePath]?.key===row.key)delete next.synced[row.nodePath];
 }
 const record={at:new Date().toISOString(),actor:String(actor||'Business Analyst').slice(0,120),brId:plan.brId,projectId:plan.projectId,site:plan.site,projectKey:plan.projectKey,checkedAt:plan.checkedAt,reason:'jira-404-not-found-or-not-visible',rows:plan.missing.map(r=>({nodePath:r.nodePath,key:r.key}))};
 next.jiraLinkReconciliations=(next.jiraLinkReconciliations||[]).concat(record).slice(-250);
 next.events=(next.events||[]).concat({at:record.at,action:'jira-links-reconciled-local-only',brId:plan.brId,keys:record.rows.map(r=>r.key),actor:record.actor}).slice(-200);
 return record;
}
function suppressedPaths(register){return new Set((register.jiraLinkReconciliations||[]).flatMap(e=>(e.rows||[]).map(row=>row.nodePath)));}
function suppressedKeys(register,brId){return new Set((register.jiraLinkReconciliations||[]).filter(e=>e.brId===brId).flatMap(e=>(e.rows||[]).map(row=>row.key)));}
module.exports={savedLinks,inspect,apply,suppressedPaths,suppressedKeys,is404};
