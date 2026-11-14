'use strict';
// Trusted host-side role-task checks; browser-selected role alone grants no privilege.
const LABELS=Object.freeze({
 'ux-designer':'atgv-role-ux-designer',
 'software-developer':'atgv-role-software-developer',
 'qa-engineer':'atgv-role-qa-engineer',
 'uat-tester':'atgv-role-uat-tester'
});
const STORY=/^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/;
function roleLabel(roleId){return LABELS[String(roleId||'')]||'';}
function roleMatches(labels,roleId){const own=roleLabel(roleId),roles=(Array.isArray(labels)?labels:[]).filter(x=>typeof x==='string'&&x.startsWith('atgv-role-'));
 return !roles.length||!!own&&roles.includes(own);
}
function requireRole(issue,roleId,projectKey){
 const fields=issue?.fields||{};
 if(fields.project?.key!==projectKey)throw Error('Jira ticket is not in the selected project.');
 if(!roleMatches(fields.labels,roleId))throw Error('This Jira subtask belongs to another SDLC role and cannot be claimed in the selected role workspace.');
 return roleLabel(roleId);
}
function storyKey(issue,description=''){
 const match=String(description||'').match(/^Jira parent Story:\s*([A-Z][A-Z0-9]{1,19}-[1-9][0-9]*)\s*$/m);
 const parent=String(issue?.fields?.parent?.key||'');const candidate=match?.[1]||parent;
 if(!STORY.test(candidate))throw Error('Jira task has no trustworthy parent Story link. Repair Jira tasks first.');
 return candidate;
}
module.exports={LABELS,roleLabel,roleMatches,requireRole,storyKey};
