'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const versions=require('../src/library-update-version');
const source=read('test/generated/extension-source.txt');
const ui=read('media/start.js');
test('GitHub library updates compare validated SemVer, never commit SHA',()=>{
 assert.equal(versions.validVersion('1.1.15'),'1.1.15');
 assert.equal(versions.validVersion('2a50944d72c8'),'');
 assert.equal(versions.validVersion(''), '');
 assert.deepEqual(
  versions.compareInstalledRemote('1.1.12','1.1.15'),
  {available:true,reason:'newer',installed:'1.1.12',remote:'1.1.15'}
 );
 for(const [installed,remote,reason] of [
  ['1.1.15','1.1.15','same'],
  ['1.1.16','1.1.15','older'],
  ['1.1.15','2a50944d72c8','remote-unverified']
 ]){
  const state=versions.compareInstalledRemote(installed,remote);
  assert.equal(state.available,false,installed+' vs '+remote);
  assert.equal(state.reason,reason);
 }
 assert.equal(versions.compareInstalledRemote('1.9.0','1.10.0').available,true);
 assert.equal(versions.compareInstalledRemote('1.1.15','1.1.15-rc.1').available,false);
 assert.deepEqual(versions.displayLibraryUpdate('1.1.12','1.1.15'),
  {installed:'v1.1.12',remote:'v1.1.15',message:'A newer verified SDLC Library version is available.'});
});
test('pinned GitHub VERSION is checked for all update polls, including non-ZIP checkouts',()=>{
 assert.match(source,/const info=await sdlcCatalog\.remoteVersion\(config,token\)/);
 assert.doesNotMatch(source,/const info=currentZip\?await sdlcCatalog\.remoteVersion/);
 assert.match(source,/libraryUpdateVersion\.compareInstalledRemote\(installedCatalog\.version,remote\)/);
 assert.match(source,/installedVersion:comparison\.installed,remoteVersion:comparison\.remote/);
 assert.match(source,/libraryLatest:catalogRemote\?\.version\|\|''/);
 assert.match(source,/catalogRemote=null;catalogLastError=error\.message/);
});
test('available version and update modal are strictly versions, no SHA as a version',()=>{
 const block=ui.slice(ui.indexOf("if(message.type!=='libraryUpdateOffer'"),ui.indexOf("let displayedExtensionUpgrade=null"));
 assert.match(block,/message\.remoteVersion/);
 assert.match(block,/\('libraryUpdateNext'\)\.textContent=latest\?'v'\+latest/);
 assert.doesNotMatch(block,/message\.remoteSha|message\.installedSha/);
 assert.match(ui,/Library on GitHub main: v/);
 assert.match(ui,/Library v\$\{remote\.version\} available/);
});
test('extension and library versions are directly under AIATECH ASSIST on both screens',()=>{
 assert.match(source,/<span class="brand-name">AIATECH <b>ASSIST<\/b><\/span><span class="brand-versions">Extension v\$\{extensionVersion\}/);
 assert.match(source,/<h1>AIATECH ASSIST<\/h1><small class="gate-brand-versions">Extension v\$\{extensionVersion\}/);
 assert.match(source,/id="headerLibraryVersion"/);
 assert.match(source,/id="gateLibraryVersion"/);
});
test('email is displayed lower-case and guide icon is the last header action',()=>{
 const begin=ui.indexOf('function updateHeaderUserName('),end=ui.indexOf('function updateBrandLibraryVersion(',begin);
 const el={textContent:'',title:''};
 const display=new Function('$',ui.slice(begin,end)+'return updateHeaderUserName')(id=>el);
 display(' PERSON.ONE@EXAMPLE.COM  ');assert.equal(el.textContent,'person.one@example.com');
 display('bad value');assert.equal(el.textContent,'Not configured');
 const header=source.slice(source.indexOf('<div class="header-end">'),source.indexOf('</header>'));
 assert.ok(header.indexOf('id="headerUserName"')<header.indexOf('id="guideHelp"'));
});
test('completed BRs expose discovery answers and the original source file, unlinked Epics show evidence guidance',()=>{
 assert.match(ui,/View 12 Answers/);
 assert.match(ui,/details\.querySelector\('\.ba-completed-tabs \[data-tab="answers"\]'\)/);
 assert.match(ui,/downloadBRSourceDocument/);
 assert.match(ui,/Original 12 discovery answers and uploaded file are not stored in this project/);
 assert.match(ui,/Switch Project/);
 assert.match(source,/case 'downloadBRSourceDocument'/);
 assert.match(ui,/label:'Discovery Answers'/);
});
test('extension v0.3.75 is packaged consistently',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.version,'0.3.75');
 assert.equal(pkg.atgvDisplayVersion,pkg.version);
});
