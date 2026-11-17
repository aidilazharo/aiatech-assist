'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
const css=read('media/start.css'),ui=read('media/start.js');

test('top-bar extension/library version text is larger on desktop and mobile while title/mark remain compact',()=>{
 const after=css.slice(css.indexOf('/* v0.3.86: increase top-bar version legibility'));
 assert.ok(after.startsWith('/* v0.3.86:'),'top-bar version override must exist at stylesheet end');
 assert.match(after,/body:not\(\.gate-mode\) \.app-header \.brand-identity \.brand-versions\s*\{\s*font-size:11px;/);
 assert.match(after,/@media\(max-width:760px\)\s*\{\s*body:not\(\.gate-mode\) \.app-header \.brand-identity \.brand-versions\s*\{\s*font-size:9px;/);
 assert.match(after,/font-weight:600;/);
 assert.match(css,/\.gate-top \.gate-product-title h1\{margin:0;line-height:1\.1\}/);
 assert.match(css,/\.gate-top \.gate-product-title\{gap:1px;line-height:1\.1\}/);
 assert.doesNotMatch(after,/(?:\.brand-logo|\.brand-name|\.gate-logo)[\s.{]/);
});

function createPageHarness(){
 const start=ui.indexOf('function renderStartupPage(){');
 const end=ui.indexOf('function showStartupStep(required)',start);
 const invalidateStart=ui.indexOf('function invalidateStartupConnection(){');
 const invalidateEnd=ui.indexOf('for(const id of Object.values(startupFieldMap))',invalidateStart);
 assert.ok(start>0&&end>start&&invalidateStart>0&&invalidateEnd>invalidateStart);
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id)){
   const hidden=new Set();
   nodes.set(id,{
    disabled:false,textContent:'',hiddenClasses:hidden,
    classList:{toggle:(name,active)=>active?hidden.add(name):hidden.delete(name)}
   });
  }
  return nodes.get(id);
 };
 const create=new Function('$',[
  "const startupFieldMap={jiraUrl:'startupJiraUrl',confluenceUrl:'startupConfluenceUrl',email:'startupEmail',githubUrl:'startupGithubUrl',projectRepoUrl:'startupProjectRepo',libraryRepoUrl:'startupLibraryRepo'};",
  "let startupSetupRequired=true,startupPage=1,startupVerifying=false,startupInstallingModule='',startupScanComplete=true,startupConnectionVerified=true;",
  ui.slice(start,end),
  ui.slice(invalidateStart,invalidateEnd),
  'return {renderStartupPage,invalidateStartupConnection,setVerifying:v=>startupVerifying=v,setVerified:v=>startupConnectionVerified=v};'
 ].join('\n'));
 return {page:create(node),node};
}

test('successful Test & Save hides and disables action, changes restore it, and verification locks inputs',()=>{
 const {page,node}=createPageHarness();
 page.renderStartupPage();
 assert.equal(node('startupTestConnections').disabled,true);
 assert.equal(node('startupTestConnections').hiddenClasses.has('hidden'),true);
 assert.equal(node('startupProceed').disabled,false);
 assert.match(node('startupProceedInfo').textContent,/Connections verified/);

 page.invalidateStartupConnection();
 assert.equal(node('startupTestConnections').disabled,false);
 assert.equal(node('startupTestConnections').hiddenClasses.has('hidden'),false);
 assert.equal(node('startupProceed').disabled,true);
 assert.match(node('startupConnectionMessage').textContent,/Test and save again/);

 page.setVerifying(true);
 page.renderStartupPage();
 assert.equal(node('startupTestConnections').disabled,true);
 assert.equal(node('startupGithubToken').disabled,true);
 assert.equal(node('startupJiraUrl').disabled,true);

 page.setVerifying(false);
 page.setVerified(true);
 page.renderStartupPage();
 assert.equal(node('startupTestConnections').hiddenClasses.has('hidden'),true);
 assert.equal(node('startupAtlassianToken').disabled,true);
 assert.equal(node('startupGithubToken').disabled,true);
 assert.equal(node('startupJiraUrl').disabled,true);
 assert.equal(node('startupProjectRepo').disabled,true);
});
