'use strict';
// Lightweight credential-free HEAD probes measure responsiveness, not bulk download speed.
const ENDPOINTS=Object.freeze(['https://api.github.com/','https://id.atlassian.com/']);
const SLOW_MS=2000,TIMEOUT_MS=5000,CACHE_MS=30000;
async function sampleEndpoint(url,{request=globalThis.fetch,now=()=>performance.now(),timeout=TIMEOUT_MS}={}){
 const start=now();
 try{
  // Any HTTP response establishes reachability, including 403 or redirect.
  const response=await request(url,{method:'HEAD',redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(timeout)});
  if(!response||!Number.isInteger(response.status)||response.status<100)throw Error('No HTTP response');
  return {reachable:true,ms:Math.max(0,Math.round(now()-start))};
 }catch{return {reachable:false,ms:null};}
}
function classify(samples){
 const reachable=samples.filter(x=>x.reachable);
 if(!reachable.length)return {state:'unreachable'};
 if(reachable.length!==samples.length)return {state:'degraded'};
 if(reachable.every(x=>x.ms>=SLOW_MS))return {state:'slow'};
 if(reachable.some(x=>x.ms>=SLOW_MS))return {state:'degraded'};
 return {state:'online'};
}
function createMonitor({request=globalThis.fetch,clock=()=>Date.now(),now=()=>performance.now()}={}){
 let cached=null,checkedAt=0,pending=null;
 return async function check(){
  if(pending)return pending;
  if(cached&&clock()-checkedAt<CACHE_MS)return cached;
  pending=Promise.all(ENDPOINTS.map(url=>sampleEndpoint(url,{request,now})))
   .then(samples=>{cached=classify(samples);checkedAt=clock();return cached;})
   .finally(()=>{pending=null;});
  return pending;
 };
}
module.exports={sampleEndpoint,classify,createMonitor,ENDPOINTS,SLOW_MS,TIMEOUT_MS,CACHE_MS};
