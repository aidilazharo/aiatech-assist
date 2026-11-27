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

test('startup mapping renderer switches project scope, preserves selections and disables unverified actions',()=>{
 const a=ui.indexOf('function renderStartupMappings(){'),b=ui.indexOf("$('startupMappingProject').addEventListener",a);
 assert.ok(a>=0&&b>a);
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{dataset:{},children:[],value:'',textContent:'',disabled:false,classList:{toggle(){}},replaceChildren(){this.children=[];},append(...items){this.children.push(...items);}});
  return nodes.get(id);
 };
 const doc={createElement:()=>({value:'',textContent:''})};
 const create=new Function('$','document','projects','startupProjectMappings',`
 let startupMappingProjectId='',startupConnectionVerified=false;
 ${ui.slice(a,b)}
 return {render:renderStartupMappings,select:id=>startupMappingProjectId=id,verify:v=>startupConnectionVerified=v};
 `);
 const projects=[{id:'a',name:'Project A'},{id:'b',name:'Project B'}];
 const mappings={a:{jira:{key:'AA',source:'project'},confluence:{key:'AC',source:'project'}},b:{jira:{key:'BB',source:'extension'},confluence:{key:'BC',source:'project'}}};
 const page=create(node,doc,projects,mappings);
 page.render();assert.equal(node('overviewJiraProjectKey').textContent,'Not selected');
 assert.equal(node('startupMappingProject').children.length,3);
 page.select('a');page.render();
 assert.equal(node('overviewJiraProjectKey').textContent,'AA');assert.equal(node('overviewConfluenceSpaceKey').textContent,'AC');
 assert.equal(node('overviewJiraMappingStatus').disabled,true);assert.equal(node('overviewJiraInventory').disabled,true);
 page.verify(true);page.render();assert.equal(node('overviewJiraMappingStatus').disabled,false);assert.equal(node('overviewJiraInventory').disabled,false);
 page.select('b');page.render();
 assert.equal(node('startupMappingProject').value,'b');assert.equal(node('overviewJiraProjectKey').textContent,'BB');assert.equal(node('overviewConfluenceSpaceKey').textContent,'BC');
 assert.equal(node('startupMappingProject').children.length,3);
 projects.splice(1);page.render();assert.equal(node('startupMappingProject').value,'a');assert.equal(node('overviewJiraProjectKey').textContent,'AA');
 projects.splice(0);page.render();assert.equal(node('overviewJiraProjectKey').textContent,'Not selected');assert.equal(node('overviewJiraInventory').disabled,true);
});
