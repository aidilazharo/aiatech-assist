'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('v399: packaged webview styles precede controllers, without duplicate fallback CSS',()=>{
 const original=Module._load;
 let renderer;
 try{
  Module._load=function(request,parent,isMain){
   if(request==='vscode')return {Uri:{joinPath:(uri,...parts)=>({fsPath:path.join(uri.fsPath,...parts)}),file:location=>({fsPath:location})}};
   return original.call(this,request,parent,isMain);
  };
  ({createDashboardHtml:renderer}=require('../src/lib/webview/dashboard-html'));
 }finally{Module._load=original;}
 const html=renderer(()=>({extensionUri:{fsPath:'/atgv-extension'}}),()=>null)({
  asWebviewUri:uri=>uri.fsPath,cspSource:'vscode-resource:'
 });
 const head=html.slice(0,html.indexOf('</head>'));
 const body=html.slice(html.indexOf('</head>'));
 for(const css of ['start.css','ai-change-resolution.css','atgv-ui-theme.css','library-studio.css','pm-kanban.css','my-work-users.css'])
  assert.ok(head.includes('/media/'+css),'Missing head stylesheet '+css);
 assert.equal((head.match(/\/media\/start\.css"/g)||[]).length,1,'start.css loaded once even without vendor cache');
 assert.ok(head.indexOf('library-loader-probe.js')<head.indexOf('start.css'),'CSS probe must load before styles');
 assert.ok(body.indexOf('atgv-kanban.js')<body.indexOf('start.js'),'Kanban controller must load before start.js');
 assert.ok(body.indexOf('webview-asset-boot.js')>body.indexOf('user-guide-controller.js'),'readiness probe must be last');
 assert.ok(body.includes('id="pmKanbanBoard"'));
 assert.ok(body.includes('id="overviewUserRows"'));
 assert.ok(body.includes('id="openAtgvAi"'));
});

test('v399: Business Analyst My Work triggers live Jira scan from discovery view',()=>{
 const ui=read('media/start.js');
 assert.match(ui,/function ensureBAJiraInventory\(force=false\)/);
 assert.match(ui,/\['work','discovery'\]\.includes\(view\)/);
 assert.match(ui,/ensureBAJiraInventory\(true\)/);
 assert.match(ui,/ensurePMJiraInventory\(true\)/);
 assert.match(ui,/child issue\(s\) in progress \(Epic status unchanged\)/);
 assert.match(read('src/lib/runtime/extension-runtime.js'),/case 'pmJiraTransition'/);
});

test('v399: native Jira Kanban has no external CDN and bounds card count',()=>{
 const code=read('media/atgv-kanban.js');
 const kanban=require('../media/atgv-kanban');
 assert.equal(typeof kanban.render,'function');
 assert.match(code,/slice\(0,500\)/);
 assert.doesNotMatch(code,/https?:\/\/|require\(['"](?:react|sortable)/);
});

test('v399: verified email is transposed and Confluence roster HTML is escaped',()=>{
 const users=require('../src/my-work-presence');
 assert.equal(users.displayName('sarah.lee+pm@company.example'),'Sarah Lee Pm');
 const rows=[{id:'user-1',name:'Alex <Script>',email:'alex@example.com',roles:['Developer','Project Manager'],tasks:'TC-758 (In Progress)'}];
 const encoded=users.renderRows(rows);
 assert.ok(encoded.includes('Alex &lt;Script&gt;'));
 assert.ok(!encoded.includes('<Script>'));
 assert.deepEqual(users.extractRows(encoded).map(row=>({email:row.email,roles:row.roles,tasks:row.tasks})),[
  {email:'alex@example.com',roles:['Developer','Project Manager'],tasks:'TC-758 (In Progress)'}
 ]);
});

test('v399: ATGV AI uses official Codex auth and limits uploaded screenshot types',()=>{
 const chat=require('../src/atgv-ai-chat');
 const html=chat.html({});
 assert.match(html,/Sign in with ChatGPT/);
 assert.match(html,/image\/png,image\/jpeg,image\/webp/);
 assert.match(html,/ChatGPT website history or memories/);
 assert.doesNotMatch(html,/<input[^>]*type="password"/i);
 const source=read('src/atgv-ai-chat.js');
 assert.match(source,/\['login','status'\]/);
 assert.match(source,/--sandbox','read-only'/);
 assert.match(source,/2\*1024\*1024/);
 assert.match(source,/await fs\.rm\(temp/);
 const pkg=require('../package.json');
 assert.ok(pkg.contributes.commands.some(c=>c.command==='atgvAssist.ai'));
});

test('v399: workspace UI avoids Repo A and Repo B explanatory labels',()=>{
 const html=require('../src/repo-sync-workspace').workspaceHtml({nonce:'mock',version:require('../package.json').atgvDisplayVersion,cspSource:'vscode-resource:'});
 assert.ok(html.includes('<h2>1. Source</h2>'));
 assert.ok(html.includes('<h2>2. Destination</h2>'));
 assert.ok(!html.includes('Repo A'));
 assert.ok(!html.includes('Repo B'));
});
