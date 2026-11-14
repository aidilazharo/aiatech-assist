'use strict';

// Read-only, project-scoped destination checks. Never create a Jira issue or
// Confluence page just to determine whether a mapping may be saved.
const { requestJson, baseAtlassian, baseConfluence } = require('./clients');

function normalizeMapping(kind, value) {
  const key=String(value||'').trim().toUpperCase();
  if(kind==='jira'){
    if(!/^[A-Z][A-Z0-9_-]{0,39}$/.test(key))throw Error('Enter a valid Jira Project Key (for example TC).');
  }else if(kind==='confluence'){
    if(!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(key))throw Error('Enter a valid Confluence Space Key (for example TCC).');
  }else throw Error('Unsupported project connection.');
  return key;
}

function canCreatePage(operations) {
  if(!Array.isArray(operations))return false;
  return operations.some(entry=>{
    const op=typeof entry?.operation==='object'?entry.operation.key:entry?.operation;
    const target=entry?.targetType||entry?.operation?.targetType||entry?.operation?.target;
    return String(op).toLowerCase()==='create'&&String(target).toLowerCase()==='page';
  });
}

async function validateProjectConnection({kind,key,config,token,request=requestJson}) {
  const selected=normalizeMapping(kind,key);
  if(!token)throw Error('Atlassian API token is missing. Configure it in Extension Settings.');
  const auth={token,basicEmail:String(config.get('jira.email')||'').trim()};
  if(!auth.basicEmail)throw Error('Jira email is missing from Extension Settings.');
  if(kind==='jira'){
    const site=baseAtlassian(config);
    let project;
    try {project=await request(`${site}/rest/api/3/project/${encodeURIComponent(selected)}`,auth);}
    catch(e){throw Error(`Jira project ${selected} is not accessible. Check its key and Browse Projects permission. ${e.message}`);}
    if(String(project?.key||'').toUpperCase()!==selected)throw Error('Jira returned a different project key. Mapping was not saved.');
    let permissions;
    try {permissions=await request(`${site}/rest/api/3/mypermissions?projectKey=${encodeURIComponent(selected)}&permissions=BROWSE_PROJECTS%2CCREATE_ISSUES`,auth);}
    catch(e){throw Error(`Could not confirm Jira permissions for ${selected}: ${e.message}. Mapping was not saved.`);}
    const browse=permissions?.permissions?.BROWSE_PROJECTS?.havePermission;
    const create=permissions?.permissions?.CREATE_ISSUES?.havePermission;
    if(browse!==true||create!==true){
      const denied=[browse!==true?'Browse Projects':'',create!==true?'Create Issues':''].filter(Boolean).join(' and ');
      throw Error(`Jira project ${selected}: ${denied} permission is missing or could not be confirmed. Ask a project administrator to grant access. Mapping was not saved.`);
    }
    return {kind,key:selected,name:String(project.name||selected).slice(0,160),id:String(project.id||''),permissions:['Browse Projects','Create Issues'],message:`Jira ${selected}: Browse Projects and Create Issues verified. You can save this mapping.`};
  }
  const site=baseConfluence(config);
  let result;
  try {result=await request(`${site}/api/v2/spaces?keys=${encodeURIComponent(selected)}&limit=5`,auth);}
  catch(e){throw Error(`Confluence space ${selected} is not accessible: ${e.message}`);}
  const space=(result?.results||[]).find(item=>String(item?.key||'').toUpperCase()===selected);
  if(!space||!/^[0-9]+$/.test(String(space.id||'')))throw Error(`Confluence space ${selected} was not found or is not readable. Mapping was not saved.`);
  let detail;
  try {detail=await request(`${site}/api/v2/spaces/${space.id}?include-operations=true`,auth);}
  catch(e){throw Error(`Could not check Confluence permissions for ${selected}: ${e.message}. Mapping was not saved.`);}
  if(String(detail?.key||'').toUpperCase()!==selected||String(detail?.id)!==String(space.id))throw Error('Confluence returned a different space. Mapping was not saved.');
  if(!canCreatePage(detail?.operations?.results))throw Error(`Confluence ${selected}: space is readable, but Create Page permission was denied or could not be confirmed. Ask a space administrator to grant page creation permission. Mapping was not saved.`);
  return {kind,key:selected,id:String(space.id),name:String(detail.name||space.name||selected).slice(0,160),permissions:['View Space','Create Page'],message:`Confluence ${selected}: View Space and Create Page verified. You can save this mapping.`};
}

module.exports={normalizeMapping,canCreatePage,validateProjectConnection};
