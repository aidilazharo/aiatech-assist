'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const ext=require('../src/lib/updates/github-release-updater');
const lib=require('../src/lib/updates/library-release-updater');
const mirror=require('../scripts/mirror-public-release');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
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
test('public extension and Library update checks select the newest release across both repositories without credentials',async()=>{
 const calls=[];
 const repos={
  'aidilazharo/aiatech-assist':[release('aidilazharo/aiatech-assist','v0.4.24-build.1',['atgv-aiatech-assist-0.4.24.vsix','vsix.sha256'])],
  'aidilazharo/extension':[release('aidilazharo/extension','v0.4.25-build.2',['atgv-aiatech-assist-0.4.25.vsix','vsix.sha256'])],
  'aidilazharo/tech-stacks-skills':[release('aidilazharo/tech-stacks-skills','v1.1.17-source-build.1',['tech-stacks-skills-1.1.17-source.zip','library-source.sha256'])],
  'aidilazharo/library':[release('aidilazharo/library','v1.1.18-source-build.2',['tech-stacks-skills-1.1.18-source.zip','library-source.sha256'])]
 };
 const request=apiRequest(repos,calls);
 const extension=await ext.latestAcrossRepositories({version:'0.4.24',request});
 const library=await lib.latestAcrossRepositories({request});
 assert.equal(extension.latest.version,'0.4.25');assert.equal(extension.release.repository,'aidilazharo/extension');
 assert.equal(library.latest.version,'1.1.18');assert.equal(library.release.repository,'aidilazharo/library');
 assert.ok(calls.some(url=>url.includes('aidilazharo/extension'))&&calls.some(url=>url.includes('aidilazharo/library')));
});
test('an empty or unavailable additional repository does not hide an existing release',async()=>{
 const source=release('aidilazharo/aiatech-assist','v0.4.24-build.1',['atgv-aiatech-assist-0.4.24.vsix','vsix.sha256']);
 const result=await ext.latestAcrossRepositories({version:'0.4.20',request:apiRequest({'aidilazharo/aiatech-assist':[source],'aidilazharo/extension':new Error('offline')},[])});
 assert.equal(result.release.version,'0.4.24');assert.equal(result.errors.length,1);
});
test('a newer release without a verified package is shown but cannot silently downgrade installation',async()=>{
 const repos={'aidilazharo/aiatech-assist':[release('aidilazharo/aiatech-assist','v0.4.24-build.1',['atgv-aiatech-assist-0.4.24.vsix','vsix.sha256'])],
  'aidilazharo/extension':[release('aidilazharo/extension','v0.4.25-build.2',[])]};
 const result=await ext.latestAcrossRepositories({version:'0.4.20',request:apiRequest(repos,[])});
 assert.equal(result.latest.version,'0.4.25');assert.equal(result.latest.installable,false);assert.equal(result.release,null);
});
test('public mirror verifies the source and publishes only the requested extension artifacts',async()=>{
 const artifact=Buffer.from('verified vsix'),name='atgv-aiatech-assist-0.4.25.vsix',checksum=Buffer.from(digest(artifact)+'  '+name+'\n');
 const tag='v0.4.25-build.1',source='aidilazharo/aiatech-assist',target='aidilazharo/extension';
 const row={tag_name:tag,draft:false,target_commitish:'a'.repeat(40),assets:[{name,state:'uploaded',size:artifact.length,browser_download_url:mirror.assetUrl(source,tag,name)},{name:'vsix.sha256',state:'uploaded',size:checksum.length,browser_download_url:mirror.assetUrl(source,tag,'vsix.sha256')}]};
 const calls=[];
 const fetcher=async url=>{calls.push(url);if(url.includes('/releases?'))return Buffer.from(JSON.stringify([row]));if(url.includes('/releases/tags/'))return null;if(url.endsWith('/'+name))return artifact;if(url.endsWith('/vsix.sha256'))return checksum;throw Error(url);};
 let args;
 const result=await mirror.mirror({kind:'extension',target,fetcher,runner:async(_cmd,argv)=>{args=argv;}});
 assert.equal(result.status,'published');assert.ok(args.includes('--latest'));assert.ok(args.includes(target));
 assert.equal(args.some(x=>String(x).endsWith('Source.zip')),false);
 assert.ok(calls.every(url=>url.startsWith('https://')));
});
test('release mirror uses its Actions token only for the GitHub API',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,headers:options.headers});
  return {ok:true,status:200,headers:{get:()=>null},arrayBuffer:async()=>Buffer.from('ok')};
 };
 for(const url of ['https://api.github.com/repos/aidilazharo/extension/releases',
  'https://github.com/aidilazharo/extension/releases/download/v1/file.vsix',
  'https://api.github.com.example.org/repos/attacker/repo'])
  await mirror.fetchBytes(url,{fetchImpl,token:'temporary-actions-token'});
 assert.equal(calls[0].headers.Authorization,'Bearer temporary-actions-token');
 assert.equal(calls[1].headers.Authorization,undefined);
 assert.equal(calls[2].headers.Authorization,undefined);
});
test('mirror reports the failing API endpoint and rate limit without leaking the token',async()=>{
 const fetchImpl=async()=>({ok:false,status:403,headers:{get:name=>name==='x-ratelimit-remaining'?'0':null}});
 await assert.rejects(mirror.fetchBytes('https://api.github.com/repos/aidilazharo/extension/releases?access_token=private',{fetchImpl,token:'temporary-actions-token'}),error=>{
  assert.match(error.message,/api\.github\.com\/repos\/aidilazharo\/extension\/releases: HTTP 403/);
  assert.match(error.message,/rate limit/);assert.doesNotMatch(error.message,/temporary-actions-token|private/);return true;
 });
});
test('mirror rejects checksum mismatches, foreign repositories and conflicting target releases',async()=>{
 assert.throws(()=>mirror.verifyChecksum(Buffer.from('changed'),Buffer.from('0'.repeat(64)+'  a.vsix\n'),'a.vsix'),/SHA-256/);
 await assert.rejects(mirror.mirror({kind:'extension',target:'attacker/extension'}),/Unexpected/);
 const manifest=fs.readFileSync(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
 const host=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.doesNotMatch(manifest,/releaseDownloadPat/);assert.doesNotMatch(ui,/releaseDownloadPat/);
 assert.doesNotMatch(host,/releaseAccessToken|case 'saveReleaseDownloadPat'/);
 assert.match(host,/secrets\.delete\(LEGACY_RELEASE_DOWNLOAD_PAT_SECRET\)/);
 assert.doesNotMatch(manifest,/id="gateLatestVersions"/);
 assert.match(ui,/softwareExtensionStatus/);assert.match(ui,/softwareLibraryStatus/);
});
test('the release mirror never overwrites a target tag with an unrelated source',async()=>{
 const artifact=Buffer.from('vsix'),name='atgv-aiatech-assist-0.4.25.vsix',checksum=Buffer.from(digest(artifact)+'  '+name+'\n');
 const tag='v0.4.25-build.1',source='aidilazharo/aiatech-assist',target='aidilazharo/extension';
 const row={tag_name:tag,target_commitish:'a'.repeat(40),assets:[{name,state:'uploaded',size:artifact.length,browser_download_url:mirror.assetUrl(source,tag,name)},{name:'vsix.sha256',state:'uploaded',size:checksum.length,browser_download_url:mirror.assetUrl(source,tag,'vsix.sha256')}]};
 const fetcher=async url=>url.includes('/releases?')?Buffer.from(JSON.stringify([row])):url.includes('/releases/tags/')?Buffer.from(JSON.stringify({body:'Different source',assets:[]})):url.endsWith('/vsix.sha256')?checksum:artifact;
 let called=false;
 await assert.rejects(mirror.mirror({kind:'extension',target,fetcher,runner:async()=>{called=true;}}),/different source identity/);
 assert.equal(called,false);
});
