'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const release=require('../src/repo-sync-release');
const workspace=require('../src/repo-sync-workspace');
const startup=require('../src/lib/startup-setup');
const updater=require('../src/lib/updates/github-release-updater');
const library=require('../src/lib/updates/library-release-updater');
const root=path.join(__dirname,'..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const blob=Buffer.from('ATGV verified release test artifact');
const file='atgv-aiatech-assist-0.0.79.vsix';
const checksum=Buffer.from(sha(blob)+'  '+file+'\n');
const extraName='ATGV-AIATECH-Assist-v0.0.79-Source.zip';
const extraBlob=Buffer.from('source zip artifact');
const extraHash=Buffer.from(sha(extraBlob)+'  '+extraName+'\n');
const source=release.SOURCES.extension, dest=release.DESTINATIONS.extension,tag='v0.0.79-build.1';
function fixture(){
 return {tag_name:tag,draft:false,prerelease:false,html_url:'https://github.com/'+source+'/releases/tag/'+tag,
  body:'Verified release notes',assets:[
   {id:11,name:file,size:blob.length,state:'uploaded',url:'https://api.github.com/repos/'+source+'/releases/assets/11'},
   {id:12,name:'vsix.sha256',size:checksum.length,state:'uploaded',url:'https://api.github.com/repos/'+source+'/releases/assets/12'}
  ]};
}
function fake({existing=null,badChecksum=false,extra=false}={}){
 const calls=[],api='https://api.github.com/repos/'+dest;
 const io=async(method,url,options={})=>{
  calls.push({method,url,options});
  if(url.includes('/releases?per_page=100')){
   const row=fixture();
   if(extra)row.assets.push(
    {id:13,name:extraName,size:extraBlob.length,state:'uploaded',url:'https://api.github.com/repos/'+source+'/releases/assets/13'},
    {id:14,name:'source.sha256',size:extraHash.length,state:'uploaded',url:'https://api.github.com/repos/'+source+'/releases/assets/14'});
   return Buffer.from(JSON.stringify([row]));
  }
  if(url.endsWith('/releases/assets/11'))return blob;
  if(url.endsWith('/releases/assets/12'))return badChecksum?Buffer.from('broken hash'):checksum;
  if(url.endsWith('/releases/assets/13'))return extraBlob;
  if(url.endsWith('/releases/assets/14'))return extraHash;
  if(url.includes('/releases/tags/'))return existing===null?null:Buffer.from(JSON.stringify(existing));
  if(method==='POST'&&url===api+'/releases')return Buffer.from(JSON.stringify({id:42,draft:true}));
  if(method==='POST'&&url.startsWith('https://uploads.github.com/'))return Buffer.from(JSON.stringify({id:88,state:'uploaded'}));
  if(method==='PATCH'&&url===api+'/releases/42')return Buffer.from(JSON.stringify({id:42,draft:false}));
  throw Error('Unexpected request: '+method+' '+url);
 };
 return {io,calls};
}
test('aiMalaysia is the only startup/source/release owner',()=>{
 assert.deepEqual(Object.keys(startup.SOURCE_REPOS),['aiamalaysia']);
 assert.deepEqual(updater.RELEASE_REPOSITORIES,['aiamalaysia/my-fow-technology-app-techassists-dev-sdlc']);
 assert.deepEqual(library.RELEASE_REPOSITORIES,['aiamalaysia/my-fow-technology-app-techassists-enterprise-skills']);
 assert.equal(startup.RELEASES.extension,'https://github.com/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc');
 assert.equal(startup.RELEASES.library,'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills');
 assert.equal(release.SOURCES.library,'aiamalaysia/my-fow-technology-app-techassists-enterprise-skills');
 for(const file of ['src/lib/startup-setup.js','src/lib/runtime/extension-runtime.js',
  'src/lib/updates/github-release-updater.js','src/lib/updates/library-release-updater.js',
  'src/repo-sync-release.js','scripts/mirror-public-release.js','package.json']){
  assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/aidilazharo/i,file);
 }
});
test('Workspace offers a release-copy button without a local Git folder and uses host confirmation',()=>{
 const html=workspace.workspaceHtml({nonce:'safe-abc',version:'0.0.80',cspSource:'vscode-resource:'});
 assert.match(html,/id="copyReleaseArtifacts"/);
 assert.match(html,/command:'copyReleaseArtifacts'/);
 assert.match(html,/id="releaseKind"/);
 assert.match(html,/id="releaseTag"/);
 const js=html.match(/<script nonce="safe-abc">([\s\S]*?)<\/script>/)[1];
 assert.doesNotThrow(()=>new Function(js));
});
test('copy publishes only validated VSIX and checksum and keeps source provenance',async()=>{
 const {io,calls}=fake();
 const result=await release.copy({kind:'extension',sourceToken:'read',destinationToken:'write',io});
 assert.equal(result.tag,tag);assert.equal(result.uploaded,2);assert.equal(result.unchanged,0);
 assert.equal(result.sha256,sha(blob));
 const create=calls.find(c=>c.method==='POST'&&c.url==='https://api.github.com/repos/'+dest+'/releases');
 assert.equal(JSON.parse(create.options.body.toString()).draft,true);
 assert.match(JSON.parse(create.options.body.toString()).body,/ATGV source release:/);
 const uploads=calls.filter(c=>c.url.startsWith('https://uploads.github.com/'));
 assert.equal(uploads.length,2);
 assert.deepEqual(uploads.map(c=>c.options.body),[blob,checksum]);
 assert.equal(calls.at(-1).method,'PATCH');
});
test('release copy also includes source ZIP and its verified checksum',async()=>{
 const {io,calls}=fake({extra:true});
 const result=await release.copy({kind:'extension',sourceToken:'read',destinationToken:'write',io});
 assert.equal(result.uploaded,4);
 const uploaded=calls.filter(c=>c.url.startsWith('https://uploads.github.com/'));
 assert.deepEqual(uploaded.map(c=>new URL(c.url).searchParams.get('name')),[file,'vsix.sha256',extraName,'source.sha256']);
});
test('release copying rejects a mismatched checksum before any destination write',async()=>{
 const {io,calls}=fake({badChecksum:true});
 await assert.rejects(release.copy({kind:'extension',sourceToken:'read',destinationToken:'write',io}),/SHA-256|size mismatch/);
 assert.equal(calls.some(c=>c.method==='POST'||c.method==='PATCH'),false);
});
test('release copy rejects unknown artifact kinds and unsafe version tags',()=>{
 assert.throws(()=>release.destinations('anything'),/Choose Extension/);
 assert.throws(()=>release.safeTag('../malicious'),/Invalid Release tag/);
 assert.equal(release.safeTag(''), '');
});
test('release copy refuses to mutate an existing Release with foreign provenance',async()=>{
 const {io,calls}=fake({existing:{id:42,body:'A different source',assets:[]}});
 await assert.rejects(release.copy({kind:'extension',sourceToken:'read',destinationToken:'write',io}),/another origin/);
 assert.equal(calls.some(c=>c.method==='POST'||c.method==='PATCH'),false);
});
