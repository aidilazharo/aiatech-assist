'use strict';
// Only source identities, not unrelated BR register revisions, determine
// whether a long-running AI mapping is still authorized to commit.
const crypto=require('node:crypto');

function snapshot(register){
 const sources=(Array.isArray(register?.sourceDocuments)?register.sourceDocuments:[])
  .map(source=>({
   digest:String(source.digest||''),
   name:String(source.name||''),
   byteDigest:String(source.byteDigest||''),
   storedName:String(source.storedName||''),
   characters:Number(source.characters||0)
  })).sort((a,b)=>a.digest.localeCompare(b.digest));
 const state={sources,epoch:Number(register?.importEpoch||0),
  processedSources:Array.isArray(register?.processedSources)?[...register.processedSources]:[]};
 const overrides=sources.map(source=>register.baArtifactEdits?.[source.digest]?.source?.digest||'');
 if(overrides.some(Boolean))state.overrides=overrides;
 const identity=crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
 return {schema:1,identity,...state};
}

function assertUnchanged(expected,current){
 if(expected?.schema!==1||!(/^[a-f0-9]{64}$/.test(String(expected.identity||''))))
  throw Error('Source selection snapshot is missing. Mapping cannot be saved.');
 if(snapshot(current).identity!==expected.identity)
  throw Error('The uploaded source selection changed during AI mapping. Saved AI checkpoints were preserved; refresh the source documents before resuming.');
 return true;
}

function sameDigests(a,b){
 return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((item,i)=>item===b[i]);
}
// Historical v0.4.36 resume markers carried a BR register revision. Reuse
// their authenticated, text/model-bound checkpoints when the same documents
// are selected; subsequent markers use stable source identity instead.
function resumeRevision(register,digests,marker){
 const current=snapshot(register);
 if(sameDigests(marker?.digests,digests)&&
    (!marker.sourceIdentity||marker.sourceIdentity===current.identity)&&
    typeof marker.revision==='string'&&marker.revision.length>0&&marker.revision.length<=128)
  return marker.revision;
 return crypto.createHash('sha256').update(current.identity+'|'+JSON.stringify(digests)).digest('hex');
}
module.exports={snapshot,assertUnchanged,sameDigests,resumeRevision};
