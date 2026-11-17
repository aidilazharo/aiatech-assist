'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const core=require('../src/self-improvement'),sdk=require('../src/copilot-repair-sdk'),view=require('../src/self-improvement-view');
const git=(args,cwd)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).trim();
function tmp(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-self-improve-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}

test('reports are local, validated, redacted and automatic duplicates are counted',async t=>{
 const dir=tmp(t),store=new core.IssueStore(dir);
 const input={category:'ui',target:'extension',title:'Button is hidden',screen:'Jira preview',observed:'token=ghp_abcdefghijklmnopqrstuv user@example.com'};
 const [a,b]=await Promise.all([store.add(input,{origin:'automatic'}),store.add(input,{origin:'automatic'})]);
 assert.equal(a.id,b.id);const list=await store.list();assert.equal(list.length,1);assert.equal(list[0].count,2);
 assert.doesNotMatch(list[0].observed,/abcdefghijkl|user@example/);assert.match(list[0].observed,/REDACTED/);
 assert.equal(list[0].status,'recorded');assert.throws(()=>core.normalizeReport({title:'',observed:'x'}),/title/);
 assert.equal(core.cleanPath('../secrets.txt'),'');assert.equal(core.cleanPath('.env'),'');assert.equal(core.cleanPath('src/main.js'),'src/main.js');
});

test('repair plans reject unsafe paths, ambiguous replacements and edits to existing tests',async t=>{
 const dir=tmp(t);fs.mkdirSync(path.join(dir,'src'));fs.mkdirSync(path.join(dir,'test'));
 fs.writeFileSync(path.join(dir,'src','main.js'),'const value = 1;\nconst value = 1;\n');
 assert.equal(core.allowedPatch('.github/workflows/release.yml'),false);
 assert.equal(core.allowedPatch('test/existing.test.js'),false);
 assert.equal(core.allowedPatch('test/new.test.js',{isNew:true}),true);
 await assert.rejects(()=>core.applyChanges(dir,{changes:[{path:'src/main.js',oldText:'value = 1',newText:'value = 2'}]},['src/main.js']),/ambiguous/);
 assert.equal(fs.readFileSync(path.join(dir,'src','main.js'),'utf8'),'const value = 1;\nconst value = 1;\n');
 if(process.platform!=='win32'){fs.symlinkSync('/tmp',path.join(dir,'src','outside'));await assert.rejects(()=>core.applyChanges(dir,{changes:[{path:'src/outside/test.js',oldText:'x',newText:'y'}]},['src/outside/test.js']),/symbolic link/);}
});

test('Copilot SDK adapter rejects agent tool execution and cleans up the session',async()=>{
 let settings,closed=false,stopped=false,promptSeen='';
 class Client{async start(){}async createSession(x){settings=x;return {sendAndWait:async value=>{promptSeen=value.prompt;return {data:{content:'{"changes":[]}'}};},disconnect:async()=>{closed=true;}};}async stop(){stopped=true;}}
 const answer=await sdk.analyze('/tmp',{cwd:'/tmp',prompt:'Analyze this issue',sdkLoader:async()=>({CopilotClient:Client})});
 assert.equal(answer,'{"changes":[]}');assert.equal(promptSeen,'Analyze this issue');assert.deepEqual(settings.availableTools,[]);
 assert.equal((await settings.onPermissionRequest({kind:'shell'})).kind,'reject');assert.equal(closed,true);assert.equal(stopped,true);
 assert.equal(sdk.compatibleNode('20.18.0'),false);assert.equal(sdk.compatibleNode('20.19.0'),true);assert.equal(sdk.compatibleNode('22.11.0'),false);assert.equal(sdk.compatibleNode('22.12.0'),true);
});

test('report webview exposes UI and workflow reports and its inline script compiles',()=>{
 const doc=view.html('test-nonce','0.3.95');
 for(const text of ['Report an Issue','UI or layout','Process or workflow','Performance','Set up Copilot SDK','Analyze &amp; Prepare Fix','Commit &amp; Create PR'])assert.ok(doc.includes(text),text);
 const script=doc.match(/<script nonce="test-nonce">([\s\S]*?)<\/script>/)?.[1];assert.ok(script);assert.doesNotThrow(()=>new Function(script));
});

test('a local repair can be proposed, reviewed, verified, committed and submitted as a PR',async t=>{
 try{git(['--version'],process.cwd());}catch{t.skip('Git unavailable');return;}
 const dir=tmp(t),source=path.join(dir,'source'),bare=path.join(dir,'origin.git'),storage=path.join(dir,'storage');fs.mkdirSync(source);fs.mkdirSync(storage);
 git(['init','-b','main'],source);git(['config','user.name','Test'],source);git(['config','user.email','test@example.invalid'],source);
 fs.mkdirSync(path.join(source,'src','lib','webview'),{recursive:true});fs.mkdirSync(path.join(source,'test'));
 fs.writeFileSync(path.join(source,'src','widget.js'),'function button(){ return false; }\nmodule.exports=button;\n');
 fs.writeFileSync(path.join(source,'src','lib','webview','dashboard-html.js'),"const v=ok?'x':'0.3.94';\n");
 fs.writeFileSync(path.join(source,'README.md'),'**Version: 0.3.94**\n');fs.writeFileSync(path.join(source,'RELEASE.md'),'Old release\n');
 fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({name:'atgv-aiatech-assist',version:'0.3.94',atgvDisplayVersion:'0.3.94'}));fs.writeFileSync(path.join(source,'test','keep.test.js'),'// existing test\n');
 git(['add','.'],source);git(['commit','-m','Initial'],source);const base=git(['rev-parse','HEAD'],source);
 git(['init','--bare','-b','main',bare],dir);git(['remote','add','origin',bare],source);git(['push','origin','main'],source);
 const url='https://github.com/Acme/extension.git',token='ghp_'+'a'.repeat(40);let prCreated,checks=[],failCreate=true,createdIssue;
 const run=async(bin,args,options={})=>{
  if(bin==='git'&&args[0]==='clone'){const local=args.map(x=>x===url?bare:x);const out=git(local,options.cwd);git(['remote','set-url','origin',url],args.at(-1));return out;}
  if(bin==='git'&&['ls-remote','push'].includes(args[0]))return git(args.map(x=>x==='origin'?bare:x),options.cwd);
  return core.runFile(bin,args,options);
 };
 const api={...require('../src/repo-sync-github-api'),findOpenPr:async()=>'',createPr:async(repo,pat,details)=>{if(failCreate){failCreate=false;throw Error('Temporary PR API failure');}prCreated=details;return 'https://github.com/Acme/extension/pull/7';},githubRequest:async(repo,pat,method,suffix)=>{
  if(method==='GET'&&suffix==='/pulls/7')return {status:200,body:{state:'open',head:{sha:createdIssue.commitSha},base:{ref:'main',sha:base}}};
  if(method==='GET'&&suffix.includes('/check-runs'))return {status:200,body:{total_count:1,check_runs:[{name:'Test and package VSIX',status:'completed',conclusion:'success'}]}};
  if(method==='PUT')return {status:200,body:{merged:true,sha:'b'.repeat(40)}};
  throw Error('Unexpected API call');
 }};
 const manager=new core.SelfImprovement({root:storage,run,api,check:async(bin,args)=>{checks.push([bin,...args].join(' '));return {passed:true,exitCode:0,output:'passed'};},askCopilot:async({prompt})=>{assert.match(prompt,/src\/widget.js/);assert.doesNotMatch(prompt,/ghp_a{20}/);return JSON.stringify({summary:'Fix button response',changes:[{path:'src/widget.js',oldText:'return false;',newText:'return true;'}]});}});
 const issue=await manager.store.add({category:'ui',target:'extension',title:'Fix button response',observed:'The widget button returns false',screen:'widget',files:'src/widget.js'});
 const proposal=await manager.prepare(issue.id,{url,token});assert.equal(proposal.status,'proposed');assert.equal(proposal.version,'0.3.95');assert.match(proposal.branch,/^fix\/fix-button-response/);assert.doesNotMatch(proposal.branch,/-[a-f0-9]{8}$/);
 assert.equal(fs.readFileSync(path.join(source,'src','widget.js'),'utf8').includes('return false;'),true);
 assert.match(await manager.diff(issue.id),/return true/);
 const verified=await manager.test(issue.id);assert.equal(verified.status,'tested');assert.deepEqual(checks,['npm test','npm run ui:check','npm run package']);
 await assert.rejects(()=>manager.publish(issue.id,{token}),/Temporary PR API failure/);assert.equal((await manager.store.get(issue.id)).status,'pushed');
 const published=await manager.publish(issue.id,{token});createdIssue=published;assert.equal(published.status,'published');assert.equal(prCreated.base,'main');assert.equal(prCreated.branch,proposal.branch);assert.ok(prCreated.body.split('\n').every(x=>x.startsWith('- ')));assert.equal(git(['rev-parse','refs/heads/main'],bare),base);
 assert.equal(git(['rev-parse','refs/heads/'+proposal.branch],bare),published.commitSha);
 const merged=await manager.merge(issue.id,{token});assert.equal(merged.status,'merged');assert.equal(merged.mergeSha,'b'.repeat(40));
});
