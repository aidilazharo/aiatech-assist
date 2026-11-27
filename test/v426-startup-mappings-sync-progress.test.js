'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
test('startup connection cards are moved, not duplicated, and token help uses trusted host routes',()=>{
 const start=html.indexOf('id="startupConnectionForm"'),end=html.indexOf('id="landingView"');
 for(const id of ['overviewJiraConnection','overviewConfluenceConnection','startupAtlassianTokenInfo','startupGithubTokenInfo']){
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
 const a=ui.indexOf('function renderStartupMappings(){'),b=ui.indexOf('function renderOverviewSdlcPhases()',a);
 assert.ok(a>=0&&b>a);
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{dataset:{},children:[],value:'',textContent:'',disabled:false,classList:{toggle(){}},replaceChildren(){this.children=[];},append(...items){this.children.push(...items);}});
  return nodes.get(id);
 };
 const doc={createElement:()=>({value:'',textContent:''})};
 const create=new Function('$','document','projects','startupProjectMappings',`
 let activeId='',startupMappingProjectId='',startupConnectionVerified=false;
 ${ui.slice(a,b)}
 return {render:renderStartupMappings,select:id=>activeId=id,verify:v=>startupConnectionVerified=v};
 `);
 const projects=[{id:'a',name:'Project A'},{id:'b',name:'Project B'}];
 const mappings={a:{jira:{key:'AA',source:'project'},confluence:{key:'AC',source:'project'}},b:{jira:{key:'BB',source:'extension'},confluence:{key:'BC',source:'project'}}};
 const page=create(node,doc,projects,mappings);
 page.render();assert.equal(node('overviewJiraProjectKey').textContent,'Not selected');

 page.select('a');page.render();
 assert.equal(node('overviewJiraProjectKey').textContent,'AA');assert.equal(node('overviewConfluenceSpaceKey').textContent,'AC');
 assert.equal(node('overviewJiraMappingStatus').disabled,true);assert.equal(node('overviewJiraInventory').disabled,true);
 page.verify(true);page.render();assert.equal(node('overviewJiraMappingStatus').disabled,false);assert.equal(node('overviewJiraInventory').disabled,false);
 page.select('b');page.render();
 assert.equal(node('overviewJiraProjectKey').textContent,'BB');assert.equal(node('overviewConfluenceSpaceKey').textContent,'BC');

 projects.splice(1);page.render();assert.equal(node('overviewJiraProjectKey').textContent,'AA');
 projects.splice(0);page.render();assert.equal(node('overviewJiraProjectKey').textContent,'Not selected');assert.equal(node('overviewJiraInventory').disabled,true);
});

test('all token help entries show an internal modal and only explicit Open Website dispatches an allowlisted provider',()=>{
 const start=ui.indexOf('const tokenHelpLinks=Object.freeze('),end=ui.indexOf("for(const [id,provider] of [['guideJiraTokenLink'",start);
 assert.ok(start>=0&&end>start);
 const nodes=new Map(),sent=[];let restored=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{open:false,events:{},value:'',textContent:'',focus(){},select(){},showModal(){this.open=true;},close(){this.open=false;},addEventListener(name,handler){this.events[name]=handler;}});return nodes.get(id);};
 const document={body:{appendChild(){}},activeElement:{isConnected:true,focus(){restored++;}}};
 const page=new Function('$','document','navigator','send',ui.slice(start,end)+';return {open:openTokenHelpModal};')(node,document,{},(type,payload)=>sent.push({type,...payload}));
 page.open('jira');assert.equal(node('tokenHelpModal').open,true);assert.equal(sent.length,0);
 assert.doesNotMatch(html,/id="tokenHelpUrl"/);
 node('tokenHelpCancel').events.click();assert.equal(node('tokenHelpModal').open,false);assert.equal(sent.length,0);assert.equal(restored,1);
 page.open('github');assert.equal(node('tokenHelpTitle').textContent,'GitHub personal access token');
 node('tokenHelpOpen').events.click();assert.deepEqual(sent,[{type:'guideTokenLink',provider:'github'}]);assert.equal(node('tokenHelpModal').open,false);
 page.open('constructor');assert.equal(node('tokenHelpModal').open,false);
 page.open('confluence');node('tokenHelpModal').events.cancel({preventDefault(){}});assert.equal(sent.length,1);assert.equal(node('tokenHelpModal').open,false);
 assert.match(html,/<dialog id="tokenHelpModal"[^>]*aria-labelledby="tokenHelpTitle"/);
 assert.match(ui,/startupGithubTokenInfo','github'\]\]\)\$\(id\)\.addEventListener\('click',\(\)=>openTokenHelpModal\(provider\)\)/);
 const guide=read('media/user-guide-controller.js');assert.match(guide,/guideStepTokenLink[^\n]*openTokenHelpModal\(provider\)/);
});

test('missing Library gate is mandatory after setup or workspace opening and does not accept unactivated checkout',()=>{
 const a=ui.indexOf('function libraryGateRequired(){'),b=ui.indexOf('function syncRequiredLibraryGate(){',a);
 const create=new Function('workspaceFolderAvailable','catalogState','workspaceOpened','startupSetupRequired',ui.slice(a,b)+';return libraryGateRequired();');
 assert.equal(create(true,{installed:{version:'1'},activeVerified:false},true,false),true);
 assert.equal(create(true,{activeVerified:false},false,false),true);
 assert.equal(create(true,{activeVerified:false},false,true),false);
 assert.equal(create(true,{activeVerified:true},true,false),false);
 assert.equal(create(false,{activeVerified:false},true,false),false);
 assert.match(html,/<dialog id="requiredLibraryModal"/);
 assert.match(ui,/requiredLibraryModal'\)\.addEventListener\('cancel',event=>event\.preventDefault\(\)\)/);
 assert.match(host,/dashboard\.webview\.html=html\(dashboard\.webview,\{resumeLibrary:vendorChanged&&!msg\.requiredLibrary\}\)/);
 assert.doesNotMatch(html,/id="startupMappingProject"|id="gateManual"|id="tokenHelpUrl"/);
});

test('page changes request fresh local Library verification and host validates active manifest',()=>{
 assert.match(ui,/send\('libraryGateCheck',\{requestId:\+\+libraryGateCheckSequence\}\)/);
 assert.match(host,/case 'libraryGateCheck':\{/);
 assert.match(host,/const manifest=await sdlcCatalog\.activeManifest\(workspace\)/);
 assert.match(host,/manifest\?\.version===active\.version/);
 assert.match(host,/!await verifiedActiveLibrary\(workspace,active\)/);
});
