'use strict';
// Only human-approved designs linked to this BR revision may constrain the
// generated application. A Jira UX ticket is not itself an approval.
const fs=require('node:fs/promises');
const path=require('node:path');
const proposals=require('./design-proposals');
const uxPipeline=require('./ux-design-pipeline');
const {safeKey}=require('./developer-task-artifacts');
const SUPPORTED=new Set(['design','mockup','prototype','ux']);
function forBr(register,brId,revision){
 const results=[];
 for(const [kind,versions] of Object.entries(register?.designs||{})){
  if(!SUPPORTED.has(kind)||!Array.isArray(versions))continue;
  const matching=versions.filter(item=>item.status==='approved'&&item.design&&
   Array.isArray(item.sourceBusinessRequirements)&&item.sourceBusinessRequirements.some(link=>
    link.id===brId&&Number(link.revision)===Number(revision)));
  const selected=matching.at(-1);
  if(!selected)continue;
  const design=selected.design;
  results.push({kind,number:selected.number||0,title:String(design.title||'').slice(0,160),
   summary:String(design.summary||'').slice(0,2500),
   screens:(design.screens||[]).slice(0,12).map(screen=>({
    name:String(screen.name||'').slice(0,110),purpose:String(screen.purpose||'').slice(0,400),
    components:(screen.components||[]).slice(0,30).map(x=>String(x).slice(0,160)),
    interactions:(screen.interactions||[]).slice(0,30).map(x=>String(x).slice(0,180))})),
   flows:(design.flows||[]).slice(0,20).map(x=>String(x).slice(0,200)),
   tokens:kind==='design'&&design.tokens?JSON.parse(JSON.stringify(design.tokens).slice(0,6000)):undefined});
 }
 return results.length?results:null;
}
function linkedJiraKeys(register,brId){
 const keys=new Set();
 for(const [node,item] of Object.entries(register?.synced||{})){
  if((node===brId||node.startsWith(brId+'/'))&&item?.key){try{keys.add(safeKey(item.key));}catch{}}
 }
 const br=(register?.brs||[]).find(row=>row.id===brId);
 for(const value of [br?.jiraKey,...(br?.jiraIssues||[]).map(issue=>issue.key)]){
  if(value)try{keys.add(safeKey(value));}catch{}
 }
 return keys;
}
async function ticketDesignsForBr(root,register,brId,{approvedHash=''}={}){
 if(!root)return [];
 const matchingKeys=linkedJiraKeys(register,brId);
 // Never associate an unrelated ticket simply because it shares an aggregate
 // project BR hash: the Jira Story link must also match this exact BR.
 if(!matchingKeys.size)return [];
 const dir=path.join(path.resolve(root),'documents','jira-designs');
 const entries=await fs.readdir(dir,{withFileTypes:true}).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));
 if(entries.length>300)throw Error('Too many UI/UX design tickets for safe approved-design discovery.');
 const result=[];
 for(const entry of entries){
  if(!entry.isDirectory()||entry.isSymbolicLink())continue;
  let key;try{key=safeKey(entry.name);}catch{continue;}
  if(key!==entry.name)continue;
  const record=await uxPipeline.read(root,key);
  if(!record.exists||record.status!=='approved')continue;
  const storyKey=record.sourceStoryKey||record.key;
  if(!matchingKeys.has(storyKey)&&!matchingKeys.has(record.key))continue;
  // If provided, the approved BR snapshot hash must still match the design.
  // Old workflows with no source hash cannot silently qualify.
  if(approvedHash&&record.sourceBRHash!==approvedHash)continue;
  const screens=(record.prototype?.screens||[]).slice(0,12).map(screen=>({
   name:String(screen.name||'').slice(0,150),purpose:String(screen.purpose||'').slice(0,600),
   components:(screen.components||[]).slice(0,24).map(x=>String(x).slice(0,230)),
   interactions:(screen.interactions||[]).slice(0,24).map(x=>String(x).slice(0,260))
  }));
  if(!screens.length)continue;
  result.push({kind:'ux-ticket',number:record.revisionNumber,sourceTicketKey:key,
   sourceStoryKey:storyKey,sourceBrId:String(record.sourceBrId||''),sourceTaskKeys:record.sourceTaskKeys||[],designReferenceHash:String(record.designReferenceHash||''),repositorySource:record.repositorySource||null,designFramework:record.repositorySource?.hasDesign?'repository':String(record.designFramework||'').slice(0,40),
   approvedBy:String(record.reviewedBy||'').slice(0,140),approvedAt:String(record.reviewedAt||''),
   title:`Approved UI/UX for ${record.sourceBrId||storyKey}`,summary:String(record.handoff?.summary||'').slice(0,1600),
   screens,flows:(record.flow?.nodes||[]).slice(0,16).map(node=>String(node.label||'').slice(0,160)),
   accessibility:(record.handoff?.accessibility||[]).slice(0,12).map(x=>String(x).slice(0,200))});
 }
 const whole=result.filter(item=>item.sourceBrId===brId);
 return whole.length?whole:result;
}
async function loadForBr(registry,projectId,brId,revision,options={}){
 const register=await proposals.load(registry,projectId);
 const normal=forBr(register,brId,revision)||[];
 const ticket=options.root?await ticketDesignsForBr(options.root,options.brRegister||{},brId,options):[];
 const combined=[...normal,...ticket];
 return combined.length?combined:null;
}
function requireMappedDesign(register,brId,handoff){
 const linked=[...Object.entries(register?.synced||{}),...Object.entries(register?.roleTaskMappings||{})];
 const required=linked.some(([node,row])=>node.startsWith(brId+'/')&&(
  /\/ROLE-(?:UX|UIUX|UX-DESIGNER|UI-UX-DESIGNER)(?:\/|$)/i.test(node)||
  /^(?:ux-designer|uiux|ui-ux-designer|atgv-role-ux-designer)$/i.test(String(row?.roleId||row?.roleLabel||''))||
  /^(?:UI\/UX Design|UX Design|User Flow|Wireframe|Interactive Prototype|Developer Handoff)\b/i.test(String(row?.title||''))
 ));
 if(required&&!handoff?.some(item=>Array.isArray(item.screens)&&item.screens.length))throw Error('Current approved UI/UX design is required for this BR. Ask the Designer to approve the current revision.');
 return true;
}
module.exports={forBr,linkedJiraKeys,ticketDesignsForBr,loadForBr,requireMappedDesign};
