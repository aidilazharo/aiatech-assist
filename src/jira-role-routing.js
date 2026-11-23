'use strict';
// Role labels identify responsibility, never a real Jira assignee.
// Only the project's verified Jira roster can resolve user account IDs.
const {ROLES}=require('./my-work-role-prompts');
const ALIASES=Object.freeze({uiux:'ux-designer',developer:'software-developer',qa:'qa-engineer',uat:'uat-tester',sa:'solution-architect',pm:'project-manager',ba:'business-analyst'});
function normalizeRole(id){const raw=String(id||'').trim().toLowerCase(),value=ALIASES[raw]||raw;return value&&Object.hasOwn(ROLES,value)?value:'';}
function roleLabel(id){const value=normalizeRole(id);return value?'atgv-role-'+value:'';}
function roleChoices(){return Object.entries(ROLES).map(([id,value])=>({id,name:value.name,label:roleLabel(id)}));}
// Infer only from unambiguous task title prefixes. Generic Stories are not
// automatically assigned to a Developer and no person is silently selected.
const CUES=Object.freeze([
 ['ux-designer',/^(?:ui\/ux|ux design|user flow|wireframe|mockup|prototype|visual design|design system|accessibility review|usability review)\b/i],
 ['software-developer',/^(?:frontend|front-end|backend|back-end|implement|implementation|develop|development|code|api|database|db|sql|migration|integration|endpoint|unit test|component build)\b/i],
 ['project-manager',/^(?:project management|project plan|project schedule|project milestone|risk register|raid log|stakeholder status|steering committee|project reporting|delivery coordination|pmo)\b/i],
 ['solution-architect',/^(?:solution architecture|solution design|architecture review|technical architecture|system architecture|integration architecture|architecture decision|adr)\b/i],
 ['business-analyst',/^(?:business analysis|requirements analysis|requirement mapping|requirements discovery|stakeholder discovery|brd review|business rules review)\b/i],
 ['qa-engineer',/^(?:qa |quality assurance|regression testing|test automation|test plan|test execution|defect verification|system testing)\b/i],
 ['uat-tester',/^(?:uat |user acceptance test|business acceptance test|stakeholder sign-off|uat sign-off)\b/i],
 ['security-engineer',/^(?:threat model|security review|penetration test|vulnerability assessment|security assessment)\b/i],
 ['data-engineer',/^(?:data pipeline|etl|data quality|data warehouse)\b/i],
 ['release-manager',/^(?:release plan|deployment plan|ci\/cd|devops|rollback plan|production rollout)\b/i],
 ['technical-writer',/^(?:technical documentation|user guide|api documentation|release notes|runbook documentation)\b/i]
]);
function inferTaskRole(item={}){const title=String(item.title||item.summary||'').trim(),found=CUES.filter(([,rule])=>rule.test(title)).map(([id])=>id);return found.length===1?found[0]:'';}
function resolveRole(item={}){const explicit=item.jiraDetails?.roleId??item.roleId;if(explicit){const value=normalizeRole(explicit);if(!value)throw Error('Unknown SDLC role: '+String(explicit).slice(0,80));return value;}return item.kind==='Task'?inferTaskRole(item):'';}
module.exports={normalizeRole,roleLabel,roleChoices,inferTaskRole,resolveRole};
