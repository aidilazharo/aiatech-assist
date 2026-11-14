'use strict';
// Trusted renderer for image-only agent benchmarks. Model output is DATA (JSON),
// never JavaScript, HTML, or an SVG string to evaluate/execute.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const PALETTE=Object.freeze({blue:'#2563eb',red:'#dc2626',green:'#16a34a',yellow:'#eab308',orange:'#f97316',purple:'#9333ea',black:'#000000',white:'#ffffff',gray:'#808080',grey:'#808080'});
const ALLOWED=new Set(['circle','square','rectangle','triangle']);
const IMAGE_ONLY_PROMPT='Describe ONE simple geometric image as strict JSON: {"shape":"circle|square|rectangle|triangle", "color":"blue|red|green|yellow|orange|purple|black|white|gray|#RRGGBB", "background":"white|black|transparent|#RRGGBB"}. Follow the user shape, color and background precisely. Return JSON only, no markdown, code, SVG, comments or explanation.';
// Versioned, seed-reproducible geometry challenges. All generated/model values
// remain inert data; rendering supports a fixed allowlist of SVG primitives.
const CHALLENGE_SHAPES=Object.freeze(['circle','square','rectangle','triangle','hexagon','diamond','ellipse']);
const CHALLENGE_COLORS=Object.freeze(['#ff0000','#0000ff','#008000','#ffa500','#800080','#00ffff','#ff00ff','#f59e0b','#2563eb','#111827']);
const IMAGE_GEOMETRY_PROMPT='Reproduce the requested geometric image as JSON only. Return {"background":"#RRGGBB or transparent","shapes":[{"shape":"circle|square|rectangle|triangle|hexagon|diamond|ellipse","fill":"#RRGGBB","x":0-256,"y":0-256,"width":4-256,"height":4-256,"rotationDeg":0-359}]}. Coordinates are shape center, dimensions are unrotated pixel dimensions on a 256x256 canvas, rotation clockwise in degrees. Preserve shape count, dimensions, positions, rotations, and exact colors. Return no markdown, SVG, executable code, or explanation.';
function challengeSeed(seed){const value=String(seed||'').trim();if(!/^[a-zA-Z0-9_-]{6,48}$/.test(value))throw Error('Invalid challenge seed. Use 6-48 letters, digits, - or _.');return value;}
function geometrySpec(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.shapes)||value.shapes.length<1||value.shapes.length>3)throw Error('Geometry must contain 1-3 shapes.');
 const background=color(value.background??'transparent',{background:true});
 const shapes=value.shapes.map(s=>{
  if(!s||typeof s!=='object'||!CHALLENGE_SHAPES.includes(s.shape))throw Error('Unsupported geometric shape.');
  const out={shape:s.shape,fill:color(s.fill),x:Number(s.x),y:Number(s.y),width:Number(s.width),height:Number(s.height),rotationDeg:Number(s.rotationDeg)};
  if(![out.x,out.y,out.width,out.height,out.rotationDeg].every(Number.isInteger)||out.x<0||out.x>256||out.y<0||out.y>256||out.width<4||out.width>256||out.height<4||out.height>256||out.rotationDeg<0||out.rotationDeg>=360)throw Error('Invalid geometry coordinates, size or rotation.');
  return out;
 });
 return {background,shapes};
}
function makeRandomChallenge(seed=crypto.randomBytes(8).toString('hex'),difficulty='medium'){
 seed=challengeSeed(seed);
 if(!['easy','medium','hard'].includes(difficulty))throw Error('Unsupported challenge difficulty.');
 const data=crypto.createHash('sha256').update(seed+'|'+difficulty).digest();let cursor=0;
 const next=()=>{if(cursor>=data.length)cursor=0;return data[cursor++];};
 const count={easy:1,medium:2,hard:3}[difficulty];
 const shapes=[];
 for(let i=0;i<count;i++){
  const shape=CHALLENGE_SHAPES[next()%CHALLENGE_SHAPES.length],fill=CHALLENGE_COLORS[next()%CHALLENGE_COLORS.length];
  const sector=count===1?128:Math.round(256*(i+.5)/count);
  const x=Math.max(38,Math.min(218,sector+(next()%31)-15));
  const y=Math.max(50,Math.min(206,95+(next()%66)));
  const width=40+(next()%31),height=shape==='square'||shape==='circle'||shape==='hexagon'||shape==='diamond'?width:40+(next()%31);
  const rotationDeg=(next()%24)*15;
  shapes.push({shape,fill,x,y,width,height,rotationDeg});
 }
 const background=next()%4===0?'none':'#ffffff';
 const spec=geometrySpec({background,shapes});
 const id=`random-${difficulty}-${seed}`;
 const detail=spec.shapes.map((s,i)=>`${i+1}. ${s.shape}, fill ${s.fill}, center (${s.x}, ${s.y}), width ${s.width}, height ${s.height}, clockwise rotation ${s.rotationDeg} degrees`).join('; ');
 const prompt=`On a 256x256 canvas with ${background==='none'?'transparent':background} background, reproduce exactly ${count} geometric shape${count===1?'':'s'}: ${detail}. Use exact #RRGGBB fills, pixel positions, dimensions and angles. No additional objects or text.`;
 return {id,label:`Random ${difficulty} · ${seed}`,seed,difficulty,prompt,spec,svg:svgFromGeometry(spec)};
}
function geometryPrimitive(s){
 const t=`transform="translate(${s.x} ${s.y}) rotate(${s.rotationDeg})"`,w=s.width/2,h=s.height/2;
 let node;
 if(s.shape==='circle'||s.shape==='ellipse')node=`<ellipse cx="0" cy="0" rx="${w}" ry="${h}" fill="${s.fill}"/>`;
 else if(s.shape==='square'||s.shape==='rectangle')node=`<rect x="${-w}" y="${-h}" width="${s.width}" height="${s.height}" fill="${s.fill}"/>`;
 else if(s.shape==='triangle')node=`<polygon points="0,${-h} ${w},${h} ${-w},${h}" fill="${s.fill}"/>`;
 else if(s.shape==='diamond')node=`<polygon points="0,${-h} ${w},0 0,${h} ${-w},0" fill="${s.fill}"/>`;
 else node=`<polygon points="${-w},0 ${-w/2},${-h} ${w/2},${-h} ${w},0 ${w/2},${h} ${-w/2},${h}" fill="${s.fill}"/>`;
 return `  <g ${t}>${node}</g>`;
}
function svgFromGeometry(input){const spec=geometrySpec(input);const bg=spec.background==='none'?'':`  <rect width="256" height="256" fill="${spec.background}"/>\n`;return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="random geometry">\n${bg}${spec.shapes.map(geometryPrimitive).join('\n')}\n</svg>`;}
function sampledColor(spec,x,y){
 let current=spec.background;
 for(const s of spec.shapes){
  const a=s.rotationDeg*Math.PI/180,dx=x-s.x,dy=y-s.y,c=Math.cos(a),sn=Math.sin(a);
  const px=c*dx+sn*dy,py=-sn*dx+c*dy,u=px/(s.width/2),v=py/(s.height/2);
  let inside=false;
  if(s.shape==='circle'||s.shape==='ellipse')inside=u*u+v*v<=1;
  else if(s.shape==='square'||s.shape==='rectangle')inside=Math.abs(u)<=1&&Math.abs(v)<=1;
  else if(s.shape==='triangle')inside=v>=-1&&v<=1&&Math.abs(u)<=(v+1)/2;
  else if(s.shape==='diamond')inside=Math.abs(u)+Math.abs(v)<=1;
  else inside=Math.abs(u)<=1&&Math.abs(v)<=1&&Math.abs(u)<=1-(Math.max(0,Math.abs(v)-0)*.5);
  if(inside)current=s.fill;
 }
 return current;
}
function compareChallenge(candidate,reference){
 const actual=geometrySpec(candidate),expected=geometrySpec(reference.spec||reference);
 let match=0,intersection=0,union=0;const grid=96;
 for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
  const px=(x+.5)*256/grid,py=(y+.5)*256/grid,a=sampledColor(expected,px,py),b=sampledColor(actual,px,py);
  if(a===b)match++;
  const ae=a!==expected.background,be=b!==actual.background;
  if(ae||be)union++;
  if(ae&&be)intersection++;
 }
 const max=Math.max(expected.shapes.length,actual.shapes.length);
 const shapeMatch=expected.shapes.reduce((n,s,i)=>n+(actual.shapes[i]?.shape===s.shape?1:0),0)/max;
 const rotationMatch=expected.shapes.reduce((n,s,i)=>n+(actual.shapes[i]?.rotationDeg===s.rotationDeg?1:0),0)/max;
 const colorMatch=expected.shapes.reduce((n,s,i)=>n+(actual.shapes[i]?.fill===s.fill?1:0),0)/max;
 const backgroundMatch=expected.background===actual.background;
 const overlap=union?intersection/union:1;
 const score=Math.round(100*(.45*overlap+.15*shapeMatch+.1*rotationMatch+.2*colorMatch+.1*Number(backgroundMatch)));
 return {score,shapeOverlap:Math.round(overlap*100),pixelMatch:Math.round(match*100/(grid*grid)),foregroundMatch:colorMatch===1,backgroundMatch,rotationMatch:rotationMatch===1,objectCountMatch:expected.shapes.length===actual.shapes.length,method:'geometry-iou-45_shape-15_rotation-10_color-20_background-10'};
}

// Render a deterministic image for visual grounding. Vision tests receive ONLY
// this PNG and the questions; the model never receives the reference shape JSON.
function pngFromGeometry(input){
 const spec=geometrySpec(input),w=256,h=256,raw=Buffer.alloc(h*(w*4+1));
 for(let y=0;y<h;y++){
  const start=y*(w*4+1);raw[start]=0;
  for(let x=0;x<w;x++){
   const hex=sampledColor(spec,x+.5,y+.5);const off=start+1+x*4;
   if(hex==='none'){raw[off+3]=0;continue;}
   raw[off]=parseInt(hex.slice(1,3),16);raw[off+1]=parseInt(hex.slice(3,5),16);
   raw[off+2]=parseInt(hex.slice(5,7),16);raw[off+3]=255;
  }
 }
 const table=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const name=Buffer.from(type,'ascii'),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([len,name,data,sum]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function visualQuestions(challenge){
 const spec=geometrySpec(challenge.spec),sorted=[...spec.shapes].sort((a,b)=>a.x-b.x||a.y-b.y);
 const expected=sorted[0].fill;
 const labels=['first','second','third','fourth','fifth'];
 const absent=labels[spec.shapes.length]||`number ${spec.shapes.length+1}`;
 return {questions:[`What is the exact #RRGGBB fill color of the leftmost shape?`,`What is the fill color of the ${absent} shape, ordered from left to right?`],expected:{existingColor:expected,missingColor:'none'},kind:'grounded-and-false-premise'};
}
function gradeVisualAnswer(response,questions){
 const clean=String(response||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 let value;try{value=JSON.parse(clean);}catch{return {status:'fail',score:0,valid:false,response:clean.slice(0,500),reason:'Response was not valid JSON.'};}
 if(!value||typeof value!=='object'||Array.isArray(value))return {status:'fail',score:0,valid:false,reason:'Expected two JSON answers.'};
 const existing=String(value.existingColor||'').trim().toLowerCase();
 const missing=String(value.missingColor||'').trim().toLowerCase();
 const grounded=existing===questions.expected.existingColor;
 const rejected=missing==='none'||missing==='no such shape'||missing==='not present'||missing==='does not exist';
 return {status:grounded&&rejected?'pass':'fail',score:Number(grounded)*50+Number(rejected)*50,valid:true,groundedAnswer:grounded,falsePremiseRejected:rejected,answers:{existingColor:existing,missingColor:missing},expected:questions.expected};
}
// Edited source is never executed. Only a canonical, allowlisted SVG specification
// is accepted. A color/angle/position edit is turned back into safe inert geometry.
function replaySpecFromEditedSvg(source,original){
 if(typeof source!=='string'||source.length>12000)throw Error('SVG draft exceeds the safe size limit.');
 const current=svgFromSpec(original),trimmed=source.trim();
 if(trimmed===current.trim())return original;
 if(!Array.isArray(original?.shapes))throw Error('Legacy SVG supports exact source replay only.');
 const groups=[...trimmed.matchAll(/<g transform="translate\((\d+) (\d+)\) rotate\((\d+)\)">\s*([\s\S]*?)\s*<\/g>/g)];
 if(groups.length!==original.shapes.length)throw Error('Expected the original number of allowlisted SVG shapes.');
 const shapes=original.shapes.map((shape,i)=>{
  const g=groups[i],fill=g[4].match(/fill="(#[0-9a-fA-F]{6})"/);
  if(!fill)throw Error('Each SVG shape requires an exact #RRGGBB fill.');
  return {...shape,x:Number(g[1]),y:Number(g[2]),rotationDeg:Number(g[3]),fill:fill[1].toLowerCase()};
 });
 const spec=geometrySpec({...original,shapes});
 // Normalize only inter-tag whitespace, not tag attributes or content.
 const normalize=x=>x.trim().replace(/>\s+</g,'><');
 if(normalize(svgFromSpec(spec))!==normalize(trimmed))throw Error('Edited SVG must use only the approved shapes and attributes.');
 return spec;
}
function color(value,{background=false}={}){
 const v=String(value??'').trim().toLowerCase();
 if(background&&(v==='transparent'||v==='none'))return 'none';
 if(Object.hasOwn(PALETTE,v))return PALETTE[v];
 if(/^#[0-9a-f]{6}$/.test(v))return v;
 throw Error('Model returned an unsupported '+(background?'background':'color')+'. Use a named color or #RRGGBB.');
}
function parseSpec(text){
 if(typeof text!=='string'||text.length>4096)throw Error('Invalid AI image response size.');
 const clean=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 let value;try{value=JSON.parse(clean);}catch{throw Error('AI did not return valid JSON for a reproducible image.');}
 if(value&&typeof value==='object'&&Array.isArray(value.shapes))return geometrySpec(value);
 if(!value||Array.isArray(value)||typeof value!=='object'||!ALLOWED.has(value.shape))throw Error('AI returned an unsupported shape.');
 // Only whitelisted fields enter rendering. Ignore any model-supplied code.
 const result={shape:value.shape,color:color(value.color),background:color(value.background??'transparent',{background:true})};
 return result;
}
function svgFromSpec(spec){
 if(spec&&Array.isArray(spec.shapes))return svgFromGeometry(spec);
 if(!spec||!ALLOWED.has(spec.shape)||!/^#[0-9a-f]{6}$/.test(spec.color)||!(spec.background==='none'||/^#[0-9a-f]{6}$/.test(spec.background)))throw Error('Invalid sanitized image specification.');
 const bg=spec.background==='none'?'':`  <rect width="256" height="256" fill="${spec.background}"/>\n`;
 const shapes={circle:`<circle cx="128" cy="128" r="73" fill="${spec.color}"/>`,square:`<rect x="55" y="55" width="146" height="146" fill="${spec.color}"/>`,rectangle:`<rect x="42" y="69" width="172" height="118" fill="${spec.color}"/>`,triangle:`<polygon points="128,44 212,202 44,202" fill="${spec.color}"/>`};
 return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="${spec.shape}">\n${bg}  ${shapes[spec.shape]}\n</svg>`;
}
// Ten deterministic, copyright-free SVG references with explicit web hex colors.
// Geometry, score and rendered reference share the same trusted specification.
const REFERENCE_CASES=Object.freeze([
 {id:'blue-circle',label:'01 · Blue circle',shape:'circle',color:'#0000ff',background:'none'},
 {id:'red-square',label:'02 · Red square',shape:'square',color:'#ff0000',background:'#ffffff'},
 {id:'green-triangle',label:'03 · Green triangle',shape:'triangle',color:'#008000',background:'none'},
 {id:'yellow-rectangle',label:'04 · Yellow rectangle',shape:'rectangle',color:'#ffff00',background:'#000000'},
 {id:'purple-circle',label:'05 · Purple circle',shape:'circle',color:'#800080',background:'#ffffff'},
 {id:'orange-square',label:'06 · Orange square',shape:'square',color:'#ffa500',background:'none'},
 {id:'black-triangle',label:'07 · Black triangle',shape:'triangle',color:'#000000',background:'#ffffff'},
 {id:'cyan-rectangle',label:'08 · Cyan rectangle',shape:'rectangle',color:'#00ffff',background:'#ffffff'},
 {id:'magenta-circle',label:'09 · Magenta circle',shape:'circle',color:'#ff00ff',background:'#000000'},
 {id:'gray-square',label:'10 · Gray square',shape:'square',color:'#808080',background:'#ffffff'}
].map(item=>Object.freeze(item)));
function referenceCase(id){return REFERENCE_CASES.find(x=>x.id===id)||null;}
function referencePrompt(ref){
 if(!ref)throw Error('Unknown reference image test.');
 return `Create exactly one centered ${ref.shape}, fill ${ref.color}, on ${ref.background==='none'?'a transparent background':'background '+ref.background}. Use exact hex colors, one geometric shape, and no other objects or text.`;
}
// Sample the same ideal geometry encoded by svgFromSpec. No remote image/code execution.
function occupied(shape,x,y){
 if(shape==='circle')return (x-128)**2+(y-128)**2<=73**2;
 if(shape==='square')return x>=55&&x<=201&&y>=55&&y<=201;
 if(shape==='rectangle')return x>=42&&x<=214&&y>=69&&y<=187;
 if(shape==='triangle')return y>=44&&y<=202&&Math.abs(x-128)<=(y-44)*84/158;
 return false;
}
function compareReference(spec,referenceId){
 const ref=referenceCase(referenceId);if(!ref)throw Error('Unknown reference image test.');
 // Mandatory sanitization applies to BOTH generated and expected specifications.
 svgFromSpec(spec);svgFromSpec(ref);
 let intersection=0,union=0,matching=0;
 const GRID=128;
 for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
  const xx=2*x+1,yy=2*y+1,a=occupied(ref.shape,xx,yy),b=occupied(spec.shape,xx,yy);
  if(a||b)union++;
  if(a&&b)intersection++;
  const expected=a?ref.color:ref.background,actual=b?spec.color:spec.background;
  if(expected===actual)matching++;
 }
 const overlap=union?intersection/union:1;
 const colorMatch=ref.color===spec.color?1:0;
 const backgroundMatch=ref.background===spec.background?1:0;
 // 60% geometric mask overlap, 25% exact foreground hex, 15% exact background.
 const score=Math.round(100*(.6*overlap+.25*colorMatch+.15*backgroundMatch));
 return {score,shapeOverlap:Math.round(overlap*100),foregroundMatch:!!colorMatch,backgroundMatch:!!backgroundMatch,pixelMatch:Math.round(100*matching/(GRID*GRID)),method:'shape-mask-iou-60_color-exact-25_background-exact-15',referenceId,referenceSpec:{shape:ref.shape,color:ref.color,background:ref.background}};
}
// The overall image-agent benchmark has TWO independently verifiable parts:
// geometry replication and image-grounded question answering. Configuration
// checks and human Pass/Fail are evidence/gates, not extra numeric points.
// Do not turn a partial evaluation or an unsupported model into a 100% score.
function overallBenchmarkScore(result){
 const geometry=result?.accuracy?.score;
 const vision=result?.vision;
 const geometryValid=Number.isFinite(geometry)&&geometry>=0&&geometry<=100;
 const visionValid=(vision?.status==='pass'||vision?.status==='fail')&&
  Number.isFinite(vision.score)&&vision.score>=0&&vision.score<=100;
 return {
  status:geometryValid&&visionValid?'complete':'incomplete',
  score:geometryValid&&visionValid?Math.round((geometry+vision.score)/2):null,
  geometryScore:geometryValid?geometry:null,
  visualScore:visionValid?vision.score:null,
  completedComponents:Number(geometryValid)+Number(visionValid),
  totalComponents:2,
  method:'geometry-50_visual-grounding-50',
  ...(vision?.status==='unsupported'?{reason:vision.reason||'Vision input unsupported'}:{})
 };
}
function traceChecks(result){
 const ok=Boolean(result&&result.svg&&result.model&&result.completedAt);
 return [
  {label:'Context',status:!ok?'not-tested':result.verdict==='pass'?'pass':result.verdict==='fail'?'fail':'not-tested',detail:!ok?'No output evidence.':result.verdict==='pass'?'User confirmed the visual matched the prompt.':result.verdict==='fail'?'User rejected the generated image.':'Awaiting user visual Pass/Fail; prompt was sent to model.'},
  {label:'Tools',status:ok?'pass':'not-tested',detail:ok?'Allowed text model produced JSON; trusted SVG renderer created image. No model-generated code was executed.':'No verified renderer execution.'},
  {label:'Loop',status:ok?'pass':'not-tested',detail:ok?`One bounded generation attempt completed in ${result.durationMs} ms. Refresh creates a new run.`:'No completed model execution trace.'},
  {label:'Governance',status:ok?'pass':'not-tested',detail:ok?'Whitelisted shapes/colors; image-only SVG artifact; no file writes or Git permissions granted to the model.':'No completed permissions trace.'}
 ];
}
function storageFile(storage){return path.join(storage,'agent-image-tests','history.json');}
async function history(storage){
 const file=storageFile(storage);let entries=[];
 try{const stat=await fs.lstat(file);if(stat.isSymbolicLink()||stat.size>3*1024*1024)throw Error('Unsafe image test history.');const value=JSON.parse(await fs.readFile(file,'utf8'));if(Array.isArray(value))entries=value;}catch(e){if(e.code!=='ENOENT')throw e;}
 return entries.filter(x=>x&&typeof x==='object'&&typeof x.id==='string').slice(0,100);
}
async function persist(storage,entries){
 const file=storageFile(storage);await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';
 try{await fs.writeFile(tmp,JSON.stringify(entries.slice(0,100),null,2),{flag:'wx',mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
}
async function clearHistory(storage,agentPath){
 const entries=await history(storage);const kept=entries.filter(x=>x.agentPath!==agentPath);await persist(storage,kept);return entries.length-kept.length;
}
async function record(storage,run){const entries=await history(storage);entries.unshift(run);await persist(storage,entries);return run;}
async function replay(storage,id,agentPath,svgDraft){
 if(typeof id!=='string'||id.length>80)throw Error('Invalid result ID.');
 const entries=await history(storage),one=entries.find(x=>x.id===id&&x.agentPath===agentPath);
 if(!one||!one.svg)throw Error('Saved image test result not found.');
 // Re-run the catalog-independent, trusted renderer on the sanitized spec;
 // the exact output must equal the originally recorded source bytes.
 const original=svgFromSpec(one.spec);
 if(original!==one.svg)throw Error('Recorded image source no longer matches trusted geometry.');
 const draft=svgDraft===undefined?one.svg:svgDraft;
 const spec=replaySpecFromEditedSvg(draft,one.spec);
 const svg=svgFromSpec(spec);
 const identical=svg===one.svg;
 one.codeReplay={matched:identical,edited:!identical,at:new Date().toISOString(),sha256:crypto.createHash('sha256').update(svg).digest('hex'),svg};
 await persist(storage,entries);
 return {result:one,svg,identical};
}
async function verdict(storage,id,value){if(!['pass','fail'].includes(value)||typeof id!=='string'||id.length>80)throw Error('Invalid image verdict.');const entries=await history(storage),one=entries.find(x=>x.id===id);if(!one)throw Error('Image test result is missing.');if(!one.svg)throw Error('Only completed images can be reviewed.');one.verdict=value;one.reviewedAt=new Date().toISOString();await persist(storage,entries);return one;}
function makeRecord({prompt,agentPath,model,target,spec,startedAt,durationMs,referenceId,challenge,vision}){
 const svg=svgFromSpec(spec);
 const accuracy=challenge?compareChallenge(spec,challenge):referenceId?compareReference(spec,referenceId):null;
 const overallBenchmark=overallBenchmarkScore({accuracy,vision});
 return {overallBenchmark,id:crypto.randomUUID(),referenceId:challenge?.id||referenceId||null,challenge:challenge?{seed:challenge.seed,difficulty:challenge.difficulty,spec:challenge.spec}:null,referenceSvg:challenge?challenge.svg:accuracy?svgFromSpec(accuracy.referenceSpec):null,accuracy,kind:'svg-image-benchmark',prompt,agentPath,model,modelId:target.model?.id||target.modelId||null,provider:target.kind,vendor:target.vendor||'',startedAt,completedAt:new Date().toISOString(),durationMs,spec,svg,verdict:'pending',tool:'trusted-svg-renderer',codeStack:'svg',attempts:1,vision:vision||{status:'unsupported',reason:'No vision-capable model was available.'}};
}
module.exports={overallBenchmarkScore,IMAGE_ONLY_PROMPT,IMAGE_GEOMETRY_PROMPT,pngFromGeometry,visualQuestions,gradeVisualAnswer,replaySpecFromEditedSvg,clearHistory,makeRandomChallenge,compareChallenge,geometrySpec,svgFromGeometry,REFERENCE_CASES,referenceCase,referencePrompt,compareReference,parseSpec,svgFromSpec,traceChecks,record,history,replay,verdict,makeRecord};
