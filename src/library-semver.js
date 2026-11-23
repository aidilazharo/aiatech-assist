'use strict';
// Preserve numeric and prerelease precedence after retiring the ZIP importer.
// SDLC Library versions must not be compared lexicographically.
function compareVersions(left,right){
 const parse=value=>{
  const match=String(value||'').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if(!match)throw Error('Invalid SDLC Library semantic version: '+String(value).slice(0,60));
  return {parts:match.slice(1,4).map(BigInt),pre:match[4]?match[4].split('.'):[]};
 };
 const a=parse(left),b=parse(right);
 for(let i=0;i<3;i++){if(a.parts[i]!==b.parts[i])return a.parts[i]>b.parts[i]?1:-1;}
 if(!a.pre.length||!b.pre.length)return a.pre.length===b.pre.length?0:a.pre.length?-1:1;
 for(let i=0;i<Math.min(a.pre.length,b.pre.length);i++){
  const x=a.pre[i],y=b.pre[i],xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
  if(x===y)continue;
  if(xn&&yn)return BigInt(x)>BigInt(y)?1:-1;
  if(xn!==yn)return xn?-1:1;
  return x>y?1:-1;
 }
 return Math.sign(a.pre.length-b.pre.length);
}
module.exports={compareVersions};
