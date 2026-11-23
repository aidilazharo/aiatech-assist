'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

// Probe only an exclusive, randomly named temporary file created by this
// function. Never modify, rename or remove an existing user file.
async function probeDirectory(target,{fsApi=fs,makeId=()=>crypto.randomUUID()}={}){
 if(!target||typeof target!=='string')return {ok:false,read:false,write:false,detail:'No folder is available to check.'};
 const wanted=path.resolve(target);let dir=wanted,stat;
 while(true){
  try{stat=await fsApi.stat(dir);break;}catch(error){
   if(error.code!=='ENOENT')return {ok:false,read:false,write:false,detail:String(error.message||error)};
   const parent=path.dirname(dir);if(parent===dir)return {ok:false,read:false,write:false,detail:'No existing parent folder is available.'};dir=parent;
  }
 }
 if(!stat.isDirectory())return {ok:false,read:false,write:false,detail:'A required folder path is not a directory: '+dir};
 try{await fsApi.readdir(dir);}catch(error){return {ok:false,read:false,write:false,detail:'Cannot read '+dir+': '+String(error.message||error)};}
 const file=path.join(dir,'.atgv-permission-'+makeId()+'.tmp');let handle=null,created=false,write=false,errorMessage='';
 try{
  handle=await fsApi.open(file,'wx',0o600);created=true;
  await handle.writeFile('ATGV permission check');await handle.close();handle=null;
  if(String(await fsApi.readFile(file,'utf8'))!=='ATGV permission check')throw Error('Temporary file could not be verified.');
  write=true;
 }catch(error){errorMessage='Cannot write/read in '+dir+': '+String(error.message||error);}
 finally{
  if(handle)try{await handle.close();}catch{}
  if(created)try{await fsApi.unlink(file);}catch(error){write=false;errorMessage='Cannot remove the temporary permission check in '+dir+': '+String(error.message||error);}
 }
 return {ok:write,read:true,write,detail:errorMessage||(dir===wanted?'Read and write verified.':'Read and write verified in existing parent '+dir+'; the target folder is not created yet.'),path:wanted,probed:dir};
}
async function check({workspacePath,additionalWorkspacePaths=[],projectPath='',extensionPath,storagePath,trusted=true,workspaceWritable,fsApi=fs,onProgress=()=>{}}={}){
 const trust={id:'workspace',label:'VS Code workspace',ok:trusted!==false&&workspaceWritable!==false,
  detail:trusted===false?'Trust this VS Code workspace before continuing.':workspaceWritable===false?'The VS Code filesystem provider reports this workspace is read-only.':'Workspace trust and filesystem provider checked.'};
 const groups=[
  {id:'folders',label:'Workspace and project folders',paths:[workspacePath,...additionalWorkspacePaths,workspacePath?path.join(workspacePath,'projects'):'',...(projectPath?[projectPath,path.join(projectPath,'documents'),path.join(projectPath,'sdlc'),path.join(projectPath,'templates')]:[])]},
  {id:'extension',label:'Extension install and update',paths:[extensionPath,extensionPath?path.dirname(extensionPath):'',storagePath?path.join(storagePath,'updates'):'']},
  {id:'library',label:'SDLC Library install and update',paths:[workspacePath?path.join(workspacePath,'.atgv'):'',workspacePath?path.join(workspacePath,'.atgv','library'):'',storagePath?path.join(storagePath,'updates'):'']}
 ];
 await onProgress(trust);
 const rows=await Promise.all(groups.map(async group=>{
  const paths=await Promise.all(group.paths.map(target=>probeDirectory(target,{fsApi})));
  const failed=paths.filter(item=>!item.ok);
  const value={id:group.id,label:group.label,ok:failed.length===0,read:paths.every(item=>item.read),write:paths.every(item=>item.write),
   detail:failed.length?failed.map(item=>item.detail).join(' | '):'Read and write checks passed.'+(group.id==='extension'?' VS Code may still enforce its own installation policies.':''),paths};
  await onProgress(value);return value;
 }));
 const checks=[trust,...rows];return {ok:checks.every(row=>row.ok),checks};
}
module.exports={probeDirectory,check};
