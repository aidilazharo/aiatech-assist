'use strict';
const {compareVersions}=require('./library-semver');
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
function releaseBuild(tag,version){
 const match=/^v?(\d+\.\d+\.\d+)(?:-source-build\.(\d+))?$/.exec(String(tag||''));
 return match&&match[1]===version?Number(match[2]||0):null;
}
function compareInstalledRelease(installed,remote){
 const base=compareInstalledRemote(installed?.version,remote?.version);
 if(base.reason!=='same'||!remote?.tag)return base;
 const next=releaseBuild(remote.tag,base.remote),current=releaseBuild(installed?.releaseTag,base.installed);
 if(next===null)return {...base,available:false,reason:'remote-unverified'};
 // An unrecorded local release tag does not prove that the remote build is newer.
 // In particular, a Git checkout has no releaseTag; treating it as older
 // would repeatedly prompt for the same VERSION on every startup.
 if(current===null)return {...base,available:false,reason:'build-unverified'};
 return {...base,available:next>current,reason:next>current?'newer-build':next===current?'same':'older'};
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
 if(!/^[a-f0-9]{40}$/.test(String(expected.sha||''))||selected.sha!==expected.sha||active!==remote)
  throw Error('Library pull verification failed: GitHub main v'+remote+' differs from active v'+active+'. Refresh the catalog checkout, then retry Pull Library.');
 return {version:active,source:'git'};
}
module.exports={validVersion,compareInstalledRemote,compareInstalledRelease,displayLibraryUpdate,verifyActivatedPull};
