'use strict';
// Vision questions receive rendered PNG bytes, never the hidden geometry data.
// Capability declaration, an actual image-input probe, and image-grounded
// benchmark scores are separate evidence. Nothing here executes model code.
const crypto=require('node:crypto');
const image=require('./agent-image-test');
function capability(vscode,target){
 const model=target?.kind==='vscode'?target.model:null;
 if(!model)return {status:'unsupported',reason:'This provider is not connected to VS Code image-input requests.'};
 if(typeof vscode?.LanguageModelDataPart?.image!=='function'||typeof vscode?.LanguageModelChatMessage?.User!=='function'||typeof vscode?.LanguageModelTextPart!=='function')
  return {status:'unsupported',reason:'The installed VS Code API cannot send image messages.'};
 if(model.capabilities?.imageInput===false)return {status:'unsupported',reason:'Provider declares image input unsupported.'};
 if(model.capabilities?.imageInput===true)return {status:'supported',reason:'Provider declares image support; run Verify Vision Support to confirm it.'};
 return {status:'unverified',reason:'Provider did not declare image input. Verify with a real PNG request.'};
}
async function requestWithImage(vscode,model,png,question,{timeoutMs=60000,justification='Verify image input for an ATGV visual benchmark.'}={}){
 const parts=[new vscode.LanguageModelTextPart(question),vscode.LanguageModelDataPart.image(png,'image/png')];
 const tokenSource=new vscode.CancellationTokenSource();let timer;
 try{
  timer=setTimeout(()=>tokenSource.cancel(),timeoutMs);
  const response=await model.sendRequest([vscode.LanguageModelChatMessage.User(parts)],{justification},tokenSource.token);
  let text='';for await(const fragment of response.text){text+=fragment;if(text.length>2048)throw Error('Vision response exceeded the allowed size.');}
  return text;
 }finally{if(timer)clearTimeout(timer);tokenSource.dispose();}
}
// Explicit user-initiated probe. A randomized reference prevents blindly
// treating a successful text response as proof that pixels were consumed.
async function verify(vscode,target,{timeoutMs=30000,seed}={}){
 const declared=capability(vscode,target);
 if(declared.status==='unsupported')return {...declared,verified:false};
 const challenge=image.makeRandomChallenge(seed||crypto.randomBytes(8).toString('hex'),'medium');
 const left=[...challenge.spec.shapes].sort((a,b)=>a.x-b.x)[0];
 const png=image.pngFromGeometry(challenge.spec);
 const question='Inspect ONLY the attached image. Return JSON only: {"count":number,"leftmostColor":"#RRGGBB"}. Count visible geometric shapes and give the exact hex fill of the leftmost shape. If you cannot inspect the image, reply {"count":null,"leftmostColor":null}. Do not guess.';
 const at=new Date().toISOString();
 try{
  const response=await requestWithImage(vscode,target.model,png,question,{timeoutMs});
  let value;try{value=JSON.parse(response.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{return {status:'unverified',verified:false,reason:'Model did not return a valid JSON visual observation.',checkedAt:at};}
  const count=Number(value?.count),actual=String(value?.leftmostColor||'').toLowerCase();
  if(count===challenge.spec.shapes.length&&actual===left.fill.toLowerCase())return {status:'verified',verified:true,reason:'Image request succeeded and the model identified the randomized reference.',checkedAt:at,referencePngSha256:crypto.createHash('sha256').update(png).digest('hex')};
  return {status:'unverified',verified:false,reason:'Image request completed but the model did not identify the reference accurately.',checkedAt:at};
 }catch(e){return {status:'unverified',verified:false,reason:'Vision probe failed: '+String(e?.message||e).slice(0,200),checkedAt:at};}
}
async function evaluate(vscode,target,challenge,{timeoutMs=60000,verifiedImageInput=false}={}){
 const declared=capability(vscode,target),model=target?.kind==='vscode'?target.model:null;
 if(!model||declared.status==='unsupported'&&!verifiedImageInput)
  return {status:'unsupported',reason:declared.reason};
 if(declared.status==='unverified'&&!verifiedImageInput)
  return {status:'unsupported',reason:'Image input is not declared or verified. Use Verify Vision Support first.'};
 const q=image.visualQuestions(challenge),png=image.pngFromGeometry(challenge.spec);
 const question=`Inspect the attached image and answer these two questions, using the image only. Do not guess when a shape does not exist. Return JSON only with keys "existingColor" and "missingColor"; use an exact #RRGGBB hex for an existing shape, and the string "none" when the shape does not exist.\n1. ${q.questions[0]}\n2. ${q.questions[1]}`;
 try{
  const response=await requestWithImage(vscode,model,png,question,{timeoutMs,justification:'Evaluate image-grounded answers to a reproducible agent benchmark.'});
  const verdict=image.gradeVisualAnswer(response,q);
  return {...verdict,questions:q.questions,response,referencePngSha256:crypto.createHash('sha256').update(png).digest('hex'),imageInput:true};
 }catch(e){return {status:'error',reason:String(e?.message||e).slice(0,250),questions:q.questions,imageInput:true};}
}
module.exports={capability,verify,evaluate};
