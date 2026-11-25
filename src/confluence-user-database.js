'use strict';
// Confluence Database API v2 stores the ATGV roster as a versioned content
// property. GET /databases/{id} returns metadata only, not native table rows.
// The legacy Confluence page remains a compatible, human-readable backup.
const {requestJson,baseConfluence,getConfluenceSpace}=require('./clients');
const {validProjectKey}=require('./remote-actions');
const PROPERTY_KEY='atgv.my-work-users.v1';
const clean=(v,n=200)=>String(v??'').trim().slice(0,n);
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const auth=(config,token)=>({token,basicEmail:config.get('jira.email')});
function databaseTitle(projectKey){return 'ATGV My Work Users - '+validProjectKey(projectKey);}
function normalizeRows(rows){
 const result=[],byId=new Map(),byEmail=new Map(),conflicts=[];
 for(const raw of Array.isArray(rows)?rows:[]){
  const id=clean(raw?.id),email=clean(raw?.email,250).toLowerCase();
  if(!id&&!EMAIL.test(email))continue;
  const name=clean(raw?.name)||email||id;
  const roles=[...new Set((Array.isArray(raw?.roles)?raw.roles:[]).map(x=>clean(x,80)).filter(Boolean))];
  const tasks=clean(raw?.tasks,2000);
  // Never merge two different Atlassian IDs merely because emails match.
  const byIdentity=id?byId.get(id):null,byAddress=EMAIL.test(email)?byEmail.get(email):null;
  if(byAddress&&id&&byAddress.id&&id!==byAddress.id){
   conflicts.push('Duplicate email belongs to different Jira account IDs: '+email);
   continue;
  }
  const match=byIdentity||byAddress;
  if(match){
   if(id&&!match.id){match.id=id;byId.set(id,match);}
   if(email&&!match.email){match.email=email;byEmail.set(email,match);}
   if(name&&(!match.name||match.name===match.email))match.name=name;
   match.roles=[...new Set([...match.roles,...roles])];
   if(tasks&&tasks!=='No assigned task')match.tasks=tasks;
  }else{
   const user={id,email:EMAIL.test(email)?email:'',name,roles,tasks};
   result.push(user);if(id)byId.set(id,user);if(user.email)byEmail.set(user.email,user);
  }
 }
 if(result.length>400)throw Error('ATGV roster has more than 400 users.');
 return {rows:result.sort((a,b)=>a.name.localeCompare(b.name)),conflicts};
}
class ConfluenceUserDatabase{
 constructor(config,token,projectKey,{request=requestJson,spaceProvider=getConfluenceSpace}={}){
  this.config=config;this.token=token;this.projectKey=validProjectKey(projectKey);
  this.request=request;this.spaceProvider=spaceProvider;
  this.base=baseConfluence(config);this.credentials=auth(config,token);
 }
 async locate({create=false}={}){
  const space=await this.spaceProvider(this.config,this.token),title=databaseTitle(this.projectKey);
  // Confluence v2 has no GET /databases listing endpoint. Search for the
  // database identity with Confluence CQL, then use v2 for all DB operations.
  const cql='type = database AND space = "'+space.key+'" AND title = "'+title+'"';
  const response=await this.request(this.base+'/rest/api/content/search?limit=25&cql='+encodeURIComponent(cql),this.credentials);
  const matches=(response.results||[]).filter(x=>x.type==='database'&&x.title===title);
  if(matches.length>1)throw Error('Multiple ATGV user databases found. Resolve duplicates before writing.');
  let db=matches[0]||null;
  if(!db&&create)db=await this.request(this.base+'/api/v2/databases',{...this.credentials,method:'POST',data:{spaceId:String(space.id),title}});
  if(!db)return {space,database:null};
  if(!/^\d+$/.test(String(db.id||'')))throw Error('Confluence database returned invalid ID.');
  const verified=await this.request(this.base+'/api/v2/databases/'+encodeURIComponent(db.id),this.credentials);
  if(verified.title!==title||String(verified.spaceId)!==String(space.id)||verified.status==='trashed')
   throw Error('Confluence database identity does not match this project and space.');
  return {space,database:verified};
 }
 async read({create=false}={}){
  const {space,database}=await this.locate({create});
  if(!database)return {space,db:null,property:null,rows:[]};
  const endpoint=this.base+'/api/v2/databases/'+encodeURIComponent(database.id)+'/properties';
  const list=await this.request(endpoint+'?key='+encodeURIComponent(PROPERTY_KEY)+'&limit=25',this.credentials);
  const matches=(list.results||[]).filter(x=>x.key===PROPERTY_KEY);
  if(matches.length>1)throw Error('Multiple ATGV roster properties found. Do not overwrite.');
  let property=matches[0]||null;
  if(property&&property.value===undefined)
   property=await this.request(endpoint+'/'+encodeURIComponent(property.id),this.credentials);
  const value=property?.value;
  if(property&&(!value||value.schema!==1||value.projectKey!==this.projectKey||String(value.spaceId)!==String(space.id)))
   throw Error('Confluence roster property does not match this project/space.');
  if(property&&!Array.isArray(value.rows))
    throw Error('Confluence Database v2 roster property has no valid rows array. No users were overwritten.');
   const normalized=normalizeRows(value?.rows||[]);
  if(normalized.conflicts.length)throw Error(normalized.conflicts.join('; '));
  return {space,db:database,property,rows:normalized.rows};
 }
 async upsert(incoming){
  const cleaned=normalizeRows(incoming);
  if(cleaned.conflicts.length)throw Error(cleaned.conflicts.join('; '));
  for(let attempt=0;attempt<3;attempt++){
   const current=await this.read({create:true});
   const incomingById=new Map(cleaned.rows.filter(row=>row.id).map(row=>[row.id,row]));
   const prior=current.rows.map(row=>{const incoming=incomingById.get(row.id);return incoming?{...row,name:incoming.name||row.name,email:incoming.email||row.email}:row;});
   const merged=normalizeRows([...prior,...cleaned.rows]);
   if(merged.conflicts.length)throw Error(merged.conflicts.join('; '));
   if(current.property&&JSON.stringify(merged.rows)===JSON.stringify(current.rows))
    return {databaseId:String(current.db.id),rows:current.rows,changed:false};
   const value={schema:1,projectKey:this.projectKey,spaceId:String(current.space.id),updatedAt:new Date().toISOString(),rows:merged.rows};
   const base=this.base+'/api/v2/databases/'+encodeURIComponent(current.db.id)+'/properties';
   try{
    let saved;
    if(current.property){
     const version=Number(current.property.version?.number);
     if(!Number.isSafeInteger(version))throw Error('Confluence roster property has no trustworthy version.');
     saved=await this.request(base+'/'+encodeURIComponent(current.property.id),{...this.credentials,method:'PUT',
      data:{key:PROPERTY_KEY,value,version:{number:version+1,message:'ATGV verified user roster update'}}});
    }else saved=await this.request(base,{...this.credentials,method:'POST',data:{key:PROPERTY_KEY,value}});
    const propertyId=String(saved?.id||current.property?.id||'');
    if(!propertyId)throw Error('Confluence did not return the saved roster property ID.');
    const verified=await this.request(base+'/'+encodeURIComponent(propertyId),this.credentials);
    if(verified.key!==PROPERTY_KEY||verified.value?.projectKey!==this.projectKey||String(verified.value?.spaceId)!==String(current.space.id)||!Array.isArray(verified.value?.rows))throw Error('Saved Confluence roster property could not be verified.');
    const checked=normalizeRows(verified.value.rows);
    if(checked.conflicts.length)throw Error(checked.conflicts.join('; '));
    for(const row of merged.rows){
     const match=checked.rows.find(x=>row.id?x.id===row.id:x.email===row.email);
     if(!match||match.name!==row.name||match.email!==row.email||row.roles.some(role=>!match.roles.includes(role)))throw Error('Confluence database roster read-back does not contain the saved identity and roles.');
    }
    return {databaseId:String(current.db.id),rows:checked.rows,changed:true};
   }catch(error){
    if(!/HTTP (409|412)\b|version conflict/i.test(String(error.message||error))||attempt===2)throw error;
   }
  }
  throw Error('Confluence roster changed concurrently.');
 }
}
module.exports={PROPERTY_KEY,databaseTitle,normalizeRows,ConfluenceUserDatabase};
