'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const inventory=require('../src/jira-project-inventory');
const base=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(base,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(base,'media/start.js'),'utf8');
const config={get:key=>({'jira.baseUrl':'https://example.atlassian.net','jira.email':'tester@example.org'})[key]||''};
const issue=(key,creator)=>({key,fields:{project:{key:'TC'},summary:'Sample '+key,status:{name:'To Do'},issuetype:{name:'Task'},creator:{displayName:creator,accountId:'acct-123'},created:'2026-11-05T00:00:00Z'}});

test('enhanced JQL paginates entire scoped project and reads creator, not reporter',async()=>{
 const requests=[],pages=[];
 const result=await inventory.scanProject({config,token:'private',projectKey:'TC',request:async(url,options)=>{
    requests.push({url,options});
    assert.equal(url,'https://example.atlassian.net/rest/api/3/search/jql');
    return requests.length===1?{issues:[issue('TC-101','First Creator')],nextPageToken:'next'}:{issues:[issue('TC-102','Second Creator')],isLast:true};
 },onPage:async batch=>pages.push(batch)});
 assert.equal(result.count,2);assert.equal(pages.length,2);
 assert.equal(pages[0].issues[0].creator,'First Creator');assert.equal(pages[1].issues[0].creatorId,'acct-123');
 assert.equal(requests[0].options.data.jql,'project = "TC" ORDER BY created DESC');
 assert.ok(requests[0].options.data.fields.includes('creator'));
 assert.equal(requests[1].options.data.nextPageToken,'next');
 assert.ok(requests.every(({options})=>options.method==='POST'&&options.token==='private'));
});

test('invalid project key and missing Jira credentials fail closed',async()=>{
 await assert.rejects(inventory.scanProject({config,token:'secret',projectKey:'TC OR project = OTHER',request:()=>{throw Error('must not call')}}),/Invalid|project/i);
 await assert.rejects(inventory.scanProject({config,token:'',projectKey:'TC'}),/Connect Jira/);
 assert.equal(inventory.normalizeIssue(issue('OTHER-20','Other'),'TC'),null);
});

test('search detects repeated nextPageToken and respects cancellation and item limits',async()=>{
 const repeated={issues:[issue('TC-10','User')],nextPageToken:'repeat'};
 await assert.rejects(inventory.scanProject({config,token:'private',projectKey:'TC',request:async()=>repeated}),/repeated pagination token/);
 const stopped=await inventory.scanProject({config,token:'private',projectKey:'TC',shouldContinue:()=>false,request:async()=>{throw Error('should not call')}});
 assert.equal(stopped.cancelled,true);
 const capped=await inventory.scanProject({config,token:'private',projectKey:'TC',maxIssues:1,request:async()=>repeated});
 assert.equal(capped.truncated,true);
});

test('Overview exposes Jira inventory, creator columns and host-side project scoping',()=>{
 for(const id of ['overviewJiraInventory','jiraInventoryModal','jiraInventoryRows','jiraInventoryFilter','jiraInventoryStatus','jiraInventoryRefresh'])assert.ok(host.includes('id="'+id+'"'),id);
 assert.match(ui,/send\('searchProjectJiraInventory'/);
 assert.match(host,/case 'searchProjectJiraInventory':/);
 assert.match(host,/validProjectKey\(config\.get\('jira\.projectKey'\)\)/);
 assert.match(ui,/item\.creator/);
 assert.match(ui,/openJiraIssueModal\(item\.key\)/);
 assert.match(host,/All Jira project items/);
});
