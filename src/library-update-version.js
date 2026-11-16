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
 if(!local)return {available:false,reason:'installed-unverified',installed:local,remote};
 const difference=compareVersions(remote,local);
 return {available:difference>0,reason:difference>0?'newer':difference===0?'same':'older',installed:local,remote};
}
function displayLibraryUpdate(installedVersion,remoteVersion){
 const result=compareInstalledRemote(installedVersion,remoteVersion);
 if(result.reason==='remote-unverified')return {installed:result.installed?'v'+result.installed:'Not installed',remote:'Unavailable',message:'GitHub library version has not been verified.'};
 return {installed:result.installed?'v'+result.installed:'Not installed',remote:'v'+result.remote,message:result.available?'A newer verified SDLC Library version is available.':'No newer library version is available.'};
}
module.exports={validVersion,compareInstalledRemote,displayLibraryUpdate};
