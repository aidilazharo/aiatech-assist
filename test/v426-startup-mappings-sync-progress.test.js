'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
test('startup connection cards are moved, not duplicated, and token help uses trusted host routes',()=>{
 const start=html.indexOf('id="startupConnectionForm"'),end=html.indexOf('id="landingView"');
 for(const id of ['overviewJiraConnection','overviewConfluenceConnection','startupMappingProject','startupAtlassianTokenInfo','startupGithubTokenInfo']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  assert.ok(html.indexOf('id="'+id+'"')>start&&html.indexOf('id="'+id+'"')<end,id);
 }
 assert.doesNotMatch(html,/id="(?:gateQuery|gateSearch)"/);
 assert.match(html,/id="gateProjectsHeading"[^>]*>Projects</);
 assert.match(host,/https:\/\/id\.atlassian\.com\/manage-profile\/security\/api-tokens/);
 assert.match(host,/https:\/\/github\.com\/settings\/personal-access-tokens/);
 assert.match(host,/const project=await projectMappingTarget\(msg\)/);
 assert.match(host,/await storedStartupVerification\(\)/);
});
test('header sync progress reflects verified Jira and Confluence results only',()=>{
 const start=ui.indexOf('function renderHeaderSync('),end=ui.indexOf('function renderLiveRemoteState(',start);
 const attrs={},track={dataset:{},setAttribute:(k,v)=>attrs[k]=v},fill={style:{}};
 const render=new Function('$','activeId',ui.slice(start,end)+';return renderHeaderSync;')(id=>id==='atgvHeaderSync'?track:fill,'p');
 const verify=(value,expected)=>{render(value);assert.equal(fill.style.width,expected+'%');assert.equal(attrs['aria-valuenow'],String(expected));};
 verify({projectId:'p',phase:'running',results:{}},0);
 verify({projectId:'p',phase:'running',results:{GitHub:5,Jira:0}},50);
 verify({projectId:'p',phase:'partial',results:{Jira:0},errors:{Confluence:'404'}},50);
 verify({projectId:'p',phase:'ready',results:{Jira:1,Confluence:0}},100);
 verify({projectId:'p',phase:'offline',results:{Jira:1,Confluence:0}},0);
 verify({projectId:'other',phase:'ready',results:{Jira:1,Confluence:1}},0);
});
