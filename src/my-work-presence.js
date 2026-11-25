'use strict';
// Project-scoped Confluence register for verified Jira users who enter My Work.
// A Confluence table is used as the shared record; there is no external DB.
const {requestJson,baseAtlassian,baseConfluence,getConfluenceSpace,getConfluencePage,writeConfluence}=require('./clients');
const {validProjectKey}=require('./remote-actions');
const {htmlToText}=require('./utils');
const {ConfluenceUserDatabase,normalizeRows}=require('./confluence-user-database');
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const clean=(value,n=180)=>String(value||'').trim().slice(0,n);
const {ROLES:ROLE_PROMPTS}=require('./my-work-role-prompts');
const ROLES=Object.freeze(Object.fromEntries(Object.entries(ROLE_PROMPTS).map(([id,role])=>[id,role.name])));
function displayName(email,preferred=''){
 const name=clean(preferred);
 if(name)return name;
 return clean(String(email||'').split('@')[0].replace(/[._+-]+/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase()))||'Unknown';
}
function title(key){return 'ATGV My Work Users - '+validProjectKey(key);}
function extractRows(body){
 const rows=[];
 for(const match of String(body||'').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>x[1]);
  if(![3,4].includes(cells.length)||/<th\b/i.test(match[1]))continue;
  const rawName=clean(htmlToText(cells[0].replace(/<small\b[^>]*>[\s\S]*?<\/small>/gi,'')),250);
  const embeddedEmail=(rawName.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[])[0]||'';
  const email=clean((cells[0].match(/<small\b[^>]*>([^<]*)<\/small>/i)||[])[1]||embeddedEmail,250).toLowerCase();
  const name=clean(rawName.replace(embeddedEmail,'').trim(),180)||displayName(email);
  const roles=clean(htmlToText(cells[1]),500).split(/\s*;\s*/).filter(Boolean);
  const tasks=clean(htmlToText(cells[2]),1200);
  // Confluence storage may strip data-* attributes. Fourth-column text is durable.
  const id=clean(cells[3]?htmlToText(cells[3]):(match[0].match(/data-atgv-account="([^"]+)"/i)||[])[1],200);
  if(!email&&!id)continue;
  rows.push({id:clean(id,200),email,name,roles:[...new Set(roles)],tasks});
 }
 const canonical=normalizeRows(rows);
 if(canonical.conflicts.length)throw Error('Confluence roster identity conflict: '+canonical.conflicts.join('; '));
 return canonical.rows;
}
function renderRows(rows){
 return '<p>ATGV My Work user register. Names and roles originate from signed-in Jira identities and actual My Work visits. Jira tasks reflect the latest verified user visit.</p>'+
 '<table><tbody><tr><th>Name</th><th>Roles</th><th>JIRA Task</th><th>Jira Account ID</th></tr>'+
 rows.map(row=>'<tr data-atgv-account="'+escape(row.id)+'"><td>'+escape(row.name)+'<p><small>'+escape(row.email)+'</small></p></td><td>'+escape(row.roles.join('; '))+'</td><td>'+escape(row.tasks||'No assigned task')+'</td><td><code>'+escape(row.id)+'</code></td></tr>').join('')+'</tbody></table>';
}
async function locate(config,token,projectKey){
 const space=await getConfluenceSpace(config,token),name=title(projectKey);
 const url=baseConfluence(config)+'/api/v2/pages?space-id='+encodeURIComponent(space.id)+'&title='+encodeURIComponent(name)+'&status=current&limit=100';
 const found=await requestJson(url,{token,basicEmail:config.get('jira.email')});
 const matches=(found.results||[]).filter(x=>x.title===name&&x.status==='current');
 if(matches.length>1)throw Error('Multiple Confluence registers have the same title. Resolve duplicates before updating.');
 const page=matches.length?await getConfluencePage(config,token,matches[0].id):null;
 if(page&&(!String(page.body?.storage?.value||'').includes('ATGV My Work user register')))
   throw Error('A Confluence page with this name already exists and is not an ATGV register.');
 return {space,page,name};
}
// Refresh live Jira assignments for all recorded users; do not confuse task
// creator with assignee, and never change the Confluence role register on read.
async function assignedTasks(config,token,projectKey,{request=requestJson,maxPages=20}={}){
 const key=validProjectKey(projectKey),auth={token,basicEmail:config.get('jira.email')};
 const assignments=new Map();let nextPageToken='',truncated=false;
 for(let page=0;page<maxPages;page++){
  const data={jql:'project = "'+key+'" AND assignee IS NOT EMPTY ORDER BY updated DESC',
   maxResults:100,fields:['status','assignee']};
  if(nextPageToken)data.nextPageToken=nextPageToken;
  const response=await request(baseAtlassian(config)+'/rest/api/3/search/jql',{...auth,method:'POST',data});
  for(const issue of response.issues||[]){
   const id=String(issue.fields?.assignee?.accountId||'');
   if(!id||!new RegExp('^'+key+'-\\d+$').test(String(issue.key||'')))continue;
   if(!assignments.has(id))assignments.set(id,[]);
   const entries=assignments.get(id);
   if(entries.length<100)entries.push(issue.key+' ('+clean(issue.fields?.status?.name||'Unknown',50)+')');
  }
  nextPageToken=String(response.nextPageToken||'');
  if(!nextPageToken||response.isLast===true)break;
  if(page===maxPages-1)truncated=true;
 }
 return {assignments,truncated};
}
// Read both verified stores for every roster operation. A role visit must never
// replace a previously registered database-only user with a stale page row.
async function readRoster(config,token,projectKey,found=null){
 found=found||await locate(config,token,projectKey);
 const pageRows=extractRows(found.page?.body?.storage?.value||'');
 let db=null,registryWarning='';
 try{db=await new ConfluenceUserDatabase(config,token,projectKey).read();}
 catch(error){registryWarning='Confluence Database v2 unavailable: '+clean(error.message,180);}
 const normalized=normalizeRows([...pageRows,...(db?.rows||[])]);
 if(normalized.conflicts.length)throw Error(normalized.conflicts.join('; '));
 return {...found,rows:normalized.rows,databaseId:String(db?.db?.id||''),registryWarning};
}
function verifyRegistered(rows,id,{name,email}={}){
 const row=rows.find(user=>user.id===id);
 if(!row||name&&row.name!==name||email&&row.email!==email)throw Error('User registration could not be confirmed from Confluence. Refresh and retry the same account ID.');
 return row;
}
async function snapshot(config,token,projectKey){
 const found=await readRoster(config,token,projectKey);
 const {rows,registryWarning,databaseId}=found;
 let assignmentWarning='';
 if(rows.length){
  try{
   const {assignments,truncated}=await assignedTasks(config,token,projectKey);
   for(const user of rows){
    const tasks=assignments.get(user.id)||[];
    user.tasks=tasks.length?tasks.join('; ')+(truncated?'; …':''):truncated?'Not found within scanned Jira items (partial results)':'No assigned task';
   }
   if(truncated)assignmentWarning='Jira task search stopped at the 2,000-issue safety limit.';
  }catch(error){assignmentWarning='Live Jira assignments unavailable: '+clean(error.message,180);}
 }
 return {rows,pageId:String(found.page?.id||''),spaceKey:found.space.key,updatedAt:found.page?.version?.createdAt||'',assignmentWarning,registryWarning,databaseId};
}
async function syncDatabase(config,token,projectKey,rows){
 try{
  const result=await new ConfluenceUserDatabase(config,token,projectKey).upsert(rows);
  return {databaseId:result.databaseId,registryWarning:''};
 }catch(error){
  // The verified Confluence page is still saved; don't disguise a v2 failure.
  return {databaseId:'',registryWarning:'Database v2 sync needs attention: '+clean(error.message,180)};
 }
}
async function visit(config,token,{projectKey,roleId='',confirmRegistration,assertActive=()=>{}}){
 const role=roleId?ROLES[roleId]:'';
 if(roleId&&!role)throw Error('Unknown role cannot be added to the register.');
 const auth={token,basicEmail:config.get('jira.email')};
 const me=await requestJson(baseAtlassian(config)+'/rest/api/3/myself',auth);
 if(!me?.accountId)throw Error('Jira did not verify the current user.');
 if(me.active===false)throw Error('The connected Jira user is inactive.');
 const email=clean(me.emailAddress||config.get('jira.email'),250).toLowerCase();
 const validEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'';
 const jiraName=clean(me.displayName)|| (validEmail?displayName(validEmail):String(me.accountId));
 const project=validProjectKey(projectKey);
 const initial=await readRoster(config,token,project);
 const existing=initial.rows.find(row=>row.id===me.accountId);
 if(validEmail&&initial.rows.some(row=>row.email.toLowerCase()===validEmail&&row.id&&row.id!==me.accountId))throw Error('Email is already linked to a different verified Atlassian account. Manual reconciliation required.');
 // Preserve an existing verified profile, or prefill a legacy email-only profile.
 const matched=existing||(validEmail?initial.rows.find(row=>!row.id&&row.email.toLowerCase()===validEmail):null);
 const name=clean(matched?.name)||jiraName;
 const registrationEmail=clean(matched?.email,250)||validEmail;
 let registrationConfirmed=false;
 if(!existing){
  if(typeof confirmRegistration!=='function')return {...await snapshot(config,token,project),registrationPending:true};
  registrationConfirmed=await confirmRegistration({id:me.accountId,name,email:registrationEmail,projectKey:project,spaceKey:initial.space.key});
  assertActive();
  if(registrationConfirmed!==true)return {...await snapshot(config,token,project),registrationCancelled:true};
  const confirmed=await requestJson(baseAtlassian(config)+'/rest/api/3/myself',auth);
  if(confirmed?.accountId!==me.accountId||confirmed.active===false||clean(confirmed.displayName)!==clean(me.displayName)||clean(confirmed.emailAddress||config.get('jira.email'),250).toLowerCase()!==email)
   throw Error('Connected Jira identity changed. Confirm registration again.');
 }
 let tasks='No assigned task';
 try{
  const result=await requestJson(baseAtlassian(config)+'/rest/api/3/search/jql',{...auth,method:'POST',data:{
   jql:'project = "'+project+'" AND assignee = currentUser() ORDER BY updated DESC',
   maxResults:30,fields:['summary','status','assignee']}});
  const issues=(result.issues||[]).filter(x=>new RegExp('^'+project+'-\\d+$').test(String(x.key||'')));
  if(issues.length)tasks=issues.map(x=>x.key+' ('+clean(x.fields?.status?.name,50)+')').join('; ')+(result.nextPageToken?'; …':'');
 }catch{tasks='Jira tasks unavailable';}
 for(let attempt=0;attempt<3;attempt++){
  const {space,page,name:pageName,rows}=await readRoster(config,token,project);
  assertActive();
  const current=rows.find(x=>x.id===me.accountId)|| (validEmail?rows.find(x=>!x.id&&x.email.toLowerCase()===validEmail):null);
  if(!current?.id&&!registrationConfirmed)throw Error('User registration changed. Confirm registration again.');
  if(validEmail&&rows.some(x=>x.email===validEmail&&x.id&&x.id!==me.accountId))throw Error('Email is already linked to a different verified Atlassian account. Manual reconciliation required.');
  if(current?.id&&current.id!==me.accountId)throw Error('Email is already linked to a different verified Atlassian account. Manual reconciliation required.');
  const effectiveEmail=registrationConfirmed?registrationEmail:(current?.email||validEmail);
  if(registrationConfirmed&&current&&(clean(current.name)!==name||clean(current.email,250)!==registrationEmail))throw Error('Existing user profile changed. Reopen Overview and confirm again.');
  const unchanged=!!current&&current.id===me.accountId&&current.email===effectiveEmail&&current.name===name&&current.tasks===tasks&&(!role||current.roles.includes(role))&&!!page&&JSON.stringify(extractRows(page.body?.storage?.value||''))===JSON.stringify(normalizeRows(rows).rows);
  if(unchanged){
   const db=await syncDatabase(config,token,project,rows);
   const refreshed=await snapshot(config,token,project);
   verifyRegistered(refreshed.rows,me.accountId);
   return {...refreshed,databaseId:db.databaseId||refreshed.databaseId,registryWarning:db.registryWarning||refreshed.registryWarning,syncComplete:!db.registryWarning};
  }
  if(current){current.id=me.accountId;current.email=effectiveEmail;current.name=name;current.tasks=tasks;current.roles=[...new Set([...current.roles,...(role?[role]:[])])];}
  else rows.push({id:me.accountId,email:effectiveEmail,name,roles:role?[role]:[],tasks});
  rows.sort((a,b)=>a.name.localeCompare(b.name));
  try{
   assertActive();
   const saved=await writeConfluence(config,token,{pageId:page?.id,spaceId:space.id,title:pageName,bodyHtml:renderRows(rows),version:page?.version?.number});
   const savedId=String(saved?.id||page?.id||'');
   if(!savedId)throw Error('Confluence did not return the saved roster page ID.');
   const confirmedPage=await getConfluencePage(config,token,savedId);
   const verified=verifyRegistered(extractRows(confirmedPage?.body?.storage?.value||''),me.accountId,{name,email:effectiveEmail});
   const db=await syncDatabase(config,token,project,rows);
   const refreshed=await snapshot(config,token,project);
   const combined=normalizeRows([...refreshed.rows.filter(row=>row.id!==me.accountId),{...verified,tasks:refreshed.rows.find(row=>row.id===me.accountId)?.tasks||verified.tasks}]);
   if(combined.conflicts.length)throw Error(combined.conflicts.join('; '));
   return {...refreshed,rows:combined.rows,pageId:savedId,databaseId:db.databaseId||refreshed.databaseId,registryWarning:db.registryWarning||refreshed.registryWarning,registrationConfirmed,registeredName:name,syncComplete:!db.registryWarning};
  }catch(error){
   if(/version conflict|HTTP (409|412)/i.test(error.message)&&attempt<2)continue;
   throw error;
  }
 }
 throw Error('Concurrent Confluence edits prevented the register from being saved.');
}
// PMs may register a verified Jira identity; project roles are never assigned
// by this operation. The user acquires roles only on their own My Work visit.
async function addUser(config,token,{projectKey,accountId}){
 const project=validProjectKey(projectKey),id=clean(accountId,200);
 if(!id||!/*account*/ /^[A-Za-z0-9:_-]{4,200}$/.test(id))throw Error('Enter a valid Atlassian account ID.');
 const auth={token,basicEmail:config.get('jira.email')},site=baseAtlassian(config);
 const [self,perms]=await Promise.all([
  requestJson(site+'/rest/api/3/myself',auth),
  requestJson(site+'/rest/api/3/mypermissions?projectKey='+encodeURIComponent(project)+'&permissions=ASSIGN_ISSUES',auth)
 ]);
 if(!self?.accountId||perms.permissions?.ASSIGN_ISSUES?.havePermission!==true)
  throw Error('Only a verified Jira user with Assign Issues permission can register project users.');
 const actor=await readRoster(config,token,project);
 const roster=actor.rows;
 if(!roster.some(x=>x.id===self.accountId&&x.roles.includes('Project Manager')))
  throw Error('Enter Project Manager My Work and confirm your Jira identity before adding users.');
 const person=await requestJson(site+'/rest/api/3/user?accountId='+encodeURIComponent(id),auth);
 if(person?.accountId!==id||person.active===false)throw Error('Jira could not verify an active user with this account ID.');
 const email=clean(person.emailAddress,250).toLowerCase();
 const name=clean(person.displayName)|| (email?displayName(email):id);
 for(let attempt=0;attempt<3;attempt++){
  const {space,page,name:pageName,rows}=await readRoster(config,token,project);
  const old=rows.find(x=>x.id===id);
  if(!old){
   if(email&&rows.some(x=>x.email===email&&x.id&&x.id!==id))
    throw Error('Email belongs to a different Jira account ID. Reconcile before adding.');
   rows.push({id,email,name,roles:[],tasks:'No assigned task'});
  }else{
   old.name=name;
   if(email)old.email=email;
  }
  const normalized=normalizeRows(rows);
  if(normalized.conflicts.length)throw Error(normalized.conflicts.join('; '));
  try{
   const saved=await writeConfluence(config,token,{
    pageId:page?.id,spaceId:space.id,title:pageName,
    bodyHtml:renderRows(normalized.rows),version:page?.version?.number
   });
   const database=await syncDatabase(config,token,project,normalized.rows);
   // Read the saved page by ID, not eventually consistent title search.
   const savedId=String(saved?.id||page?.id||'');
   if(!savedId)throw Error('Confluence did not return the saved roster page ID.');
   const confirmed=await getConfluencePage(config,token,savedId);
   const verified=verifyRegistered(extractRows(confirmed?.body?.storage?.value||''),id,{name,email});
   const refreshed=await snapshot(config,token,project);
   // The direct read verifies the write even if CQL/title search is stale.
   const combined=normalizeRows([...refreshed.rows.filter(row=>row.id!==id),{...verified,tasks:refreshed.rows.find(row=>row.id===id)?.tasks||verified.tasks}]);
   if(combined.conflicts.length)throw Error(combined.conflicts.join('; '));
   verifyRegistered(combined.rows,id,{name,email});
   return {...refreshed,rows:combined.rows,pageId:savedId,databaseId:database.databaseId||refreshed.databaseId,
    registryWarning:database.registryWarning||refreshed.registryWarning,reason:'added-user',registeredAccountId:id,registeredName:name,registrationAction:old?'updated':'added',syncComplete:!database.registryWarning};
  }catch(error){
   if(/version conflict|HTTP (409|412)/i.test(error.message)&&attempt<2)continue;
   throw error;
  }
 }
 throw Error('Concurrent Confluence edits prevented the user from being registered.');
}
async function searchUsers(config,token,{projectKey,query}){
 const project=validProjectKey(projectKey),q=clean(query,200);
 if(q.length<2)throw Error('Enter at least two characters of a name or email.');
 const auth={token,basicEmail:config.get('jira.email')},site=baseAtlassian(config);
 const result=await requestJson(site+'/rest/api/3/user/assignable/search?project='+encodeURIComponent(project)+'&query='+encodeURIComponent(q)+'&maxResults=50',auth);
 if(!Array.isArray(result))throw Error('Jira returned an invalid user search result.');
 const users=new Map();
 for(const person of result)if(person?.active!==false&&/^[A-Za-z0-9:_-]{4,200}$/.test(String(person?.accountId||'')))users.set(person.accountId,{id:person.accountId,name:clean(person.displayName)||person.accountId,email:clean(person.emailAddress,250)});
 return [...users.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
module.exports={searchUsers,readRoster,verifyRegistered,ROLES,displayName,title,extractRows,renderRows,locate,assignedTasks,snapshot,visit,addUser};
