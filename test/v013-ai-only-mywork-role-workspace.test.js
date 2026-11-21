'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const script=read('media/start.js');
const css=read('media/atgv-mywork-ai.css');
const actions=read('media/atgv-mywork-ai.js');
const routes=require('../media/workspace-breadcrumbs');
const roles=[...require('../src/sdlc-work').ROLES,...require('../src/sdlc-catalog').OPTIONAL_ROLES];

test('My Work is a separate top-level page containing only AI chat, animation and suggestions',()=>{
 const start=html.indexOf('<main id="myWorkView"');
 const end=html.indexOf('</main>',start);
 const work=html.indexOf('<main id="workView"',end);
 assert.ok(start>0&&end>start&&work>end);
 const ai=html.slice(start,end),workspace=html.slice(work,html.indexOf('</main>',work));
 assert.match(ai,/id="atgvMyWorkAi"/);
 assert.match(ai,/id="atgvMyWorkAiOrb"/);
 assert.match(ai,/id="atgvMyWorkAiChatForm"/);
 assert.match(ai,/id="atgvMyWorkAiInput"/);
 assert.match(ai,/id="atgvMyWorkAiConversation"/);
 assert.doesNotMatch(ai,/id="(?:baMyWorkDashboard|discoveryView|pmDailyCockpit|developerTaskDashboard|architectBootstrap|uxDesignWorkspace|roleJiraWork|roleStepFlow)"/);
 assert.doesNotMatch(workspace,/id="atgvMyWorkAi"/);
 assert.match(workspace,/id="baMyWorkDashboard"/);
 assert.match(workspace,/id="discoveryView"/);
 assert.match(workspace,/id="pmDailyCockpit"/);
 assert.match(workspace,/id="developerTaskDashboard"/);
 assert.match(workspace,/id="architectBootstrap"/);
 assert.match(workspace,/id="uxDesignWorkspace"/);
 assert.match(workspace,/id="roleJiraWork"/);
 assert.match(workspace,/id="roleStepFlow"/);
 assert.equal(html.match(/id="atgvMyWorkAiInput"/g)?.length,1);
 assert.equal(html.match(/data-nav="role-workspace"/g)?.length,1);
 assert.equal(html.match(/data-nav="sdlc-roles"/g)?.length,1);
});

test('shared role selection opens AI and Role Workspace without changing existing role models',()=>{
 assert.equal(roles.length,18);
 assert.equal(new Set(roles.map(role=>role.id)).size,18);
 assert.match(script,/const keepingWorkspace=isRole&&\(view==='work'\|\|view==='discovery'\|\|view==='uxPreview'\)/);
 assert.match(script,/destination==='role-workspace'\|\|keepingWorkspace/);
 assert.match(script,/setView\(openWorkspace\?\(baWorkspace\?'discovery':'work'\):'myWork'\)/);
 assert.match(script,/if\(view==='myWork'\)window\.ATGVMyWorkAI\?\.update/);
 assert.match(script,/if\(destination==='discovery'\)/);
 assert.match(script,/baBreadcrumbAtRequirements=true/);
 assert.match(script,/const openWorkspace=destination==='role-workspace'\|\|keepingWorkspace/);
 assert.match(actions,/navigate\(role==='business-analyst'\?'discovery':'role-workspace'\)/);
 assert.match(actions,/workspace&&!workspace\.classList\.contains\('hidden'\)/);
});

test('new pages are styled and navigable; no role workflows moved into AI page',()=>{
 assert.match(css,/#myWorkView > #atgvMyWorkAi/);
 assert.match(css,/#myWorkView\.atgv-mywork-ai-page/);
 assert.doesNotMatch(css,/#workView > #atgvMyWorkAi/);
 assert.match(html,/SDLC DELIVERY \/ ROLE WORKSPACE/);
 assert.deepEqual(routes.trail({view:'myWork'}).map(x=>x.label),['My Work']);
 assert.deepEqual(routes.trail({view:'work',roleId:'software-developer'}).map(x=>x.label),
  ['My Work','Role Workspace','Developer']);
 assert.deepEqual(routes.trail({view:'discovery',stage:'generate',brId:'BR-01'}).map(x=>x.label),
  ['My Work','Role Workspace','Business Requirement','BR-01']);
 assert.equal(routes.trail({view:'work',roleId:'software-developer'})[0].action,'my-work');
});
