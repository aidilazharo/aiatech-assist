'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const ext=require('../src/lib/updates/github-release-updater');
const lib=require('../src/lib/updates/library-release-updater');
const mirror=require('../scripts/mirror-public-release');
function release(repo,tag,names,date='2026-01-01T00:00:00Z'){
 return {tag_name:tag,draft:false,published_at:date,html_url:`https://github.com/${repo}/releases/tag/${tag}`,assets:names.map((name,i)=>({name,size:10,url:`https://api.github.com/repos/${repo}/releases/assets/${i+1}`}))};
}
function apiRequest(repositories,calls){return async(url,options)=>{
 assert.equal(options.token,undefined);calls.push(url);
 if(url.endsWith('/latest'))throw Error('No stable release');
 const repo=url.match(/repos\/([^/]+\/[^/]+)\/releases/)[1];
 if(repositories[repo] instanceof Error)throw repositories[repo];
 return Buffer.from(JSON.stringify(repositories[repo]||[]));
};}
test('extension and Library update checks compare both fixed repositories',async()=>{
 const calls=[];
 const repos={
  'aidilazharo/aiatech-assist':[release('aidilazharo/aiatech-assist','v0.4.24-build.1',['atgv-aiatech-assist-0.4.24.vsix','vsix.sha256'])],
  'aiamalaysia/my-fow-technology-app-techassists-dev-sdlc':[release('aiamalaysia/my-fow-technology-app-techassists-dev-sdlc','v0.4.25-build.2',['atgv-aiatech-assist-0.4.25.vsix','vsix.sha256'])],
  'aidilazharo/tech-stacks-skills':[release('aidilazharo/tech-stacks-skills','v1.1.17-source-build.1',['tech-stacks-skills-1.1.17-source.zip','library-source.sha256'])],
  'aiamalaysia/my-fow-technology-app-techassists-enterprise-skills':[release('aiamalaysia/my-fow-technology-app-techassists-enterprise-skills','v1.1.18-source-build.2',['tech-stacks-skills-1.1.18-source.zip','library-source.sha256'])]
 };
 const request=apiRequest(repos,calls);
 const extension=await ext.latestAcrossRepositories({version:'0.4.24',request});
 const library=await lib.latestAcrossRepositories({request});
 assert.equal(extension.latest.version,'0.4.25');assert.equal(extension.release.repository,'aiamalaysia/my-fow-technology-app-techassists-dev-sdlc');
 assert.equal(library.latest.version,'1.1.18');assert.equal(library.release.repository,'aiamalaysia/my-fow-technology-app-techassists-enterprise-skills');
 assert.ok(calls.some(url=>url.includes('aiamalaysia/my-fow-technology-app-techassists-dev-sdlc'))&&calls.some(url=>url.includes('aiamalaysia/my-fow-technology-app-techassists-enterprise-skills')));
});
test('all four fixed repositories are queried, including development repositories',async()=>{
 const calls=[];
 const extension=await ext.latestAcrossRepositories({version:'0.4.20',request:apiRequest({'aiamalaysia/my-fow-technology-app-techassists-dev-sdlc':[release('aiamalaysia/my-fow-technology-app-techassists-dev-sdlc','v0.4.25-build.2',['atgv-aiatech-assist-0.4.25.vsix','vsix.sha256'])]},calls)});
 const library=await lib.latestAcrossRepositories({request:apiRequest({'aiamalaysia/my-fow-technology-app-techassists-enterprise-skills':[release('aiamalaysia/my-fow-technology-app-techassists-enterprise-skills','v1.1.18-source-build.2',['tech-stacks-skills-1.1.18-source.zip','library-source.sha256'])]},calls)});
 assert.deepEqual(ext.RELEASE_REPOSITORIES,['aiamalaysia/my-fow-technology-app-techassists-dev-sdlc','aidilazharo/aiatech-assist']);
 assert.deepEqual(lib.RELEASE_REPOSITORIES,['aiamalaysia/my-fow-technology-app-techassists-enterprise-skills','aidilazharo/tech-stacks-skills']);
 assert.equal(extension.release.repository,'aiamalaysia/my-fow-technology-app-techassists-dev-sdlc');
 assert.equal(library.release.repository,'aiamalaysia/my-fow-technology-app-techassists-enterprise-skills');
 for(const repository of [...ext.RELEASE_REPOSITORIES,...lib.RELEASE_REPOSITORIES])assert.ok(calls.includes('https://api.github.com/repos/'+repository+'/releases/latest'),repository);
});
test('a newer release without a verified package is shown but cannot silently downgrade installation',async()=>{
 const repos={'aidilazharo/aiatech-assist':[release('aidilazharo/aiatech-assist','v0.4.24-build.1',['atgv-aiatech-assist-0.4.24.vsix','vsix.sha256'])],
  'aiamalaysia/my-fow-technology-app-techassists-dev-sdlc':[release('aiamalaysia/my-fow-technology-app-techassists-dev-sdlc','v0.4.25-build.2',[])]};
 const result=await ext.latestAcrossRepositories({version:'0.4.20',request:apiRequest(repos,[])});
 assert.equal(result.latest.version,'0.4.25');assert.equal(result.latest.installable,false);assert.equal(result.release,null);
});
test('retired mirror cannot publish any release',async()=>{
 let called=false;
 await assert.rejects(mirror.mirror({kind:'extension',target:ext.REPO,runner:async()=>{called=true;}}),/retired/);
 assert.equal(called,false);
});
test('release route changes preserve credential UI and approval protections',()=>{
 const manifest=fs.readFileSync(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
 const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.doesNotMatch(manifest,/releaseDownloadPat/);assert.doesNotMatch(ui,/releaseDownloadPat/);
 assert.doesNotMatch(host,/releaseAccessToken|case 'saveReleaseDownloadPat'/);
 assert.match(host,/secrets\.delete\(LEGACY_RELEASE_DOWNLOAD_PAT_SECRET\)/);
 assert.doesNotMatch(manifest,/id="gateLatestVersions"/);
 assert.match(ui,/softwareExtensionStatus/);assert.match(ui,/softwareLibraryStatus/);
});

test('saved GitHub credential is scoped to approved release API paths and never forwarded to the asset CDN',async t=>{
 const https=require('node:https'),{EventEmitter}=require('node:events');
 const seen=[];
 t.mock.method(https,'get',(url,options,callback)=>{
  seen.push({url:String(url),authorization:options.headers.Authorization});
  const req=new EventEmitter();req.destroy=error=>req.emit('error',error);
  queueMicrotask(()=>{
   const response=new EventEmitter();response.resume=()=>{};
   response.headers={};response.statusCode=200;
   if(String(url).endsWith('/assets/1')){
    response.statusCode=302;response.headers.location='https://release-assets.githubusercontent.com/example';
    callback(response);
   }else{
    callback(response);response.emit('data',Buffer.from('ok'));response.emit('end');
   }
  });
  return req;
 });
 const request=ext.authorizedRequest('test-token');
 await request('https://api.github.com/repos/'+ext.REPO+'/releases/assets/1');
 await request('https://api.github.com/repos/'+lib.REPO+'/releases/latest');
 await request('https://api.github.com/repos/unrelated/example/releases');
 assert.deepEqual(seen.map(x=>x.authorization),['Bearer test-token',undefined,'Bearer test-token',undefined]);
});

test('newer development release wins and an unavailable mirror does not block checks',async()=>{
 const calls=[];
 const repos={'aidilazharo/aiatech-assist':[release('aidilazharo/aiatech-assist','v0.4.26',['atgv-aiatech-assist-0.4.26.vsix','vsix.sha256'],'2026-11-27T01:00:00Z')], [ext.REPO]:Error('mirror offline'), 'aidilazharo/tech-stacks-skills':[release('aidilazharo/tech-stacks-skills','v1.2.0',['tech-stacks-skills-1.2.0-source.zip','library-source.sha256'])],[lib.REPO]:Error('mirror offline')};
 const request=apiRequest(repos,calls);
 const extension=await ext.latestAcrossRepositories({version:'0.4.25',request});
 const library=await lib.latestAcrossRepositories({request});
 assert.equal(extension.release.repository,'aidilazharo/aiatech-assist');assert.equal(extension.latest.publishedAt,'2026-11-27T01:00:00Z');assert.equal(extension.errors.length,1);
 assert.equal(library.release.repository,'aidilazharo/tech-stacks-skills');assert.equal(library.errors.length,1);
});
