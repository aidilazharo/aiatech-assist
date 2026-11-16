'use strict';
const {compareVersions}=require('./offline-sdlc-library');
function validVersion(value){
 const v=String(value||'').trim();
 if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9][a-zA-Z0-9.-]*)?$/.test(v))return '';
 try{compareVersions(v,v);return v;}catch{return '';}
}
function compareInstalledRemote(installedVersion,remoteVersion){
 const local=validVersion(installedVersion),remote=validVersion(remoteVersion);
 if(!remote)return {available:false,reason:'remote-unverified',installed:local,remote};
 if(!local)return {available:true,reason:'not-installed',installed:local,remote};
 const difference=compareVersions(remote,local);
 return {available:difference>0,reason:difference>0?'newer':difference===0?'same':'older',installed:local,remote};
}
function displayLibraryUpdate(installedVersion,remoteVersion){
 const result=compareInstalledRemote(installedVersion,remoteVersion);
 if(result.reason==='remote-unverified')return {installed:result.installed?'v'+result.installed:'Not installed',remote:'Unavailable',message:'GitHub library version has not been verified.'};
 if(result.reason==='not-installed')return {installed:'Not installed',remote:'v'+result.remote,message:'A verified SDLC Library is available for installation.'};
 return {installed:result.installed?'v'+result.installed:'Not installed',remote:'v'+result.remote,message:result.available?'A newer verified SDLC Library version is available.':'No newer library version is available.'};
}
// After any Pull Library action, verify the active checkout really matches
// the pinned GitHub main snapshot. A successful Git command alone is not proof.
function verifyActivatedPull(expected,selected){
 const remote=validVersion(expected?.version),active=validVersion(selected?.version);
 if(!remote||!active)throw Error('Library pull finished without a verified active semantic version. Check the configured repository and local workspace.');
 if(selected.offline){
  if(compareVersions(active,remote)<=0)throw Error('Library v'+remote+' was fetched but offline v'+active+' remains active. Re-select the verified Git catalog before reporting success.');
  return {version:active,offline:true};
 }
 if(!/^[a-f0-9]{40}$/.test(String(expected.sha||''))||selected.sha!==expected.sha||active!==remote)
  throw Error('Library pull verification failed: GitHub main v'+remote+' differs from active v'+active+'. Refresh the catalog checkout, then retry Pull Library.');
 return {version:active,offline:false};
}
module.exports={validVersion,compareInstalledRemote,displayLibraryUpdate,verifyActivatedPull};
