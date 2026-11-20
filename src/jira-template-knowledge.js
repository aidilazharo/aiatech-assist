'use strict';
// Source-aware, opt-in TRM-style Story AC / Definition of Done suggestions.
// Templates are suggestions until an authorized BA explicitly approves them.
const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
const ITEMS=Object.freeze([
 'A failing test is written first; positive and negative cases pass.',
 'Lint, type check and all backend and frontend tests pass.',
 'Coverage is at least 99% on lines, statements, functions and branches.',
 'If the API changed, schemas and the OpenAPI file are updated and the contract test passes.',
 'If the data structure changed, a migration is created and reviewed.',
 'Every route declares an access rule, and permission checks and hiding of classified fields are tested.',
 'All screen text uses translation keys, and accessibility meets WCAG 2.2 AA.',
 'No secrets in code, logs or chat.',
 'A code review has been run.'
]);
const template=()=>({schema:1,id:'trm-story-dod',version:1,origin:'TRM_Application_Req.xlsx > Definition of Done sheet',
 status:'proposed',scope:'project-only',items:[...ITEMS],style:'Given / When / Then',approvedBy:null,approvedAt:null});
const folder=root=>path.join(root,'knowledge');const file=root=>path.join(folder(root),'jira-story-template.json');
async function load(root){try{const d=JSON.parse(await fs.readFile(file(root),'utf8'));
 if(d.schema!==1||d.id!=='trm-story-dod'||!Array.isArray(d.items)||d.items.some(x=>typeof x!=='string'))throw Error('Invalid Jira template store.');return d;
 }catch(e){if(e.code==='ENOENT')return template();throw e;}}
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function approve(root,actor){const current=await load(root);if(current.status==='approved')return current;
 const owner=String(actor||'').trim();if(!owner||owner.length>200)throw Error('Verified Business Analyst approval identity required.');
 const approved={...current,status:'approved',approvedBy:owner,approvedAt:new Date().toISOString(),sourceHash:hash({origin:current.origin,items:current.items})};
 const dir=folder(root);await fs.mkdir(dir,{recursive:true});
 // Never put the unapproved TRM template in searchable project knowledge.
 const md=['# Approved Jira Story Definition of Done template','',`Source: ${approved.origin}`,
  `Approved by: ${owner}`,`Approved at: ${approved.approvedAt}`,'Scope: this project only','','## Checklist','',
  ...approved.items.map(x=>'- [ ] '+x)].join('\n')+'\n';
 for(const [dest,body] of [[file(root),JSON.stringify(approved,null,2)+'\n'],[path.join(dir,'jira-approved-trm-story-template.md'),md]]){
  const temp=dest+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,body,{flag:'wx',mode:0o600});await fs.rename(temp,dest);
 }
 return approved;
}
function extractGwt(text){const lines=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
 return lines.filter(x=>/\bgiven\b[\s\S]*\b(?:when|then)\b/i.test(x)).slice(0,12).join('\n');}
function suggest(templateRecord,{title='',description='',approvedCriteria='',kind='Story',sourceRef=''}={}){
 const source=[String(approvedCriteria||''),String(description||'')].filter(Boolean).join('\n');
 const evidence=extractGwt(source);
 const paragraphs=source.split(/\n|\.\s+(?=[A-Z])/).map(s=>s.trim()).filter(x=>/\bshall\b|\bmust\b|\brequire\b|\bprevent\b/i.test(x));
 const acceptanceCriteria=evidence||paragraphs.slice(0,8).map((x,i)=>(i+1)+'. Verify: '+x.slice(0,450)).join('\n');
 const approved=templateRecord?.status==='approved';
 const definitionOfDone=approved&&/story/i.test(kind)?templateRecord.items.map(x=>'[ ] '+x).join('\n'):'';
 return {title:String(title).slice(0,150),sourceRef,acceptanceCriteria:acceptanceCriteria.slice(0,5000),
  definitionOfDone:definitionOfDone.slice(0,5000),
  acOrigin:evidence?'Source-derived Given/When/Then':'Source-based proposed verification statements — BA review required',
  dodOrigin:approved?'Approved project TRM template '+templateRecord.version:'Not approved for this project — review template in Knowledge & RAG',
  templateApproved:approved};
}

// Confluence sync is explicit and never silently publishes or overwrites templates.
// The project identity, signed-off item content and source hash are verified before
// moving content between approved local knowledge and the configured Confluence space.
function templateValid(record){
 if(!record||record.schema!==1||record.id!=='trm-story-dod'||record.status!=='approved'||record.scope!=='project-only'||
  !Array.isArray(record.items)||record.items.length<1||record.items.length>30||record.items.some(x=>typeof x!=='string'||x.length>900)||
  !record.approvedBy||!record.approvedAt||record.origin!=='TRM_Application_Req.xlsx > Definition of Done sheet'||
  record.sourceHash!==hash({origin:record.origin,items:record.items}))throw Error('Approved TRM template record is invalid or has changed; no Confluence sync.');
 return record;
}
const remoteBody=(record,projectId)=>{
 const data=Buffer.from(JSON.stringify({projectId,template:templateValid(record)}),'utf8').toString('base64');
 return '<p>ATGV Approved Project Jira Story Definition of Done (version-controlled). Changes require explicit BA reapproval.</p><pre data-atgv-approved-jira-template="1">'+data+'</pre>';
};
function parseRemoteBody(html,projectId){
 const text=String(html||'');
 const matches=[...text.matchAll(/<pre data-atgv-approved-jira-template="1">([A-Za-z0-9+/=]+)<\/pre>/g)];
 if(matches.length!==1||matches[0][1].length>30000)throw Error('Remote Confluence template page has unrecognized format or multiple records; no local changes.');
 const payload=JSON.parse(Buffer.from(matches[0][1],'base64').toString('utf8'));
 if(payload.projectId!==projectId)throw Error('Confluence template belongs to another project; no local changes.');
 return templateValid(payload.template);
}
async function persistApproved(root,approved){
 templateValid(approved);
 const dir=folder(root);await fs.mkdir(dir,{recursive:true});
 const md=['# Approved Jira Story Definition of Done template','',`Source: ${approved.origin}`,
  `Approved by: ${approved.approvedBy}`,`Approved at: ${approved.approvedAt}`,'Scope: this project only','','## Checklist','',
  ...approved.items.map(x=>'- [ ] '+x)].join('\n')+'\n';
 for(const [dest,body] of [[file(root),JSON.stringify(approved,null,2)+'\n'],[path.join(dir,'jira-approved-trm-story-template.md'),md]]){
  const temp=dest+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,body,{flag:'wx',mode:0o600});await fs.rename(temp,dest);
 }
}
async function syncConfluence(root,{projectId,projectKey,config,token,clients}){
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(projectId||''))||!/^[A-Z][A-Z0-9_]{1,20}$/.test(String(projectKey||'')))throw Error('Verified project identity required for Confluence template sync.');
 if(!token||!clients||typeof clients.getConfluenceSpace!=='function')throw Error('Confluence connection is required.');
 const space=await clients.getConfluenceSpace(config,token), title='ATGV Approved Jira DoD - '+projectKey+' - '+hash(projectId).slice(0,10);
 const origin=clients.baseConfluence(config);
 const result=await clients.requestJson(origin+'/api/v2/spaces/'+encodeURIComponent(space.id)+'/pages?limit=100',{token,basicEmail:String(config.get('jira.email')||'').trim()});
 const matches=(result.results||[]).filter(p=>p.title===title&&p.status!=='trashed');
 if(matches.length>1)throw Error('Multiple Confluence Jira template pages found. Manual reconciliation required.');
 const current=await load(root);
 if(matches.length){
  const page=await clients.getConfluencePage(config,token,matches[0].id);
  if(page.title!==title||page.spaceId&&String(page.spaceId)!==String(space.id))throw Error('Confluence project template identity changed.');
  const remote=parseRemoteBody(page.body?.storage?.value,projectId);
  if(current.status==='approved'){
   templateValid(current);
   if(current.sourceHash!==remote.sourceHash)throw Error('Confluence template differs from local approved template. Compare and reapprove; no overwrite.');
   return {status:'already-synced',template:current,pageId:String(page.id)};
  }
  await persistApproved(root,remote);
  return {status:'imported',template:remote,pageId:String(page.id)};
 }
 if(current.status!=='approved')throw Error('No approved template in the project or Confluence. Approve the TRM checklist before syncing.');
 const approved=templateValid(current);
 const created=await clients.writeConfluence(config,token,{spaceId:String(space.id),title,bodyHtml:remoteBody(approved,projectId)});
 if(!created?.id)throw Error('Confluence did not confirm approved template publication.');
 return {status:'published',template:approved,pageId:String(created.id)};
}

module.exports={ITEMS,template,load,approve,suggest,extractGwt,hash,syncConfluence,parseRemoteBody,remoteBody};
