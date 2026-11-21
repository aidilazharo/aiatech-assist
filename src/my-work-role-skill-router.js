'use strict';
// Role boundaries are evaluated on the user message only by the extension
// host. This is advisory routing; it never changes role assignments or
// initiates work. Keep the classifier deliberately conservative: a PM asking
// about design dependencies is NOT the same as requesting a design artifact.
const {ROLES}=require('./my-work-role-prompts');
const ACTION=/\b(?:create|make|design|draft|generate|build|produce|draw|write|implement|develop|sketch|prepare|render|prototype|code|edit|revise|redesign|modify|update|fix|compose|deliver|give me|show me|how (?:do|can|should) (?:i|we) (?:create|make|design|draft|build|write|implement|develop))\b/i;
const QUESTION=/\b(?:what (?:is|are)|why|explain|compare|review (?:the |our )?(?:impact|risk|dependency|progress)|how (?:does|will)|who (?:owns|is responsible)|status of|should (?:the |our )?team)\b/i;
const DOMAIN=[
 {id:'ux-designer',patterns:[
  /\b(?:design\s+mock[\s-]?up|(?:ui|ux|screen|app|website|web|page)\s+mock[\s-]?up|mock[\s-]?up|wire[\s-]?frame|interactive\s+prototype|clickable\s+prototype|figma\s+(?:design|screen)|(?:ux|ui)\s+(?:design|prototype)|user\s+flow\s+(?:diagram|screen)|interface\s+(?:layout|design)|screen\s+design)\b/i
 ],reason:'visual mockups, wireframes, interface design and prototypes are UI/UX Designer deliverables'},
 {id:'business-analyst',patterns:[
  /\b(?:business\s+requirement(?:s|\s+document)?|BRD|requirements\s+specification|(?:user\s+stor(?:y|ies)|acceptance\s+criteria)\s+(?:draft|document|template|ticket)|stakeholder\s+(?:discovery|interview\s+questions))\b/i
 ],reason:'business requirements, user stories and stakeholder discovery are Business Analyst deliverables'},
 {id:'solution-architect',patterns:[
  /\b(?:solution\s+architecture|architecture\s+(?:diagram|decision\s+record|document|design)|(?:system|integration)\s+architecture\s+diagram|(?:technology|tech)\s+stack\s+design|(?:API|system)\s+integration\s+architecture)\b/i
 ],reason:'system architecture and technology decisions belong to Solution Architect'},
 {id:'software-developer',patterns:[
  /\b(?:source\s+code|(?:frontend|backend|react|node|javascript|typescript|python|php)\s+(?:code|component|implementation)|implement\s+(?:an?\s+)?(?:api|endpoint|feature)|(?:code|develop)\s+(?:an?\s+)?(?:api|module|feature)|unit\s+test\s+(?:code|implementation))\b/i
 ],reason:'application code and feature implementation belong to Developer'},
 {id:'project-manager',patterns:[
  /\b(?:project\s+(?:plan|timeline|schedule|status\s+report|raid\s+log)|(?:sprint|delivery)\s+(?:plan|schedule)|gantt\s+chart|risk\s+(?:register|log)|dependency\s+register|project\s+governance\s+plan)\b/i
 ],reason:'delivery planning, scheduling and governance belong to Project Manager'},
 {id:'qa-engineer',patterns:[
  /\b(?:qa\s+(?:test\s+plan|test\s+cases|report)|regression\s+(?:test\s+suite|test\s+plan|test\s+cases)|test\s+case(?:s)?|(?:integration|functional|automated)\s+test\s+plan|test\s+coverage\s+matrix)\b/i
 ],reason:'formal test coverage and QA test cases belong to QA Engineer'},
 {id:'uat-tester',patterns:[
  /\b(?:uat\s+(?:test\s+script|scenario|test\s+plan|test\s+cases|execution\s+report)|user\s+acceptance\s+(?:test\s+plan|testing\s+script|test\s+scenario))\b/i
 ],reason:'user acceptance scenarios and execution belong to UAT Tester'},
 {id:'product-owner',patterns:[
  /\b(?:product\s+(?:roadmap|backlog|vision|prioritization)|feature\s+prioritization\s+(?:matrix|board)|product\s+release\s+priorities)\b/i
 ],reason:'product value and backlog prioritization belong to Product Owner'},
 {id:'scrum-master',patterns:[
  /\b(?:sprint\s+retrospective|scrum\s+ceremon(?:y|ies)|sprint\s+(?:impediment|retrospective\s+action)|agile\s+retrospective)\b/i
 ],reason:'Scrum facilitation and sprint impediments belong to Scrum Master'},
 {id:'security-engineer',patterns:[
  /\b(?:threat\s+model|security\s+(?:assessment|threat\s+assessment|test\s+plan|controls\s+matrix)|vulnerability\s+(?:assessment|remediation\s+plan)|penetration\s+testing\s+(?:plan|report))\b/i
 ],reason:'threat modelling and security assurance belong to Security Engineer'},
 {id:'data-engineer',patterns:[
  /\b(?:database\s+(?:schema|migration\s+plan|data\s+model)|etl\s+(?:pipeline|design)|elt\s+pipeline|data\s+(?:pipeline|quality\s+report|migration\s+script|warehouse\s+schema)|sql\s+(?:schema|migration))\b/i
 ],reason:'data modelling, migration and pipelines belong to Data Engineer / DBA'},
 {id:'technical-writer',patterns:[
  /\b(?:user\s+(?:guide|manual)|technical\s+documentation|api\s+documentation|developer\s+(?:guide|documentation)|product\s+(?:help\s+article|documentation))\b/i
 ],reason:'user guides and technical documentation belong to Technical Writer'},
 {id:'operations-support',patterns:[
  /\b(?:incident\s+(?:runbook|response\s+plan|postmortem|triage\s+procedure)|production\s+(?:monitoring\s+runbook|support\s+plan)|monitoring\s+(?:alert\s+runbook|dashboard\s+plan))\b/i
 ],reason:'production operations and incident handling belong to Operations / Support'},
 {id:'release-manager',patterns:[
  /\b(?:(?:ci\/cd|deployment)\s+(?:pipeline|workflow)|release\s+(?:deployment\s+plan|gate|checklist|rollback\s+plan)|deployment\s+(?:runbook|checklist|rollout\s+plan))\b/i
 ],reason:'deployment, CI/CD and release gates belong to Release / DevOps'},
 {id:'technical-lead',patterns:[
  /\b(?:engineering\s+code\s+review\s+(?:policy|plan)|technical\s+debt\s+roadmap|engineering\s+standards\s+(?:document|guide))\b/i
 ],reason:'engineering review standards and technical direction belong to Technical Lead'},
 {id:'business-owner',patterns:[
  /\b(?:business\s+(?:approval\s+memo|sign[\s-]?off\s+decision)|business\s+case\s+approval)\b/i
 ],reason:'business-level decisions and approvals belong to Business Owner'},
 {id:'ai-ml-engineer',patterns:[
  /\b(?:machine\s+learning\s+(?:model|training\s+pipeline|evaluation\s+pipeline)|(?:ai|ml)\s+(?:model\s+training|evaluation\s+report|pipeline)|model\s+(?:training\s+pipeline|evaluation\s+script))\b/i
 ],reason:'machine learning model training and evaluations belong to AI/ML Engineer'},
 {id:'compliance-officer',patterns:[
  /\b(?:compliance\s+(?:audit\s+checklist|assessment|evidence\s+matrix)|regulatory\s+(?:compliance\s+matrix|gap\s+assessment)|policy\s+compliance\s+checklist)\b/i
 ],reason:'regulatory evidence and compliance assessments belong to Compliance Officer'}
];
function route(currentRoleId,message){
 if(!ROLES[currentRoleId])throw Error('Unknown active SDLC role.');
 const input=String(message||'').trim().slice(0,4000);
 if(!input||!ACTION.test(input))return null;
 // A request to review a specialist's design or dependency is not an
 // instruction to create that specialist's deliverable. Likewise, project
 // management questions must remain answerable from the active role.
 if(/^(?:please\\s+)?(?:review|explain|summarize|discuss|compare|assess|evaluate|inspect|advise|audit|clarify|describe)\\b/i.test(input)&&
    !/\\b(?:create|make|generate|produce|build|implement|draw|write|redesign|modify|update|fix|draft|render|prototype)\\b/i.test(input))return null;
 if(/^(?:what|why|when|where|who|which|should|is|are|how\\s+(?:does|will|can))\\b/i.test(input))return null;
 const candidates=DOMAIN.filter(entry=>entry.patterns.some(pattern=>pattern.test(input)));
 // Multiple distinct domains in one request need clarification rather than
 // silently choosing one role. Project review/advice stays in the current role.
 if(candidates.length!==1)return null;
 const target=candidates[0];
 if(target.id===currentRoleId)return null;
 if(QUESTION.test(input)&&!/\b(?:create|make|design|draft|generate|build|produce|draw|write|implement|develop|sketch|prepare|render|prototype|code|edit|revise|redesign|modify|update|fix|compose)\b/i.test(input))
  return null;
 return {currentRoleId,targetRoleId:target.id,targetRoleName:ROLES[target.id].name,
  reason:target.reason};
}
function response(match){
 if(!match)return '';
 return 'This request is a '+match.targetRoleName+' task: '+match.reason+
  '. You are currently chatting as '+ROLES[match.currentRoleId].name+
  '. Please switch to the '+match.targetRoleName+' role to create or modify this deliverable.'+
  ' I will keep the current role unchanged until you choose to switch.';
}
module.exports={DOMAIN,route,response};
