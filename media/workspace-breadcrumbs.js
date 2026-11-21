'use strict';
// Declarative, UI-only breadcrumb routes. Never mutate project or remote state.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVWorkspaceBreadcrumbs=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const PAGE=Object.freeze({
  gate:[['Projects',null]],
  landing:[['Overview',null]],
  myWork:[['My Work',null]],
  settings:[['Settings',null]],
  project:[['Settings','settings'],['Project Settings',null]],
  library:[['Library Studio',null]],
  documents:[['Documents',null]],
  planning:[['Solution Designs',null]],
  flow:[['SDLC','flow'],['Readiness',null]],
  operations:[['Approvals & Handoffs',null]],
  knowledge:[['Knowledge & RAG',null]],
  uxPreview:[['My Work','my-work'],['Role Workspace','role-workspace'],['UI/UX Designer','ux-work'],['Design Preview',null]],
  documentEditor:[['Documents','documents'],['Document',null]]
 });
 const ROLES=Object.freeze({
  'solution-architect':'Solution Architect','software-developer':'Developer',
  'project-manager':'Project Manager','ux-designer':'UI/UX Designer',
  'technical-lead':'Technical Lead','qa-engineer':'QA Engineer',
  'product-owner':'Product Owner','scrum-master':'Scrum Master',
  'security-engineer':'Security Engineer','data-engineer':'Data Engineer',
  'uat-tester':'UAT Tester','release-manager':'Release Manager',
  'technical-writer':'Technical Writer','operations-support':'Operations Support',
  'business-owner':'Business Owner','business-analyst':'Business Analyst',
  'ai-ml-engineer':'AI / ML Engineer','compliance-officer':'Compliance / Risk Officer'
 });
 const segment=(label,action=null)=>({label,action});
 const clean=x=>String(x??'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,160);
 function requirementId(x){
  const input=clean(x),br=input.match(/(?:^|[^A-Za-z0-9])BR-([0-9]+)(?![A-Za-z0-9])/i);
  if(br)return 'BR-'+br[1].padStart(2,'0');
  const jira=input.match(/(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9_]{1,20}-[0-9]+)(?![A-Za-z0-9])/);
  return jira?jira[1]:'';
 }
 function trail(state={}){
  const current=clean(state.view);
  if(current==='discovery'){
   const result=[segment('My Work','my-work'),segment('Role Workspace','role-workspace')];
   const id=requirementId(state.brId);
   if(state.rootOnly!==true&&(clean(state.stage)!=='start'||id||state.requirementOpen===true))
    result.push(segment('Business Requirement','br-home'));
   if(id)result.push(segment(id));
   // A leaf is always inert, including the BA root-only screen.
   result[result.length-1].action=null;
   return result;
  }
  if(current==='work'){
   const result=[segment('My Work','my-work'),segment('Role Workspace','role-workspace')];
   const role=ROLES[clean(state.roleId)];
   if(role)result.push(segment(role,null));
   const ticket=requirementId(state.brId);
   if(ticket)result.push(segment(ticket));
   return result;
  }
  const tuples=PAGE[current]||[[clean(current)||'Workspace',null]];
  const result=tuples.map(([label,action])=>segment(label,action));
  if(current==='documentEditor'){
   const title=clean(state.documentTitle);
   if(title)result[result.length-1].label=title;
  }
  if(current==='uxPreview'){
   const key=requirementId(state.brId);
   if(key)result.splice(3,0,segment(key));
  }
  return result;
 }
 return {PAGE,ROLES,trail,requirementId};
});
