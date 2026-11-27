'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ATGVUserGuide=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const s=(id,title,description,selector,route,interactive=false)=>({id,title,description,selector,route,interactive});
 const guides={
  opening:{label:'Open a Project',description:'Find and open your ATGV workspace.',steps:[
   s('search','Find an ATGV project','Review the Projects list populated by the workspace scan. Select Next to reach Projects after connection setup.','#gateProjectsHeading','opening'),
   s('results','Choose a project','Choose an existing project or select New Project to configure a new workspace.','#gateLocal','opening'),
   s('open','Open the workspace','Click Open Project on a project row to open it directly; no second confirmation screen appears.','#gateFinder','opening')
  ]},
  workspace:{label:'Workspace Essentials',description:'Navigate projects, roles, documents, and help.',steps:[
   s('overview','Project overview','Review SDLC progress and the active project here.','#overviewActive','overview'),
   s('role','Choose your role','Choose the SDLC role you will work in. Each role has its own workflow and guide.','#sidebarRoleTrigger','overview',true),
   s('my-work','Open My Work','Open role-specific tasks, ownership, deliverables, and progress.','[data-nav="sdlc-roles"]','overview',true),
   s('designs','Review designs','Find architecture diagrams and AI design drafts here.','[data-sdlc-tab="planning"]','flow',true),
   s('settings','Open project settings','Open Settings, then select the Project Settings tab to configure the project.','[data-nav="settings"]','overview',true)
  ]},
  'start-settings':{label:'Start & Settings',description:'Use the start screen and settings to connect tools and configure roles.',steps:[
   s('gate-settings','Open connection setup','Use the connection setup below to configure Jira, Confluence, GitHub, and the SDLC Library before opening a project.','#startupConnectionForm','opening'),
   s('search','Choose a project','Select Next to view detected workspace projects, or use New Project to configure a new workspace.','#gateProjectsHeading','opening'),
   s('role-settings','Manage enabled roles','Enable or disable SDLC roles for the selected project in Project Settings.','#roleSettingsSection','project-settings'),
   s('project-tools','Open project and tech stack settings','Select the technology stack and repository for the current project.','#techStackGrid','project-settings')
  ]},
  'my-work':{label:'My Work',description:'Use the role workspace to see responsibilities, checklists, and next actions.',steps:[
   s('role','Choose your role','Select the SDLC role you want to work in.','#sidebarRoleTrigger','overview',true),
   s('open','Open My Work','Open the My Work page to see role deliverables and assigned work.','[data-nav="sdlc-roles"]','overview',true),
   s('checklist','Review role deliverables','Use the role checklist to review the required documents, tasks, and evidence.','#roleChecklist','selected-role'),
   s('handoff','Check readiness and handoffs','Review readiness, blockers, and dependencies before handing work to the next role.','#handoffList','selected-role')
  ]},
  'business-requirement':{label:'Business Requirement',description:'Upload sources, complete discovery, review AI suggestions, and publish Jira.',steps:[
   s('upload','Upload source documents','Upload Word or PDF files and select the documents to process.','#discoveryImport','discovery'),
   s('questions','Complete the 12 questions','Review mapped answers, edit where needed, and save the discovery results.','#discoveryForm','discovery'),
   s('ai-review','Run AI Review','Review suggested improvements before generating Business Requirement documents.','#discoveryCopilot','discovery'),
   s('generate','Generate BR documents','Generate, edit, save, and approve the Business Requirement documents.','#brGenerate','discovery'),
   s('jira','Preview and publish Jira','Generate the Jira preview, review the changes, and publish only after approval.','#brJiraPreview','discovery')
  ]},
  'extension-settings':{label:'Extension Settings',description:'Configure Jira, Confluence, GitHub credentials and verify connectivity.',steps:[
   s('jira','Configure Jira Cloud','Enter your Atlassian site URL and email.','#testAtlassian','settings'),
   s('jira-token','Create Jira API token','Open the official Atlassian API token page. Paste the token into the password field and run the connection test.','#guideJiraTokenLink','settings'),
   s('confluence-token','Confluence API token','Confluence Cloud uses the same Atlassian identity/token page. Configure space access separately.','#guideConfluenceTokenLink','settings'),
   s('github-token','Create GitHub token','Open GitHub personal access token settings and grant only the repository permissions required by ATGV.','#guideGithubTokenLink','settings'),
   s('github-test','Test GitHub access','Check the repository connection before starting Git-based development.','#testGithub','settings')
  ]},
  'navigation':{label:'Explore Navigation',description:'Explore every main section in the left navigation menu.',steps:[
   s('overview','Overview','Check project progress, work items, and milestones.','[data-nav="overview"]','overview',true),
   s('my-work','My Work','Open the workbench for the currently selected role.','[data-nav="sdlc-roles"]','overview',true),
   s('sdlc','SDLC','Review the process stages and dependencies.','[data-nav="flow"]','overview',true),
   s('documents','Documents','Browse generated and manually maintained SDLC documents.','[data-sdlc-tab="documents"]','flow',true),
   s('designs','Designs & Diagrams','Review architecture and generated design diagrams.','[data-sdlc-tab="planning"]','flow',true),
   s('knowledge','Knowledge & RAG','Search indexed project documents and approved knowledge sources.','[data-sdlc-tab="knowledge"]','flow',true),
   s('approvals','Approvals & Handoffs','View document ownership, reviews, and sign-offs.','[data-sdlc-tab="operations"]','flow',true),
   s('settings','Settings','Manage extension connections and project-specific configuration using tabs.','[data-nav="settings"]','overview',true)
  ]},
  'jira-publishing':{label:'Publish Business Requirements to Jira',description:'Preview approved BR changes and publish Jira with explicit approval.',steps:[
   s('br','Review BR documents','Only approved BR documents can be used for Jira publishing.','#brGenerate','discovery'),
   s('preview','Generate Jira preview','Inspect proposed Epics, Features, Stories and Tasks before making changes.','#brJiraPreview','discovery'),
   s('approval','Approve Jira preview','Review the proposed Jira changes and authorize publishing.','#brJiraApprove','discovery'),
   s('publish','Publish Jira','Publish approved changes and review generated Jira links and sync status.','#brJiraSync','discovery')
  ]},
  'developer-delivery':{label:'Developer Jira Assignments',description:'Review or claim project Jira work from the role workspace once the technology stack is approved.',steps:[
   s('role','Select Developer','Choose the Developer role and open My Work.','#workTitle','software-developer'),
   s('issues','Review available Jira issues','Use the searchable Jira table to review work assigned to you or unassigned tasks.','#roleJiraWork','software-developer'),
   s('claim','Assign a Jira task','Select Assign to Me for an unassigned Jira issue. The extension checks stack approval and asks for confirmation.','#roleJiraTable','software-developer'),
   s('refresh','Refresh Jira assignments','Refresh the Jira issue table after claiming or updating work.','#roleJiraRefresh','software-developer')
  ]},
  'approval-handoff':{label:'Approvals & Handoffs',description:'Manage ownership, review queues, and safe role handoffs.',steps:[
   s('queue','Review AI proposals','Only accepted draft proposals become changes to local documents.','#aiServiceQueue','operations'),
   s('owners','Review document ownership','Check which documents are owned and whether transfers are pending.','#opsOwnerRows','operations'),
   s('claim','Claim or transfer ownership','Use the approval flow for ownership changes.','#opsClaim','operations'),
   s('review','Approve or reject transfers','Authorized owners review requests before the next role proceeds.','#opsApprove','operations')
  ]},
  'business-analyst':{label:'Business Analyst',description:'Evidence to approved requirements and Jira.',steps:[
   s('role','BA role workspace','Select Business Analyst and check current role readiness and assigned work.','#roleChecklist','business-analyst'),
   s('upload','Upload requirement sources','Upload and select supporting Word or PDF documents for discovery.','#discoveryImport','discovery'),
   s('questions','Answer and save discovery','Review the twelve discovery questions and save mapped answers before generation.','#discoveryForm','discovery'),
   s('ai-review','AI Review & Suggestions','Review proposed changes; accept only useful suggestions. You can also continue manually.','#discoveryCopilot','discovery'),
   s('generate','Generate BR documents','Generate editable Business Requirement documents and review before approval.','#brGenerate','discovery'),
   s('jira','Jira preview and publishing','Preview Jira changes after BR approval. Publishing is a separate authorized action.','#brJiraPreview','discovery')
  ]},
  'solution-architect':{label:'Solution Architect',description:'Choose, prepare, publish, and approve the technology stack.',steps:[
   s('stack','Choose stack','Select a technology stack for the project.','#architectStackSelect','solution-architect'),
   s('save','Save stack','Prepare the selected stack and install its dependencies. Catalog stacks are prepared locally before GitHub publication.','#architectSaveStack','solution-architect'),
   s('publish','Publish to GitHub','For a locally prepared catalog stack, use Publish to GitHub to upload the saved revision. If already published, or using Custom Stack, continue to approval.','#architectPublishLocalStack','solution-architect'),
   s('approve','Approve for Developers','Approve the saved Git revision for development. Separate test/build and server verification are not required for catalog approval. Custom Stack requires its verified synthetic preview.','#architectApproveStack','solution-architect')
  ]},
  'technical-lead':{label:'Technical Lead',description:'Coordinate Developers, review and hand off.',steps:[
   s('role','Technical Lead workspace','This optional role can be enabled in project role settings. Start from assigned deliverables.','#roleChecklist','technical-lead'),
   s('handoff','Review dependencies and handoffs','Review readiness, blocked tasks, and work ownership before technical sign-off.','#handoffList','technical-lead'),
   s('tasks','Plan technical work','Use approved architecture and the same Jira stories as Developers. Do not duplicate feature branches.','#roleChecklistHeading','technical-lead'),
   s('approvals','Review and hand off','Review implementation and test evidence through the linked PR and role handoffs.','[data-sdlc-tab="operations"]','flow',true)
  ]},
  'software-developer':{label:'Developer',description:'Claim and work on approved Jira assignments.',steps:[
   s('issues','Review Jira assignments','Open Developer My Work and review live Jira issue tables.','#roleJiraWork','software-developer'),
   s('claim','Assign to Me','Claim an unassigned Jira task only after the Solution Architect has approved the technology stack.','#roleJiraTable','software-developer'),
   s('refresh','Reload assignments','Refresh Jira tasks and statuses when needed.','#roleJiraRefresh','software-developer')
  ]},
  'qa-engineer':{label:'QA Engineer',description:'Test planning, execution, and defects.',steps:[
   s('role','QA role workspace','Review assigned test responsibilities and readiness for QA execution.','#roleChecklist','qa-engineer'),
   s('handoffs','Check development readiness','Validate implementation evidence and dependencies before executing acceptance tests.','#handoffList','qa-engineer'),
   s('evidence','Record test evidence','Use role deliverables to record actual test cases, outcomes, defects and supporting evidence.','#roleChecklistHeading','qa-engineer'),
   s('documents','Review linked documentation','Trace test cases and defects back to the approved BR and Jira story.','[data-sdlc-tab="documents"]','flow',true)
  ]}
 };
 const categories={
  opening:'Getting Started','start-settings':'Getting Started',
  workspace:'Workspace Navigation',navigation:'Workspace Navigation',
  'my-work':'My Work · Roles','business-analyst':'My Work · Roles','solution-architect':'My Work · Roles','technical-lead':'My Work · Roles','software-developer':'My Work · Roles','qa-engineer':'My Work · Roles',
  'business-requirement':'Business Processes','jira-publishing':'Business Processes','developer-delivery':'Business Processes','approval-handoff':'Business Processes',
  'extension-settings':'Connections & Settings'
 };
 function list(roleIds,opened){return Object.entries(guides).filter(([id])=>{if(!opened)return ['opening','start-settings','extension-settings'].includes(id);if(id==='opening')return false;if(['workspace','navigation','start-settings','extension-settings','my-work','approval-handoff'].includes(id))return true;if(['business-requirement','jira-publishing'].includes(id))return roleIds.includes('business-analyst');if(id==='developer-delivery')return roleIds.includes('software-developer');return roleIds.includes(id);}).map(([id,g])=>({id,label:g.label,description:g.description,steps:g.steps.length,group:categories[id]||'Business Processes'}));}

 function get(id){return Object.hasOwn(guides,id)?guides[id]:null;}
 function validStep(id,stepId){const guide=get(id);return !!guide&&guide.steps.some(step=>step.id===stepId);}
 function normalizeProgress(id,p){const g=get(id);if(!g)return null;const safe=p&&typeof p==='object'?p:{};return {stepId:validStep(id,safe.stepId)?safe.stepId:g.steps[0].id,completed:safe.completed===true,skipped:safe.skipped===true};}
 return Object.freeze({get,list,validStep,normalizeProgress,ids:Object.keys(guides)});
});
