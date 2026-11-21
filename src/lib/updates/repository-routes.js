'use strict';
// Select trusted source and release repositories from the configured GitHub owner.
// A distribution mirror is never substituted for the owner's authoritative source.
const startup=require('../startup-setup');
function forOwner(value){
 const owner=String(value||'').trim().toLowerCase().replace(/^https:\/\/(?:www\.)?github\.com\//,'').replace(/^github\.com\//,'').replace(/\/$/,'');
 if(!/^[a-z0-9-]{1,39}$/.test(owner))return null;
 const sources=startup.SOURCE_REPOS[owner];
 if(!sources)return null;
 return Object.freeze({
  owner,
  extensionSource:sources.extension,
  librarySource:sources.library,
  extensionReleases:startup.RELEASES.extension,
  libraryReleases:startup.RELEASES.library
 });
}
function asRepository(url){
 const parsed=startup.githubRepo(url);
 return parsed.owner+'/'+parsed.repo;
}
module.exports={forOwner,asRepository};
