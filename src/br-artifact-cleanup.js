'use strict';
// BR-scoped artifact retirement. Never search by a BR title or delete shared
// technology-stack, main, unowned Jira, or untracked project content.
const fs=require('node:fs/promises');
const path=require('node:path');
const {safeKey}=require('./developer-task-artifacts');
const projectUX=require('./project-ux-prototype');
const ROOTS=['jira-designs','jira-artifacts','jira-delivery'];
function ownership(register,brIds){
 const selected=new Set(brIds),all=[...Object.entries(register.synced||{}),...Object.entries(register.roleTaskMappings||{})];
 const keys=new Set(),stories=new Set();
 for(const [nodePath,item] of all){
  if(!selected.has(nodePath.split('/')[0]))continue;
  const key=safeKey(item.key);keys.add(key);
  if(/\/S-[0-9]+$/.test(nodePath))stories.add(key);
  if(item.storyKey)stories.add(safeKey(item.storyKey));
 }
 for(const [nodePath,item] of all){
  if(selected.has(nodePath.split('/')[0]))continue;
  if(item?.key&&keys.has(safeKey(item.key)))throw Error('Jira '+item.key+' is shared with another BR; artifact deletion blocked.');
  if(item?.storyKey&&stories.has(safeKey(item.storyKey)))throw Error('Story '+item.storyKey+' is linked to another BR; code cleanup blocked.');
 }
 return {keys:[...keys].sort(),stories:[...stories].sort()};
}
async function safeRemoveTree(root,location){
 const base=path.resolve(root),target=path.resolve(location),relative=path.relative(base,target);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Artifact path is outside this project.');
 let current=base;
 for(const part of relative.split(path.sep)){
  current=path.join(current,part);
  const st=await fs.lstat(current).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(st?.isSymbolicLink())throw Error('Symlink found in BR artifact path: '+relative);
  if(st&&!st.isDirectory()&&current!==target)throw Error('Invalid BR artifact parent: '+relative);
 }
 const st=await fs.lstat(target).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!st)return false;
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe BR-owned artifact directory: '+relative);
 let count=0;
 async function scan(dir){
  for(const item of await fs.readdir(dir,{withFileTypes:true})){
   if(++count>1500||item.isSymbolicLink()||(!item.isFile()&&!item.isDirectory()))throw Error('Unsafe or oversized BR artifact tree: '+relative);
   if(item.isDirectory())await scan(path.join(dir,item.name));
  }
 }
 await scan(target);await fs.rm(target,{recursive:true,force:false});return true;
}
async function safeRemoveFile(root,file){
 const base=path.resolve(root),loc=path.resolve(file),relative=path.relative(base,loc);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Unsafe prototype path.');
 let curr=base;
 for(const part of relative.split(path.sep).slice(0,-1)){
  curr=path.join(curr,part);
  const st=await fs.lstat(curr).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
  if(st?.isSymbolicLink()||(st&&!st.isDirectory()))throw Error('Unsafe prototype parent.');
 }
 const st=await fs.lstat(loc).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!st)return false;
 if(st.isSymbolicLink()||!st.isFile())throw Error('Unsafe prototype preview.');
 await fs.unlink(loc);return true;
}
async function cleanup(root,{keys=[]}={}){
 const basedir=path.resolve(root),removed=[];
 const unique=[...new Set(keys.map(safeKey))];
 // Remove per-task source first, so reconciliation cannot recreate a deleted
 // screen from a still-approved on-disk ticket after we retract its manifest.
 for(const key of unique){
  for(const folder of ROOTS)if(await safeRemoveTree(basedir,path.join(basedir,'documents',folder,key)))removed.push(folder+'/'+key);
  if(await safeRemoveFile(basedir,path.join(basedir,'documents','project-prototype','preview-'+key+'.html')))removed.push('project-prototype/preview-'+key+'.html');
  const result=await projectUX.retract(basedir,key);
  if(result.changed)removed.push('project-prototype:'+key);
 }
 return {removed,keys:unique};
}
module.exports={ownership,cleanup,safeRemoveTree};
