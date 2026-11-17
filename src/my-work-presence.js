'use strict';
// Project-scoped Confluence register for verified Jira users who enter My Work.
// A Confluence table is used as the shared record; there is no external DB.
const {requestJson,baseAtlassian,baseConfluence,getConfluenceSpace,getConfluencePage,writeConfluence}=require('./clients');
const {validProjectKey}=require('./remote-actions');
const {htmlToText}=require('./utils');
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const clean=(value,n=180)=>String(value||'').trim().slice(0,n);
const ROLES=Object.freeze({'business-analyst':'Business Analyst','solution-architect':'Solution Architect','ux-designer':'UI/UX Designer','software-developer':'Developer','project-manager':'Project Manager'});
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
  if(cells.length!==3||/<th\b/i.test(match[1]))continue;
  const email=clean((cells[0].match(/<small\b[^>]*>([^<]*)<\/small>/i)||[])[1],250);
  const name=clean(htmlToText(cells[0].replace(/<small\b[^>]*>[\s\S]*?<\/small>/gi,'')),180);
  const roles=clean(htmlToText(cells[1]),500).split(/\s*;\s*/).filter(Boolean);
  const tasks=clean(htmlToText(cells[2]),1200);
  const id=(match[0].match(/data-atgv-account="([^"]+)"/i)||[])[1]||'';
  if(!email&&!id)continue;
  rows.push({id:clean(id,200),email,name,roles:[...new Set(roles)],tasks});
 }
 return rows.slice(0,400);
}
function renderRows(rows){
 return '<p>ATGV My Work user register. Names and roles originate from signed-in Jira identities and actual My Work visits. Jira tasks reflect the latest verified user visit.</p>'+
 '<table><tbody><tr><th>Name</th><th>Roles</th><th>JIRA Task</th></tr>'+
 rows.map(row=>'<tr data-atgv-account="'+escape(row.id)+'"><td>'+escape(row.name)+'<p><small>'+escape(row.email)+'</small></p></td><td>'+escape(row.roles.join('; '))+'</td><td>'+escape(row.tasks||'No assigned task')+'</td></tr>').join('')+'</tbody></table>';
}
async function locate(config,token,projectKey){
 const space=await getConfluenceSpace(config,token),name=title(projectKey);
 const url=baseConfluence(config)+'/api/v2/spaces/'+encodeURIComponent(space.id)+'/pages?limit=100&title='+encodeURIComponent(name);
 const found=await requestJson(url,{token,basicEmail:config.get('jira.email')});
 const matches=(found.results||[]).filter(x=>x.title===name&&x.status==='current');
 if(matches.length>1)throw Error('Multiple Confluence registers have the same title. Resolve duplicates before updating.');
 const page=matches.length?await getConfluencePage(config,token,matches[0].id):null;
 if(page&&(!String(page.body?.storage?.value||'').includes('ATGV My Work user register')))
   throw Error('A Confluence page with this name already exists and is not an ATGV register.');
 return {space,page,name};
}
async function snapshot(config,token,projectKey){
 const found=await locate(config,token,projectKey);
 return {rows:extractRows(found.page?.body?.storage?.value||''),pageId:String(found.page?.id||''),spaceKey:found.space.key,updatedAt:found.page?.version?.createdAt||''};
}
async function visit(config,token,{projectKey,roleId}){
 const role=ROLES[roleId];if(!role)throw Error('Unknown role cannot be added to the register.');
 const auth={token,basicEmail:config.get('jira.email')};
 const me=await requestJson(baseAtlassian(config)+'/rest/api/3/myself',auth);
 if(!me?.accountId)throw Error('Jira did not verify the current user.');
 const email=clean(me.emailAddress||config.get('jira.email'),250).toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('User email is unavailable. The Confluence register was not changed.');
 const name=displayName(email)||clean(me.displayName)||'Unknown';
 const project=validProjectKey(projectKey);
 let tasks='No assigned task';
 try{
  const result=await requestJson(baseAtlassian(config)+'/rest/api/3/search/jql',{...auth,method:'POST',data:{
   jql:'project = "'+project+'" AND assignee = currentUser() ORDER BY updated DESC',
   maxResults:30,fields:['summary','status','assignee']}});
  const issues=(result.issues||[]).filter(x=>new RegExp('^'+project+'-\\d+$').test(String(x.key||'')));
  if(issues.length)tasks=issues.map(x=>x.key+' ('+clean(x.fields?.status?.name,50)+')').join('; ')+(result.nextPageToken?'; …':'');
 }catch{tasks='Jira tasks unavailable';}
 for(let attempt=0;attempt<3;attempt++){
  const {space,page,name:pageName}=await locate(config,token,project);
  const rows=extractRows(page?.body?.storage?.value||'');
  const current=rows.find(x=>x.id===me.accountId||x.email.toLowerCase()===email);
  if(current){current.id=me.accountId;current.email=email;current.name=name;current.tasks=tasks;current.roles=[...new Set([...current.roles,role])];}
  else rows.push({id:me.accountId,email,name,roles:[role],tasks});
  rows.sort((a,b)=>a.name.localeCompare(b.name));
  try{
   const saved=await writeConfluence(config,token,{pageId:page?.id,spaceId:space.id,title:pageName,bodyHtml:renderRows(rows),version:page?.version?.number});
   return {rows,pageId:String(saved.id||page?.id||''),spaceKey:space.key,updatedAt:new Date().toISOString()};
  }catch(error){
   if(/version conflict|HTTP (409|412)/i.test(error.message)&&attempt<2)continue;
   throw error;
  }
 }
 throw Error('Concurrent Confluence edits prevented the register from being saved.');
}
module.exports={ROLES,displayName,title,extractRows,renderRows,locate,snapshot,visit};
