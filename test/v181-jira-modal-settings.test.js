'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {getRoleSettings,saveRoleSettings,loadProjectRoles}=require('../src/sdlc-catalog');
const catalog=require('../src/github-sdlc-catalog');
const read=file=>require('node:fs').readFileSync(path.join(__dirname,'..',file),'utf8');

test('Jira ID, summary and data row open a modal, preserving Assign to Me',()=>{
 const web=read('media/start.js'),host=read('test/generated/extension-source.txt'),grid=read('media/atgv-datatables.js');
 assert.match(host,/id="jiraIssueModal" class="modal-overlay hidden" aria-hidden="true"/);
 assert.match(host,/role="dialog" aria-modal="true" aria-labelledby="jiraIssueModalTitle"/);
 assert.match(web,/{key:'key',label:'Jira ID',render:item=>\{const btn=document\.createElement\('button'\)/);
 assert.match(web,/{key:'summary',label:'Summary',render:item=>/);
 assert.match(web,/onRowClick:item=>openJiraIssueModal\(item\.key\)/);
 assert.match(grid,/if\(typeof options\.onRowClick==='function'\)/);
 assert.match(grid,/event\.target\.closest\?\.\('button,a,input,select,textarea'\)/);
 assert.match(web,/roleJiraAssign.*?expectedUpdated/s);
 assert.match(web,/roleJiraIssueDetailsError/);
 assert.match(web,/Escape.*?closeJiraIssueModal/s);
});

test('Jira detail requests are project-scoped, read-only, and do not leak credentials',()=>{
 const host=read('test/generated/extension-source.txt');
 const start=host.indexOf("case 'roleJiraIssueDetails':{");
 const end=host.indexOf("case 'roleJiraIssueSave':{",start);
 assert.ok(start>=0&&end>start);
 const section=host.slice(start,end);
 assert.match(section,/requireOpened\(\);requireOnline\(\)/);
 assert.match(section,/developerGit\.jiraKey\(msg\.key\)/);
 assert.match(section,/issue\.fields\?\.project\?\.key!==validProjectKey/);
 assert.match(section,/jiraReadIssueAllFields\(config,token,key\)/);
 assert.match(section,/jiraIssueFieldMetadata\(config,token,\{key\}\)/);
 assert.doesNotMatch(section,/method:\s*'PUT'|method:\s*'POST'|method:\s*'DELETE'/);
 assert.match(section,/requestId:msg\.requestId/);
 assert.doesNotMatch(section,/token:token|value:token|jiraToken:token/);
});

test('User role order survives serialization and adjusts the enabled My Work role order',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v181-role-'));
 const registry={fileFor:id=>path.join(folder,id,'atgv.project.json')};
 try{
  const original=await getRoleSettings(registry,'tc');
  const ordered=[...original.order].reverse();
  const saved=await saveRoleSettings(registry,'tc',original.enabled,original.revision,original.dependencies,ordered);
  assert.deepEqual(saved.order,ordered);
  assert.deepEqual(saved.roles.map(role=>role.id),ordered);
  const reopened=await getRoleSettings(registry,'tc');
  assert.deepEqual(reopened.order,ordered);
  const active=await loadProjectRoles(registry,'tc');
  assert.deepEqual(active.map(role=>role.id),ordered.filter(id=>original.enabled.includes(id)));
  await assert.rejects(()=>saveRoleSettings(registry,'tc',original.enabled,reopened.revision,reopened.dependencies,[ordered[0],ordered[0]]),/order is invalid/);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('Catalog main is fixed and verified role skills are read from downloaded cache',()=>{
 assert.equal(catalog.normalizeConfig({repositoryUrl:'https://github.com/example-org/tech-stacks-skills',ref:'experimental'}).ref,'main');
 const host=read('test/generated/extension-source.txt'),web=read('media/start.js');
 assert.doesNotMatch(host,/Branch \(main only for this catalog\)/);
 assert.match(host,/roleSkillDescriptions\[id\]=content/);
 assert.match(web,/role-skill-details/);
 assert.match(web,/roleSettings\.order/);
 assert.match(web,/const enabled=new Set\(roleSettings\.enabled/);
});

test('GitHub repository selection auto-prepares only the matching project checkout',()=>{
 const host=read('test/generated/extension-source.txt'),web=read('media/start.js');
 assert.doesNotMatch(host,/id="devCloneRepo" class="secondary"/);
 assert.match(host,/const dest=path\.join\(resolvedParent,fields\.repo\)/);
 assert.match(host,/developerGit\.matchesGithubRepo\(checkout\.remote,fields\.owner,fields\.repo\)/);
 assert.match(host,/developerGit\.cloneConfigured\(resolvedParent,fields\.owner,fields\.repo,fields\.branch,\{token:/);
 assert.match(web,/function showGithubRepoPreview\(\)/);
 assert.match(host,/id="githubRepository" type="hidden"/);
});
