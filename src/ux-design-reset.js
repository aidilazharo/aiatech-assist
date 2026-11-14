'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {withLock}=require('./file-lock');
const pipeline=require('./ux-design-pipeline');
const drafts=require('./ux-ticket-designs');
const {safeKey}=require('./developer-task-artifacts');
const projectUX=require('./project-ux-prototype');
const GENERATED=/^(?:ui-ux-workflow(?:-v[1-9][0-9]*)?\.json|(?:wireframe|mockup)\.json|(?:wireframe|mockup)-r[1-9][0-9]*-screen-[0-9]{2}\.svg)$/;
async function erase(root,key,expectedRevision){
 const id=safeKey(key),file=pipeline.location(root,id);await drafts.checkPath(root,file);
 return withLock(file,async()=>{
  const current=await pipeline.read(root,id);
  if(!current.exists)throw Error('No generated UI/UX design exists to delete.');
  if(current.revision!==String(expectedRevision||''))throw Error('UI/UX design changed. Reload before deleting.');
  const folder=path.dirname(file),entries=await fs.readdir(folder,{withFileTypes:true});
  if(entries.length>500)throw Error('Too many design artifacts for safe deletion.');
  const files=[];
  for(const entry of entries){
   if(!GENERATED.test(entry.name))continue;
   if(!entry.isFile()||entry.isSymbolicLink())throw Error('Unsafe generated design artifact '+entry.name);
   const dest=path.join(folder,entry.name);await drafts.checkPath(root,dest);files.push(dest);
  }
  // Remove the shared approved prototype contribution before the workflow
  // record. Other tickets and externally published Git/Jira data stay intact.
  await projectUX.retract(root,id);
  const preview=path.join(path.resolve(root),'documents','project-prototype','preview-'+id+'.html');
  await drafts.checkPath(root,preview);
  const previewStat=await fs.lstat(preview).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(previewStat){if(!previewStat.isFile()||previewStat.isSymbolicLink())throw Error('Unsafe generated UI/UX preview.');await fs.unlink(preview);}
  // Deleting named generated assets only avoids removing reference images,
  // design framework selection, and unrelated developer evidence.
  for(const target of files)await fs.unlink(target);
  return {value:await pipeline.read(root,id),deletedFiles:files.length,referenceImagesPreserved:true};
 });
}
module.exports={erase,GENERATED};
