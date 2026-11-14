'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {select}=require('../media/atgv-datatables');
const root=path.resolve(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const datatables=fs.readFileSync(path.join(root,'media/atgv-datatables.js'),'utf8');

test('Business Analyst My Work displays the project Jira DataTable beneath restored BR summary',()=>{
 const ids=['baJiraInventorySection','baJiraInventoryTable','baJiraInventoryRefresh','baJiraTypeFilter','baJiraStatusFilter','baJiraInventoryStatus'];
 for(const id of ids)assert.ok(host.includes('id="'+id+'"'),id);
 assert.match(host,/id="baMyWorkDashboard"/);assert.match(host,/id="baMyWorkMetrics"/);assert.doesNotMatch(host,/id="baMyWorkItems"/);
 assert.match(host,/All Jira Project Items/);
 assert.match(host,/original creator and latest status/);
 assert.match(ui,/\$\('baJiraInventorySection'\)\.classList\.toggle\('hidden',roleId!=='business-analyst'\|\|baInventoryVisibleStep!=='start'\)/);
 assert.match(css,/\.ba-jira-inventory-panel/);
});

test('BA DataTable reuses project-scoped paginated Jira inventory and opens existing Jira details',()=>{
 assert.match(ui,/function ensureBAJiraInventory\(/);
 assert.match(ui,/projectConnectionsSnapshot\.jira\?\.key/);
 assert.match(ui,/send\('searchProjectJiraInventory',\{projectId:activeId,requestId:jiraInventoryRequest\}\)/);
 assert.match(host,/jiraProjectInventory\.scanProject/);
 assert.match(ui,/baJiraTableInstance=ATGVDataTables\.mount\(root,rows/);
 for(const label of ['Jira key','Type','Summary','Status','Created by','Created'])assert.ok(ui.includes(`label:'${label}'`),label);
 assert.match(ui,/pageSize:5,sortKey:''/);
 assert.match(ui,/onRowClick:item=>openJiraIssueModal\(item\.key\)/);
 assert.match(ui,/jiraInventoryItems\.push\(\.\.\.\(msg\.issues\|\|\[\]\)\)/);
 assert.match(ui,/renderJiraInventory\(\);renderBAJiraInventory\(\)/);
 assert.match(ui,/\$\('baJiraInventoryRefresh'\)\.addEventListener\('click',\(\)=>\{/);
 assert.match(ui,/jiraLinkReconcileAfterRefreshRequest=jiraInventoryRequest/);
});

test('DataTable supports incremental refresh without replacing search, sort or page controls',()=>{
 assert.match(datatables,/setRows\(nextRows\)/);
 const rows=[{key:'TC-2',type:'Task',creator:'Ali'},{key:'TC-11',type:'Story',creator:'Siti'},{key:'TC-1',type:'Bug',creator:'Ali'}];
 const result=select(rows,{sortKey:'key',term:'Ali',page:1,pageSize:20});
 assert.deepEqual(result.rows.map(row=>row.key),['TC-1','TC-2']);
 assert.equal(result.filtered,2);
});

test('BA Jira request respects project scope and only loads on BA work view',()=>{
 assert.match(ui,/if\(view!=='work'\|\|selectedRole!=='business-analyst'\)return;/);
 assert.match(ui,/jiraInventoryProject!==activeId\|\|jiraInventoryKey!==key/);
 assert.match(ui,/function updateBAJiraFilterOptions\(/);
 assert.match(ui,/jiraInventoryError/);
 assert.match(ui,/ensureBAJiraInventory\(\);send\('roleHandoffOwners'\)/);
 assert.match(host,/validProjectKey\(config\.get\('jira\.projectKey'\)\)/);
});
