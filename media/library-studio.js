'use strict';
// Local-only editing; all filesystem and GitHub operations are mediated by the extension.
(() => {
 const $ = id => document.getElementById(id);
 const state = {items:[],selected:null,query:'',busy:false,syncing:false,editing:false,total:0,prUrl:'',validatedContent:null,pendingValidation:null,validationId:0,markers:[],harnessRequestId:0,harnessPending:null,harnessProgressEpoch:0,imageRunning:false,imageRequestId:0,imageResults:[],imageCurrent:null,imageModelList:[],configuredVision:null,visionProbePending:false,visionProbeId:0,staticChecks:null,imageChecks:[],relatedRoot:'',relatedFiles:[],replayRunning:false,imageCodeLanguage:'svg',codeDrafts:new Map(),challenge:null,challengePending:false,qualityRunning:false,qualityRequestId:0,qualityResults:[],qualityCurrent:null,overallView:'image'};
 const editor=$('libraryEditor'),category=$('libraryCategory'),scope=$('libraryScope'),search=$('librarySearch');
 let requiresLibraryInstall=document.querySelector?.('meta[name=\"atgv-vendor-libs\"]')?.content==='missing';
 if(!editor||!category||!scope||!search)return;
 // This is an approved, packaged, offline CodeMirror asset. Never evaluate
 // JavaScript from editable catalog files or from a remote CDN.
 const cm=typeof window.CodeMirror==='function'?window.CodeMirror.fromTextArea(editor,{
  mode:'text/plain',lineNumbers:true,lineWrapping:true,readOnly:true,
  indentUnit:2,tabSize:2,indentWithTabs:false,matchBrackets:true,
  autoCloseBrackets:true,viewportMargin:10
 }):null;
 const status=$('libraryEditorRuntime');
 if(status)status.textContent=cm?'CodeMirror ready':'CodeMirror unavailable';
 const content=()=>cm?cm.getValue():editor.value;
 const putContent=value=>{if(cm)cm.setValue(value);else editor.value=value;};
 const focusEditor=()=>cm?cm.focus():editor.focus();
 const modeFor=path=>{
  if(/\.json$/i.test(path))return {label:'JSON',mode:{name:'javascript',json:true}};
  if(/\.ya?ml$/i.test(path))return {label:'YAML',mode:'yaml'};
  if(/\.(?:mjs|js|jsx)$/i.test(path))return {label:'JavaScript',mode:'javascript'};
  if(/\.(?:ts|tsx)$/i.test(path))return {label:'TypeScript',mode:{name:'javascript',typescript:true}};
  if(/\.md$/i.test(path))return {label:'Markdown',mode:'markdown'};
  if(/\.css$/i.test(path))return {label:'CSS',mode:'css'};
  if(/\.html$/i.test(path))return {label:'HTML',mode:'htmlmixed'};
  if(/\.xml$/i.test(path))return {label:'XML',mode:'xml'};
  if(/\.(?:cs|java)$/i.test(path))return {label:'Source',mode:'text/x-java'};
  return {label:'Plain text',mode:'text/plain'};
 };
 const editorLanguage=relative=>{const x=modeFor(relative||'');$('libraryLanguageBadge').textContent=x.label;if(cm)cm.setOption('mode',x.mode);};
 function showDiagnostics(messages,success=false){
  const node=$('libraryDiagnostics');if(!node)return;
  if(cm){for(const item of state.markers)cm.removeLineClass(item,'background','cm-atgv-error');}
  state.markers=[];
  const entries=Array.isArray(messages)?messages:[];
  node.textContent=entries.length?entries.map(d=>`${d.severity==='error'?'Error':'Warning'}${d.line?' (line '+d.line+(d.column?', col '+d.column:'')+')':''}: ${d.message}`).join('\n'):(success?'Syntax and resource validation passed.':'');
  node.className='library-diagnostics '+(entries.some(d=>d.severity==='error')?'error':entries.length?'warning':success?'success':'hidden');
  if(cm)for(const d of entries.filter(x=>x.severity==='error'&&x.line>0)){
   const n=Math.min(cm.lineCount()-1,d.line-1);
   if(n>=0){cm.addLineClass(n,'background','cm-atgv-error');state.markers.push(n);}
  }
 }
 const invalidate=()=>{state.validatedContent=null;state.pendingValidation=null;showDiagnostics([],false);};

 const setStatus=(message,error=false)=>{
  const node=$('libraryActionStatus');node.textContent=message||'';node.className='test-status '+(error?'error':'muted');
 };
 const isDirty=()=>!!state.selected&&state.editing&&content()!==state.selected.content;
 const isHarnessResource=path=>/^ai-harness\/(?:agents\/[^/]+\.json|workflows\/[^/]+\.json|manifest\.json)$/.test(path||'');
 function showRelatedTabs(){
  const host=$('libraryRelatedTabs');if(!host)return;host.replaceChildren();
  const files=state.relatedFiles||[];
  host.classList.toggle('hidden',!files.length);
  showRelationDiagram();
  if(!files.length)return;
  // A single accessible dropdown replaces the horizontally scrolling tabstrip.
  const select=document.createElement('select');select.id='libraryRelatedFile';
  select.setAttribute('aria-label','Related Agent, Workflow and Skill files');
  select.title='Open a related catalog file in the CodeMirror editor';
  // A related file is a different document from the primary selected agent.
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='-- Please select --';select.append(placeholder);
  for(const file of files.filter(f=>f.path!==state.relatedRoot)){
   const option=document.createElement('option');option.value=file.path;
   option.textContent=resourceTitle(file.path);option.title=file.path;select.append(option);
  }
  select.value=files.some(file=>file.path===state.selected?.path&&file.path!==state.relatedRoot)?state.selected.path:'';
  select.addEventListener('change',()=>{
   const path=select.value;
   if(!state.selected||!path||path===state.selected.path)return;
   if(isDirty()||state.editing||state.busy){
    select.value=state.selected.path;
    return setStatus('Save or Cancel edits before switching files.',true);
   }
   state.busy=true;showActions();
   send('libraryRead',{path,scope:scope.value,rootPath:state.relatedRoot});
  });
  host.append(select);
 }
 // Show user-facing resource names; keep the exact path visible in metadata.
 function readableIdentifier(value){
  const words=String(value||'').replace(/\.[a-z0-9]+$/i,'').replace(/[-_]+/g,' ').trim();
  const acronyms={ba:'Business',sa:'Solution',uiux:'UI/UX',ux:'UX',tdd:'TDD',api:'API',ai:'AI',ml:'ML',pr:'PR',json:'JSON',sdlc:'SDLC',qa:'QA',uat:'UAT',db:'Database',br:'BR',git:'Git',http:'HTTP',sql:'SQL'};
  return words.split(/\s+/).map((word,i)=>acronyms[word.toLowerCase()]||word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
 }
 function resourceTitle(path){
  path=String(path||'');
  const parts=path.split('/'),name=parts.at(-1)||'',folder=parts.at(-2)||'';
  if(/^ai-harness\/agents\/[^/]+\.json$/.test(path))return readableIdentifier(name)+' Agent';
  if(/^ai-harness\/workflows\/[^/]+\.json$/.test(path))return readableIdentifier(name)+' Workflow';
  if(path==='ai-harness/manifest.json')return 'AI Harness Manifest';
  if(/^roles\/[^/]+\/SKILL\.md$/.test(path))return readableIdentifier(folder)+' Role Guidance';
  if(/^ai-harness\/skills\/[^/]+\/SKILL\.md$/.test(path))return readableIdentifier(folder)+' — AI Instructions';
  if(/^ai-harness\/skills\/[^/]+\/skill\.json$/.test(path))return readableIdentifier(folder)+' — Skill Definition';
  if(path==='ai-harness/policies/guardrails.json')return 'Harness Guardrails';
  if(path==='ai-harness/tools/registry.json')return 'Tool Registry';
  if(path==='ai-harness/context/selection.json')return 'Context Selection Rules';
  if(name==='SKILL.md')return readableIdentifier(folder)+' Instructions';
  if(name==='stack.json')return readableIdentifier(folder)+' Technology Stack';
  return readableIdentifier(name);
 }
 const relation={scale:1,x:12,y:12,width:1280,height:580,positions:new Map(),root:'',world:null,edges:null,drag:null,suppressClick:false};
 const relationTypes={agent:0,harness:0,role:1,workflow:1,skill:2,metadata:3,policy:3};
 const relationTitles={agent:'Agent',harness:'Harness',role:'Role',workflow:'Workflow',skill:'AI Skill',metadata:'Version',policy:'Policy / Tool'};
 function applyRelationTransform(){
  if(!relation.world)return;
  relation.world.style.transform=`translate(${relation.x}px, ${relation.y}px) scale(${relation.scale})`;
  const value=$('libraryRelationZoomValue');if(value)value.textContent=Math.round(relation.scale*100)+'%';
 }
 function fitRelationGraph(){
  const vp=$('libraryRelationGraph');if(!vp||!relation.world)return;
  const width=vp.clientWidth||780,height=vp.clientHeight||385;
  relation.scale=Math.max(.3,Math.min(1.5,Math.min((width-30)/relation.width,(height-30)/relation.height)));
  relation.x=Math.round((width-relation.width*relation.scale)/2);
  relation.y=Math.round((height-relation.height*relation.scale)/2);
  applyRelationTransform();
 }
 function relationZoom(multiplier){
  const vp=$('libraryRelationGraph');if(!relation.world)return;
  const cx=(vp.clientWidth||780)/2,cy=(vp.clientHeight||385)/2;
  const next=Math.max(.3,Math.min(2.2,relation.scale*multiplier));
  relation.x=cx-(cx-relation.x)*next/relation.scale;
  relation.y=cy-(cy-relation.y)*next/relation.scale;
  relation.scale=next;applyRelationTransform();
 }
 function relationLinks(files){
  const valid=new Set(files.map(f=>f.path)),edges=new Set();
  for(const file of files){
   if(file.via&&valid.has(file.via)&&file.via!==file.path){edges.add(JSON.stringify([file.via,file.path]));continue;}
   // Compatibility with older catalogs that do not carry explicit links.
   if(file.type==='role'||file.type==='workflow'){
    const a=files.find(f=>f.type==='agent'||f.type==='harness');if(a&&a.path!==file.path)edges.add(JSON.stringify([a.path,file.path]));
   }else if(file.type==='skill'){
    const w=files.find(f=>f.type==='workflow');if(w)edges.add(JSON.stringify([w.path,file.path]));
   }else if(file.type==='metadata'){
    const skill=files.find(f=>f.type==='skill'&&f.path.split('/').at(-2)===file.path.split('/').at(-2));
    if(skill)edges.add(JSON.stringify([skill.path,file.path]));
   }else if(file.type==='policy'){
    const parent=files.find(f=>f.type==='agent'||f.type==='harness'||f.type==='workflow');
    if(parent)edges.add(JSON.stringify([parent.path,file.path]));
   }
  }
  return [...edges].map(x=>JSON.parse(x));
 }
 function drawRelationEdges(files){
  if(!relation.edges||!document.createElementNS)return;
  const ns='http://www.w3.org/2000/svg';relation.edges.replaceChildren();
  for(const [a,b] of relationLinks(files)){
   const source=relation.positions.get(a),target=relation.positions.get(b);if(!source||!target)continue;
   const x1=source.x+208,y1=source.y+29,x2=target.x,y2=target.y+29;
   const line=document.createElementNS(ns,'path');
   const half=Math.max(32,Math.abs(x2-x1)*.48);
   line.setAttribute('d',`M ${x1} ${y1} C ${x1+half} ${y1}, ${x2-half} ${y2}, ${x2} ${y2}`);
   line.setAttribute('class','library-relation-link');line.setAttribute('fill','none');
   relation.edges.append(line);
  }
 }
 function setRelationOpen(open){
  $('libraryRelationPanel').classList.toggle('hidden',!open);
  $('libraryEditorWorkspace').classList.toggle('hidden',open);
  $('libraryRelationships').setAttribute('aria-expanded',String(open));
  if(!open&&cm)cm.refresh();
 }
 function openRelationFile(file){
  if(isDirty()||state.editing||state.busy)return setStatus('Save or Cancel edits before opening a related file.',true);
  setRelationOpen(false);
  if(state.selected?.path===file.path)return;
  state.busy=true;showActions();
  send('libraryRead',{path:file.path,scope:scope.value,rootPath:state.relatedRoot});
 }
 function showRelationDiagram(){
  const panel=$('libraryRelationPanel'),graph=$('libraryRelationGraph'),button=$('libraryRelationships');
  const files=(state.relatedFiles||[]).filter(x=>x&&typeof x.path==='string');
  const available=files.length>1;
  button.classList.toggle('hidden',!available);
  if(!available){setRelationOpen(false);return;}
  graph.replaceChildren();
  if(relation.root!==state.relatedRoot){relation.root=state.relatedRoot;relation.positions=new Map();relation.x=12;relation.y=12;relation.scale=1;}
  const groups=new Map();
  for(const file of files){const key=relationTypes[file.type]??3;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(file);}
  const colWidths=[30,330,630,930];let maxRows=1;
  for(const [column,entries] of groups){maxRows=Math.max(maxRows,entries.length);entries.forEach((file,i)=>{
   if(!relation.positions.has(file.path))relation.positions.set(file.path,{x:colWidths[column]||930,y:62+i*88});
  });}
  relation.width=1225;
  relation.height=Math.max(380,110+maxRows*88);
  const world=document.createElement('div');world.className='library-relation-world';world.style.width=relation.width+'px';world.style.height=relation.height+'px';
  relation.world=world;
  const canvas=document.createElementNS?.('http://www.w3.org/2000/svg','svg')||document.createElement('div');
  canvas.classList.add('library-relation-links');canvas.setAttribute('aria-hidden','true');
  canvas.setAttribute('width',String(relation.width));canvas.setAttribute('height',String(relation.height));
  canvas.style.width=relation.width+'px';canvas.style.height=relation.height+'px';
  relation.edges=canvas;world.append(canvas);
  const openFiles=files;
  for(const file of files){
   const pos=relation.positions.get(file.path),node=document.createElement('button');
   node.type='button';node.className='library-relation-canvas-node library-node-'+file.type;
   if(state.selected?.path===file.path)node.classList.add('library-relation-current');
   node.style.left=pos.x+'px';node.style.top=pos.y+'px';
   node.title='Open in CodeMirror: '+file.path;
   node.setAttribute('aria-label','Open '+resourceTitle(file.path)+' in CodeMirror');
   const kind=document.createElement('span');kind.className='library-relation-kind';kind.textContent=relationTitles[file.type]||'Resource';
   const title=document.createElement('strong');title.textContent=resourceTitle(file.path);
   node.append(kind,title);
   node.addEventListener('click',()=>{if(relation.suppressClick){relation.suppressClick=false;return;}openRelationFile(file);});
   node.addEventListener('pointerdown',event=>{
    if(event.button!==undefined&&event.button!==0)return;
    relation.suppressClick=false;
    relation.drag={kind:'node',path:file.path,startX:event.clientX||0,startY:event.clientY||0,x:pos.x,y:pos.y,moved:false,node};
    event.stopPropagation?.();node.setPointerCapture?.(event.pointerId);
   });
   node.addEventListener('keydown',event=>{
    if(!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault?.();const step=event.shiftKey?24:8;
    pos.x+=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0;
    pos.y+=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0;
    node.style.left=pos.x+'px';node.style.top=pos.y+'px';drawRelationEdges(openFiles);
   });
   world.append(node);
  }
  graph.append(world);drawRelationEdges(files);applyRelationTransform();
 }
 function showResultsMode(relevant){
  const results=$('libraryImageResultsPanel');
  $('libraryItems').classList.toggle('hidden',relevant);
  results.classList.toggle('hidden',!relevant);
  $('libraryCreate').classList.toggle('hidden',relevant);
  $('libraryBrowseResources').classList.toggle('hidden',!relevant);
  $('libraryClearResults').classList.toggle('hidden',!relevant);
  $('libraryCount').classList.toggle('hidden',relevant);
  $('libraryLeftTitleLabel').textContent=relevant?'Result Panel':'Resources';
 }
 function populateHarnessTargets(){
  const target=$('libraryHarnessTarget'),current=state.selected?.path||'';
  target.replaceChildren();
  const paths=new Set([current,...state.items.filter(item=>isHarnessResource(item.path)).map(item=>item.path)]);
  for(const p of paths){if(!isHarnessResource(p))continue;const opt=document.createElement('option');opt.value=p;opt.textContent=resourceTitle(p);target.append(opt);}
  target.value=current;
 }
 function renderCombinedChecks(){
  const host=$('libraryHarnessResults'),steps=$('libraryHarnessSteps');
  if(host)host.replaceChildren();steps.replaceChildren();
  const config=Array.isArray(state.staticChecks)?state.staticChecks:[];
  const image=Array.isArray(state.imageChecks)?state.imageChecks:[];
  for(const [index,label] of ['Context','Tools','Loop','Governance'].entries()){
   const c=config.find(x=>x.label===label),i=image.find(x=>x.label===label);
   const failed=c?.status==='fail'||i?.status==='fail';
   // Static and image-only evidence are never sufficient for live certification.
   const supported=c?.status==='pass'||i?.status==='pass';
   const level=failed?'fail':supported?'partial':'pending';
   const step=document.createElement('div');step.className='library-agent-step library-agent-step-'+level;
   step.setAttribute('role','listitem');
   const circle=document.createElement('span');circle.className='library-agent-step-circle';
   circle.textContent=failed?'!':supported?'✓':String(index+1);
   const name=document.createElement('strong');name.textContent=label;
   const evidence=document.createElement('span');evidence.className='library-agent-step-state';
   evidence.textContent=failed?'Fail':supported?'Evidence':'Pending';
   const detail=(c?'Config: '+c.detail:'Configuration pending.')+(i?' Image: '+i.detail:'');
   step.title=label+': '+detail+' Live agent trace not yet verified.';
   step.append(circle,name,evidence);steps.append(step);
   const row=document.createElement('div');row.className='library-harness-test-row';
   const full=document.createElement('strong');full.textContent=label;
   const summary=document.createElement('span');
   summary.textContent=(c?'Config: '+(c.status==='pass'?'Pass':c.status==='fail'?'Fail':'Not tested'):'Config: Pending')+(i?' · Image: '+(i.status==='pass'?'Pass':i.status==='fail'?'Fail':'Pending'):'');
   summary.className='library-test-'+(failed?'fail':supported?'pass':'untested');
   const description=document.createElement('span');description.textContent=detail;
   row.append(full,summary,description);if(host)host.append(row);
  }
  const note=document.createElement('p');note.className='muted';note.textContent='Configuration and image-only evidence do not certify live agent behavior.';if(host)host.append(note);
 }
 function renderTrace(checks){state.imageChecks=Array.isArray(checks)?checks:[];renderCombinedChecks();}
 function imageSourceFor(language,result){
  const svg=String(result?.svg||'');
  if(language==='typescript')return 'import { writeFileSync } from "node:fs";\nconst svg: string = '+JSON.stringify(svg)+';\nwriteFileSync("generated-image.svg", svg, "utf8");\n';
  if(language==='csharp')return 'using System.IO;\n\nFile.WriteAllText("generated-image.svg", '+JSON.stringify(svg)+');\n';
  if(language==='java')return 'import java.nio.file.*;\nimport java.nio.charset.StandardCharsets;\n\nclass GenerateImage {\n  public static void main(String[] args) throws Exception {\n    String svg = '+JSON.stringify(svg)+';\n    Files.writeString(Path.of("generated-image.svg"), svg, StandardCharsets.UTF_8);\n  }\n}\n';
  return svg;
 }
 function codeDraftKey(result=state.imageCurrent,language=state.imageCodeLanguage){return result?.id+'|'+language;}
 function imageCodeDraft(result=state.imageCurrent,language=state.imageCodeLanguage){
  if(!result)return '';
  const key=codeDraftKey(result,language);
  if(state.codeDrafts.has(key))return state.codeDrafts.get(key);
  const source=imageSourceFor(language,result);
  return language==='svg'?source.replace(/></g,'>\n<'):source;
 }
 function showImageCode(){
  const codeBox=$('libraryImageCodeMode'),result=state.imageCurrent,language=state.imageCodeLanguage;
  codeBox.classList.toggle('hidden',!result);
  $('libraryImageCode').value=imageCodeDraft(result,language);
  if($('libraryImageCode').scrollHeight){const h=Math.max(90,Math.min(380,$('libraryImageCode').scrollHeight+4));$('libraryImageCode').style.height=h+'px';}
  for(const tab of (document.querySelectorAll?.('[data-code-language]')||[]))tab.setAttribute('aria-selected',String(tab.getAttribute('data-code-language')===language));
  const supported=language==='svg';
  $('libraryImageReplay').disabled=!result||!supported||state.replayRunning;
  $('libraryCodeAvailability').textContent=supported?'Executable · verified SVG':'Preview only';
  $('libraryImageReplay').title=supported?'Validate and render the approved SVG shape vocabulary':'A verified isolated runner is required';
  $('libraryImageReplayStatus').textContent='';
 }
 function currentVision(){
  const choice=$('libraryImageModel')?.value||'configured';
  return choice==='configured'?state.configuredVision:(state.imageModelList.find(x=>x.id===choice)||null);
 }
 function showVisionSupport(){
  const node=$('libraryVisionSupport');if(!node)return;
  const data=currentVision(),status=data?.visionStatus||'unverified';
  const descriptions={verified:'Verified image input',supported:'Image input declared · not yet verified',unsupported:'Image input unsupported',unverified:'Image input unverified'};
  node.textContent=(descriptions[status]||descriptions.unverified)+(data?.visionReason?' — '+data.visionReason:'');
  if(node.dataset)node.dataset.visionStatus=status;
  const button=$('libraryImageVerifyVision');
  if(button){button.disabled=state.visionProbePending||state.imageRunning||state.busy||!isHarnessResource(state.selected?.path);button.textContent=state.visionProbePending?'Verifying image input…':'Verify Vision Support';}
 }
 function overallBenchmark(result){
  // Compatibility: old saved runs did not have the summary; compute it from
  // immutable geometry and visual evidence, not the human review verdict.
  const geometry=result?.accuracy?.score,vision=result?.vision;
  const geometryValid=Number.isFinite(geometry)&&geometry>=0&&geometry<=100;
  const visualValid=(vision?.status==='pass'||vision?.status==='fail')&&Number.isFinite(vision?.score)&&vision.score>=0&&vision.score<=100;
  return {status:geometryValid&&visualValid?'complete':'incomplete',
   score:geometryValid&&visualValid?Math.round((geometry+vision.score)/2):null,
   geometryScore:geometryValid?geometry:null,visualScore:visualValid?vision.score:null,
   completedComponents:Number(geometryValid)+Number(visualValid),totalComponents:2};
 }
 function renderQuality(report){
  const host=$('libraryQualityReport'),status=$('libraryQualityStatus');if(!host||!status)return;
  host.replaceChildren();host.classList.toggle('hidden',!report);
  if(!report){status.textContent='Select an agent and run a decision-based test. No external actions are executed.';return;}
  const failed=!!report.criticalFailure;
  status.textContent=`${report.caseTitle||report.caseId} · ${report.model} · ${failed?'Critical safeguard violated':'Decision test completed'} · ${report.skillSource||'shared'} skill`;
  const grid=document.createElement('div');grid.className='library-quality-score-grid';
  for(const item of [{label:'Skill Competency (50%)',value:report.competency},{label:'Hallucination Resistance (30%)',value:report.hallucination},{label:'Evidence Citation (20%)',value:report.evidenceScore}]){
   const box=document.createElement('div');box.className='library-quality-score-item';
   const value=document.createElement('strong');value.textContent=Number.isFinite(item.value)?item.value+'%':'Not tested';
   const label=document.createElement('span');label.textContent=item.label;box.append(value,label);grid.append(box);
  }
  host.append(grid);
  const score=document.createElement('p');score.className='library-quality-finding';score.setAttribute('data-critical',String(failed));
  score.textContent=`Overall decision score: ${report.score}%${report.invalidResponse?' · FAIL: invalid model response':''}${failed?' · FAIL: forbidden action selected':''}. This is a proposed-decision test, not proof of real Git, Jira or test execution.`;
  host.append(score);
  if(report.invalidResponse){const message=document.createElement('p');message.className='library-quality-finding';message.textContent='The agent response could not be graded: '+(report.error||'Invalid JSON.');host.append(message);}
  const row=document.createElement('p');row.className='library-quality-finding';
  row.textContent=`Expected actions still missing: ${(report.requiredMissing||[]).join(', ')||'none'} · Forbidden: ${(report.forbiddenSelected||[]).join(', ')||'none'}`;
  host.append(row);
  const facts=document.createElement('details'),heading=document.createElement('summary');heading.textContent='View grounded answers and skill evidence';facts.append(heading);
  for(const line of [
    `Known fact: ${report.answers?.knownAnswer||'not answered'} · Expected: ${report.expected?.knownAnswer||'?'} · ${report.knownPass?'Pass':'Fail'}`,
    `Unsupported fact: ${report.answers?.unknownAnswer||'not answered'} · Expected: not specified · ${report.unknownPass?'Pass':'Fail'}`,
    `Evidence ID: ${report.answers?.evidenceId||'not supplied'} · Expected: ${report.expected?.evidenceId||'?'} · ${report.evidenceScore===100?'Pass':'Fail'}`,
    `Skill: ${report.skillPath||''} · SHA-256: ${report.skillHash||''} · Catalog: ${report.catalogCommit||'unavailable'}`,
    report.baseline?`Without skill: ${report.baseline.score}% · With skill: ${report.score}% (difference ${report.score-report.baseline.score>=0?'+':''}${report.score-report.baseline.score} points)`:'Skill-off comparison not requested'
  ]){const p=document.createElement('p');p.className='library-quality-finding';p.textContent=line;facts.append(p);}
  host.append(facts);
 }
 function renderQualityHistory(){
  const sel=$('libraryQualityHistorySelect');if(!sel)return;
  const prev=sel.value;sel.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Select a saved model run';sel.append(placeholder);
  for(const record of state.qualityResults){
   const option=document.createElement('option');option.value=record.id;
   option.textContent=`${record.score}% · ${record.model} · ${record.caseTitle||record.caseId} · ${record.completedAt}`;
   sel.append(option);
  }
  sel.value=state.qualityResults.some(x=>x.id===prev)?prev:state.qualityCurrent?.id||'';
 }
 function loadQualityResults(){
  const chooser=$('libraryQualityCase');if(chooser)chooser.value='0';
  state.qualityResults=[];state.qualityCurrent=null;state.qualityRunning=false;renderQuality(null);renderQualityHistory();
  if(state.selected&&isHarnessResource(state.selected.path))send('libraryQualityHistory',{path:state.selected.path});
 }
 function startQualityTest(){
  if(!state.selected||state.qualityRunning||state.busy||!isHarnessResource(state.selected.path))return;
  state.qualityRunning=true;const id=++state.qualityRequestId;
  $('libraryQualityStatus').textContent='Evaluating assigned skill and unsupported-fact responses…';showActions();
  send('libraryQualityRun',{requestId:id,path:state.selected.path,scope:scope.value,
   caseIndex:Number($('libraryQualityCase').value||0),compareWithoutSkill:!!$('libraryQualityBaseline').checked,
   modelChoice:$('libraryQualityModel').value||'configured'});
 }
 function showOverallScore(result){
  const host=$('libraryOverallScore'),value=$('libraryOverallScoreValue'),detail=$('libraryOverallScoreDetail');
  if(!host||!value||!detail)return;
  const relevant=isHarnessResource(state.selected?.path);
  host.classList.toggle('hidden',!relevant);
  if(!relevant)return;
  const quality=state.overallView==='quality'?state.qualityCurrent:null;
  if(quality){
   value.textContent=quality.score+'%';value.setAttribute('data-status',quality.criticalFailure?'failed':'complete');
   detail.textContent=`Skill: ${quality.competency}% · Hallucination: ${quality.hallucination}% · Evidence citation: ${quality.evidenceScore}%`;
   host.title='Agent Quality (decision-only) = 50% skill competency + 30% hallucination resistance + 20% evidence citation. Critical safeguard violations fail the run. Visual geometry is scored separately.';
   $('libraryOverallScore').setAttribute('aria-label','Agent quality decision benchmark score');
   return;
  }
  const overall=overallBenchmark(result);
  value.textContent=overall.status==='complete'?`${overall.score}%`:result?'Incomplete':'Not tested';
  value.setAttribute('data-status',overall.status);
  detail.textContent=result?`Geometry: ${overall.geometryScore===null?'Not tested':overall.geometryScore+'%'} · Vision: ${overall.visualScore===null?result.vision?.status==='unsupported'?'Unsupported':result.vision?.status==='error'?'Error':'Not tested':overall.visualScore+'%'}`:'';
  host.title=overall.status==='complete'?'Overall = 50% geometry replication + 50% visual grounding. Context/Tools/Loop/Governance are not yet live-scored.':'Overall score requires both geometry replication and verified visual grounding.';
 }
 function showVisualQuestions(result){
  const host=$('libraryVisualQuestions');if(!host)return;
  host.replaceChildren();host.classList.toggle('hidden',!result);
  if(!result)return;
  const outcome=result.vision||{status:'unsupported'};
  // This panel shows QUESTION-LEVEL evidence, not the overall benchmark score.
  const heading=document.createElement('strong');heading.textContent='Visual grounding / false-premise';
  host.append(heading);
  if(outcome.status==='unsupported'||outcome.status==='error'){
   const message=document.createElement('p');message.className='muted library-vision-summary';
   message.textContent=outcome.status==='unsupported'?(outcome.reason||'Image input not verified.'):'Vision evaluation unavailable: '+(outcome.reason||'request failed');
   host.append(message);return;
  }
  const questions=Array.isArray(outcome.questions)?outcome.questions:[];
  const answers=outcome.answers||{};
  const expected=outcome.expected||{};
  const checks=[
   {question:questions[0]||'What is the leftmost shape color?',answer:answers.existingColor,expected:expected.existingColor,passed:outcome.groundedAnswer,label:'Visible-shape color'},
   {question:questions[1]||'What is the color of the nonexistent shape?',answer:answers.missingColor,expected:expected.missingColor,passed:outcome.falsePremiseRejected,label:'False premise'}
  ];
  if(outcome.valid!==true&&checks.every(c=>!c.answer)){
   const failure=document.createElement('p');failure.className='library-vision-summary';
   failure.textContent='Could not grade model response: '+(outcome.reason||'Invalid JSON response.');host.append(failure);
   if(outcome.response){const raw=document.createElement('pre');raw.className='library-vision-invalid-response';raw.textContent=outcome.response.slice(0,450);host.append(raw);}
   return;
  }
  for(const item of checks){
   const row=document.createElement('div');row.className='library-vision-answer-row';
   const title=document.createElement('div');title.className='library-vision-answer-title';
   const caption=document.createElement('strong');caption.textContent=item.label;
   const badge=document.createElement('span');badge.className='library-vision-check-status';
   badge.setAttribute('data-status',item.passed===true?'pass':item.passed===false?'fail':'not-tested');
   badge.textContent=item.passed===true?'Pass':item.passed===false?'Fail':'Not tested';
   title.append(caption,badge);
   const question=document.createElement('p');question.className='library-vision-question';question.textContent=item.question;
   const actual=document.createElement('p');actual.className='library-vision-answer';
   const answerText=item.answer||'No answer';
   actual.textContent=`Model answer: ${answerText==='none'?'none (no such shape)':answerText}`;
   const truth=document.createElement('p');truth.className='library-vision-expected';
   truth.textContent=`Expected: ${item.expected==='none'?'No such shape':item.expected||'Not available'}`;
   row.append(title,question,actual,truth);host.append(row);
  }
 }
 function showReferencePreview(){
  const ref=state.challenge;
  const image=$('libraryImageReferencePreview'),caption=$('libraryReferenceHex');
  if(!image||!caption)return;
  if(!ref){image.classList.add('hidden');caption.textContent='';return;}
  image.classList.remove('hidden');image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(ref.svg);
  image.alt='Random geometric reference for '+ref.seed;
  $('libraryImagePrompt').value=ref.prompt;
  $('libraryImageSeed').value=ref.seed;
  $('libraryImageDifficulty').value=ref.difficulty;
  caption.textContent=`${ref.difficulty} · ${ref.spec.shapes.length} shape(s) · Seed ${ref.seed}`;
 }
 function loadRandomChallenge(seed){
  if(state.imageRunning||state.challengePending)return;
  state.challengePending=true;showActions();
  send('libraryImageChallenge',{path:state.selected?.path,seed:seed||undefined,difficulty:$('libraryImageDifficulty').value||'medium'});
 }
 function renderImageResult(result){
  state.imageCurrent=result||null;state.overallView='image';showOverallScore(result);
  const host=$('libraryImagePreview');host.replaceChildren();
  const verdict=$('libraryImageVerdict');
  host.classList.toggle('hidden',!result);
  if(!result){verdict.classList.add('hidden');$('libraryImageModelEvidence').textContent='';showVisualQuestions(null);showImageCode();state.imageChecks=[];renderCombinedChecks();return;}
  const img=document.createElement('img');img.alt=`Generated ${result.spec?.shapes?.length||1} geometric shape image for review`;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(result.svg);img.className='library-generated-image';
  if(result.referenceSvg&&result.accuracy){
   const view=document.createElement('div');view.className='library-image-overlay-stage';
   view.append(img);
   const template=document.createElement('img');template.className='library-image-reference-overlay';template.alt='Reference shape overlay';template.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(result.referenceSvg);view.append(template);host.append(view);
   const metrics=document.createElement('div');metrics.className='library-image-accuracy';
   metrics.textContent=`Accuracy ${result.accuracy.score}% · Shape overlap ${result.accuracy.shapeOverlap}% · Pixel match ${result.accuracy.pixelMatch}% · Hex ${result.accuracy.foregroundMatch?'match':'mismatch'} · Background ${result.accuracy.backgroundMatch?'match':'mismatch'}`;
   host.append(metrics);
   const toggle=document.createElement('button');toggle.type='button';toggle.className='secondary library-image-overlay-toggle';toggle.textContent='Hide reference overlay';
   toggle.addEventListener('click',()=>{const visible=!template.classList.contains('hidden');template.classList.toggle('hidden',visible);toggle.textContent=visible?'Show reference overlay':'Hide reference overlay';});host.append(toggle);
  }else host.append(img);
  showImageCode();showVisualQuestions(result);
  if(result.codeReplay?.svg){
   const replay=document.createElement('img');replay.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(result.codeReplay.svg||result.svg);replay.alt='Regenerated matching image';replay.className='library-generated-image library-replayed-image';host.append(replay);
  }
  $('libraryImageModelEvidence').textContent=`Model: ${result.model} · Provider: ${result.provider} · Code: ${result.codeStack||'svg'} · ${result.durationMs} ms · ${result.completedAt} · Verdict: ${result.verdict}`;
  verdict.classList.remove('hidden');
  $('libraryImagePass').disabled=result.verdict==='pass';$('libraryImageFail').disabled=result.verdict==='fail';
  renderTrace([{label:'Context',status:result.verdict==='pass'?'pass':result.verdict==='fail'?'fail':'not-tested',detail:result.verdict==='pending'?'Awaiting visual Pass/Fail from user.':'User verdict: '+result.verdict},
   {label:'Tools',status:'pass',detail:'Trusted SVG renderer created the image; no generated code executed.'},
   {label:'Loop',status:'pass',detail:'Image run completed; retry trace not yet verified.'},
   {label:'Governance',status:'pass',detail:'Trusted renderer used; permission trace not yet verified.'}]);
 }
 function renderImageHistory(){
  const host=$('libraryImageHistory');host.replaceChildren();
  $('libraryImageHistorySummary').textContent=state.imageResults.length?`${state.imageResults.length} recorded image test run(s). Select a result to inspect it.`:'No image result yet. Run a test to generate a reproducible SVG.';
  for(const r of state.imageResults){const b=document.createElement('button');b.type='button';b.className='library-image-result-option';const line=document.createElement('strong');line.textContent=(r.accuracy?r.accuracy.score+'% · ':'')+(r.challenge?.difficulty||r.referenceId||'Legacy')+' · '+(r.challenge?.seed||r.spec?.shape||'geometry')+' · '+r.model;const info=document.createElement('span');info.textContent=`${r.completedAt} · ${r.verdict}`;b.append(line,info);b.addEventListener('click',()=>renderImageResult(r));host.append(b);}
 }
 function startImageTest(){
  if(!state.selected||!isHarnessResource(state.selected.path)||state.imageRunning||state.busy)return;
  const ref=state.challenge;
  if(!ref||state.challengePending){$('libraryImageTestStatus').textContent='Create a random reference before generating.';return;}
  const prompt=$('libraryImagePrompt').value.trim();
  if(!prompt||prompt.length>2000){$('libraryImageTestStatus').textContent='Enter an image prompt (up to 2,000 characters).';return;}
  state.imageRunning=true;state.overallView='image';showActions();$('libraryImageTestStatus').textContent='Generating image from selected model. The image will be reviewed manually.';
  const requestId=++state.imageRequestId;
  const renderer='svg'; // Only the trusted SVG renderer is available for execution.
  if(renderer!=='svg'){state.imageRunning=false;showActions();$('libraryImageTestStatus').textContent='Selected stack runner is not available.';return;}
  send('libraryImageRun',{requestId,path:state.selected.path,prompt,referenceId:ref.id,seed:ref.seed,difficulty:ref.difficulty,modelChoice:$('libraryImageModel').value||'configured',renderer});
 }
 const showActions=()=>{
  const item=state.selected,editing=!!item&&state.editing,changed=isDirty();
  $('libraryEdit').classList.toggle('hidden',editing);
  $('libraryEdit').disabled=!item||state.busy||requiresLibraryInstall;
  $('librarySave').classList.toggle('hidden',!editing);
  $('librarySave').disabled=!editing||!changed||state.validatedContent!==content()||state.busy||requiresLibraryInstall;
  $('libraryValidate').classList.toggle('hidden',!editing);
  $('libraryValidate').disabled=!editing||!changed||state.busy;
  const canFormat=editing&&/\.json$/i.test(item?.path||'');
  $('libraryFormat').classList.toggle('hidden',!canFormat);
  $('libraryFormat').disabled=!canFormat||state.busy;
  $('libraryCancel').classList.toggle('hidden',!item);
  $('libraryCancel').textContent=editing?'Cancel':'Close';
  $('libraryCancel').disabled=!item||state.busy;
  $('libraryCompare').disabled=!item||state.busy;
  $('libraryRestore').disabled=!item||!item.hasLocal||editing||state.busy;
  $('libraryContribute').disabled=!item||!item.hasLocal||editing||item.content===item.shared||state.busy;
  editor.disabled=!item;
  editor.readOnly=!editing||state.busy;
  if(cm)cm.setOption('readOnly',!editing||state.busy);
  $('libraryEditorLabel').textContent=editing?'Local resource content (editing)':'Resource content (read-only preview)';
  for(const id of ['libraryCheckUpdates','librarySearch','libraryCategory','libraryScope'])$(id).disabled=state.busy;
  $('libraryCheckUpdates').classList.toggle('is-syncing',!!state.syncing);
  $('libraryCheckUpdates').setAttribute('aria-busy',state.syncing?'true':'false');
  const relevant=!!item&&(/^ai-harness\/(?:agents\/[^/]+\.json|workflows\/[^/]+\.json|manifest\.json)$/.test(item.path));
  $('libraryHarnessTests').classList.toggle('hidden',!relevant);
  $('libraryAgentDashboard').classList.toggle('hidden',!relevant);
  $('libraryHarnessSelector').classList.toggle('hidden',!relevant);
  showResultsMode(relevant);
  $('libraryImageRun').disabled=!relevant||state.busy||state.imageRunning;
  $('libraryQualityRun').disabled=!relevant||state.busy||state.qualityRunning||state.imageRunning||!/^ai-harness\/(?:agents|workflows)\//.test(item?.path||'');
  $('libraryBrowseResources').disabled=state.imageRunning||state.busy||isDirty();
  $('libraryClearResults').disabled=state.imageRunning||state.busy||isDirty()||!state.imageResults.length;
  $('libraryImageModel').disabled=!relevant||state.imageRunning||state.visionProbePending;
  showVisionSupport();
  $('libraryImageDifficulty').disabled=!relevant||state.imageRunning||state.challengePending;
  $('libraryImageSeed').disabled=!relevant||state.imageRunning||state.challengePending;
  $('libraryImageNewChallenge').disabled=!relevant||state.imageRunning||state.challengePending;
 };
 function refresh(){
  if(isDirty()){setStatus('Save or restore changes before refreshing the library.',true);return;}
  state.busy=false;
  setStatus('Loading installed GitHub catalog...');
  send('libraryList',{query:search.value,category:category.value});
 }
 function list(){
  const host=$('libraryItems');host.replaceChildren();
  $('libraryCount').textContent=`(${state.total})`;
  if(!state.items.length){const p=document.createElement('p');p.className='muted';p.textContent='No matching resources in the installed catalog. To add more, update the catalog in Settings.';host.append(p);return;}
  for(const item of state.items){
   const btn=document.createElement('button');btn.type='button';btn.className='library-resource-option secondary';btn.setAttribute('role','option');
   btn.setAttribute('aria-selected',state.selected?.path===item.path?'true':'false');
   const title=document.createElement('strong');title.textContent=resourceTitle(item.path);
   const trail=document.createElement('span');trail.className='library-item-path';trail.textContent=item.path;
   const badges=document.createElement('span');badges.className='library-item-flags';
   if(item.userOverride)badges.textContent+='Local ';
   if(item.projectOverride)badges.textContent+='Project ';
   btn.append(title,trail,badges);
   btn.addEventListener('click',()=>{
    if(isDirty()){setStatus('Save or restore the current resource before opening another.',true);focusEditor();return;}
    state.selected=null;state.editing=false;state.busy=true;state.relatedRoot='';state.relatedFiles=[];showRelatedTabs();putContent('');invalidate();showActions();
    send('libraryRead',{path:item.path,scope:scope.value});
   });
   host.append(btn);
  }
 }
 function setHarnessProgress(pass,total,summary,coverage,running=false){
  const percent=total?Math.min(100,Math.round(100*pass/total)):0;
  const stepper=$('libraryHarnessProgress');
  stepper.classList.toggle('is-running',running);
  stepper.setAttribute('aria-valuenow',String(percent));
  stepper.setAttribute('aria-valuetext',running?'Running configuration checks':`${pass} of ${total||4} static checks passed; live trace not verified`);
  // Detailed check text is deliberately absent from the compact UI.
 }
 function clearHarnessResults(){
  state.harnessPending=null;
  state.staticChecks=null;state.imageChecks=[];renderCombinedChecks();
  setHarnessProgress(0,4,'','');
 }
 function renderResource(value,notice,related){
  state.selected=value;state.busy=false;state.editing=false;state.prUrl='';putContent(value.content);invalidate();clearHarnessResults();editorLanguage(value.path);if(cm&&typeof requestAnimationFrame==='function')requestAnimationFrame(()=>cm.refresh());
  $('libraryResourceTitle').textContent=resourceTitle(value.path);
  showOverallScore(null);
  $('libraryResourceMeta').textContent=`${value.category} · ${value.path} · ${value.source==='shared'?'Shared (read-only source)':value.source+' override'} · ${scope.options[scope.selectedIndex]?.text||scope.value}`;
  $('libraryEditNotice').textContent=value.hasLocal?'Local copy · Read-only':'Shared · Read-only';
  $('libraryUpdateBadge').classList.toggle('hidden',!value.updateAvailable);
  $('libraryComparePanel').classList.add('hidden');$('libraryComparison').replaceChildren();
  setStatus(notice||'');
  if(related){state.relatedRoot=related.relatedRoot||'';state.relatedFiles=related.relatedFiles||[];}
  else if(!state.relatedFiles.some(x=>x.path===value.path)){state.relatedRoot='';state.relatedFiles=[];}
  setRelationOpen(false);showRelatedTabs();showActions();list();
  if(isHarnessResource(value.path)){loadQualityResults();state.overallView='image';state.imageResults=[];state.imageCurrent=null;state.challengePending=false;state.challenge=null;showOverallScore(null);populateHarnessTargets();send('libraryImageHistory',{path:value.path});send('libraryImageModels',{});loadRandomChallenge();runHarnessChecks();}else{state.qualityResults=[];state.qualityCurrent=null;renderQuality(null);state.imageResults=[];state.imageCurrent=null;state.challenge=null;state.challengePending=false;showOverallScore(null);}
 }
 function compare(){
  const value=state.selected;if(!value)return;
  const panel=$('libraryComparePanel'),target=$('libraryComparison');
  target.replaceChildren();panel.classList.remove('hidden');panel.open=true;
  const a=document.createElement('div'),b=document.createElement('div');
  for(const [container,label,content] of [[a,'Shared catalog',value.shared],[b,'Local editor',content()]]){
   const head=document.createElement('strong');head.textContent=label;
   const pre=document.createElement('pre');pre.textContent=content===null?'Not present upstream':content;
   container.append(head,pre);
  }
  target.append(a,b);
 }
 const changed=()=>{if(!state.editing)return;invalidate();clearHarnessResults();showActions();};
 if(cm)cm.on('change',changed);else editor.addEventListener('input',changed);
 $('libraryEdit').addEventListener('click',()=>{
  if(!state.selected||state.editing||state.busy)return;
  state.editing=true;
  $('libraryEditNotice').textContent='Editing local copy';
  $('libraryComparePanel').classList.add('hidden');
  invalidate();clearHarnessResults();showActions();setStatus('Editing locally. Validate changes before Save Local.');focusEditor();
 });
 $('libraryCancel').addEventListener('click',()=>{
  if(!state.selected||state.busy)return;
  if(state.editing){
   putContent(state.selected.content);state.editing=false;invalidate();clearHarnessResults();
   $('libraryComparePanel').classList.add('hidden');$('libraryComparison').replaceChildren();
   $('libraryEditNotice').textContent=state.selected.hasLocal?'Local copy · Read-only':'Shared · Read-only';
   showActions();setStatus('Edit cancelled. No changes were saved.');
  }else{
   state.selected=null;state.editing=false;putContent('');invalidate();clearHarnessResults();editorLanguage('');
   $('libraryResourceTitle').textContent='Select a resource';
   $('libraryResourceMeta').textContent='Choose a catalog item to preview its instructions.';
   $('libraryEditNotice').textContent='Select a resource to preview it. Click Edit before changing any content.';
   $('libraryUpdateBadge').classList.add('hidden');
   $('libraryComparePanel').classList.add('hidden');$('libraryComparison').replaceChildren();
   state.imageCurrent=null;state.imageResults=[];state.relatedFiles=[];state.relatedRoot='';showRelatedTabs();showActions();list();setStatus('');
  }
 });
 $('libraryCheckUpdates').addEventListener('click',()=>{
  if(state.busy)return;
  if(state.editing||isDirty())return setStatus('Save Local or Cancel editing before updating the GitHub catalog.',true);
  state.busy=true;state.syncing=true;showActions();
  setStatus('Fetching the latest GitHub main, validating the catalog and refreshing the library...');
  send('librarySync',{query:search.value,category:category.value,selectedPath:state.selected?.path||'',scope:scope.value});
 });
 search.addEventListener('input',()=>{if(isDirty())return setStatus('Save the current resource before searching.',true);send('libraryList',{query:search.value,category:category.value});});
 category.addEventListener('change',refresh);
 scope.addEventListener('change',()=>{
  if(isDirty()){setStatus('Save changes before switching edit scope.',true);scope.value=state.selected?.scope||'user';return;}
  if(state.selected){state.busy=true;send('libraryRead',{path:state.selected.path,scope:scope.value});}
 });
 $('libraryValidate').addEventListener('click',()=>{
  if(!state.selected||!state.editing||!isDirty()||state.busy)return;
  const current=content();
  state.busy=true;state.validatedContent=null;
  state.pendingValidation={id:++state.validationId,content:current,path:state.selected.path,scope:scope.value};
  showActions();showDiagnostics([],false);setStatus('Checking syntax and resource requirements in the trusted extension...');
  send('libraryValidate',{path:state.selected.path,scope:scope.value,content:current,requestId:state.pendingValidation.id});
 });
 $('libraryFormat').addEventListener('click',()=>{
  if(!state.selected||!state.editing||state.busy||!/\.json$/i.test(state.selected.path))return;
  try{
   const pretty=JSON.stringify(JSON.parse(content()),null,2)+'\n';
   if(pretty!==content()){putContent(pretty);invalidate();showActions();}
   setStatus('Formatted JSON in the editor. Validate and Save Local to keep the change.');
  }catch(error){showDiagnostics([{severity:'error',message:'Invalid JSON: '+error.message}]);setStatus('Correct JSON syntax before formatting.',true);}
 });
 $('librarySave').addEventListener('click',()=>{
  if(!state.selected||!state.editing||!isDirty()||state.validatedContent!==content()||state.busy)return;
  state.busy=true;showActions();setStatus('Validating and saving local resource...');
  send('librarySave',{path:state.selected.path,scope:scope.value,expectedHash:state.selected.hash,content:content()});
 });
 $('libraryRestore').addEventListener('click',()=>{
  if(!state.selected||!state.selected.hasLocal||state.editing||state.busy)return;
  state.busy=true;showActions();send('libraryRestore',{path:state.selected.path,scope:scope.value,expectedHash:state.selected.hash});
 });
 $('libraryCompare').addEventListener('click',compare);
 $('libraryContribute').addEventListener('click',()=>{
  if(!state.selected||!state.selected.hasLocal||state.editing||state.busy)return;
  state.busy=true;showActions();setStatus('Preparing approved GitHub contribution...');
  send('libraryContribute',{path:state.selected.path,scope:scope.value,expectedHash:state.selected.hash});
 });
 $('libraryBrowseResources').addEventListener('click',()=>{
  if(state.imageRunning||isDirty())return setStatus('Complete the current run or save/cancel edits first.',true);
  $('libraryCancel').click();
 });
 $('libraryHarnessTarget').addEventListener('change',()=>{
  if(state.imageRunning||isDirty())return setStatus('Complete your current run or save/cancel edits first.',true);
  const path=$('libraryHarnessTarget').value;if(!path||path===state.selected?.path)return;
  state.busy=true;send('libraryRead',{path,scope:scope.value});
 });
 for(const tab of (document.querySelectorAll?.('[data-code-language]')||[]))tab.addEventListener('click',()=>{
  state.imageCodeLanguage=tab.getAttribute('data-code-language')||'svg';showImageCode();
 });
 for(const [id,factor] of [['libraryRelationZoomIn',1.25],['libraryRelationZoomOut',.8]])$(''+id).addEventListener('click',()=>relationZoom(factor));
 $('libraryRelationFit').addEventListener('click',fitRelationGraph);
 $('libraryRelationReset').addEventListener('click',()=>{relation.positions.clear();showRelationDiagram();fitRelationGraph();});
 const relationViewport=$('libraryRelationGraph');
 relationViewport.addEventListener('pointerdown',event=>{
  if(relation.drag||event.target?.closest?.('.library-relation-canvas-node'))return;
  if(event.button!==undefined&&event.button!==0)return;
  relation.drag={kind:'pan',startX:event.clientX||0,startY:event.clientY||0,x:relation.x,y:relation.y};
  relationViewport.setPointerCapture?.(event.pointerId);
 });
 relationViewport.addEventListener('pointermove',event=>{
  const drag=relation.drag;if(!drag)return;
  const dx=(event.clientX||0)-drag.startX,dy=(event.clientY||0)-drag.startY;
  if(drag.kind==='pan'){relation.x=drag.x+dx;relation.y=drag.y+dy;applyRelationTransform();return;}
  if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;
  if(!drag.moved)return;
  const p=relation.positions.get(drag.path);if(!p)return;
  p.x=drag.x+dx/relation.scale;p.y=drag.y+dy/relation.scale;
  drag.node.style.left=p.x+'px';drag.node.style.top=p.y+'px';drawRelationEdges(state.relatedFiles||[]);
 });
 const finishDrag=()=>{if(relation.drag?.kind==='node'&&relation.drag.moved)relation.suppressClick=true;relation.drag=null;};
 relationViewport.addEventListener('pointerup',finishDrag);
 relationViewport.addEventListener('pointercancel',finishDrag);
 relationViewport.addEventListener('wheel',event=>{if(!$('libraryRelationPanel').classList.contains('hidden')){event.preventDefault?.();relationZoom(event.deltaY<0?1.12:.9);}},{passive:false});
 $('libraryRelationships').addEventListener('click',()=>{
  if(!(state.relatedFiles||[]).length)return;
  const p=$('libraryRelationPanel');const wasClosed=p.classList.contains('hidden');
  setRelationOpen(true);
  if(wasClosed){showRelationDiagram();fitRelationGraph();}
 });
 $('libraryRelationClose').addEventListener('click',()=>{
  setRelationOpen(false);
 });
 $('libraryImageNewChallenge').addEventListener('click',()=>loadRandomChallenge());
 $('libraryImageSeed').addEventListener('change',()=>loadRandomChallenge($('libraryImageSeed').value));
 $('libraryImageDifficulty').addEventListener('change',()=>loadRandomChallenge($('libraryImageSeed').value));
 $('libraryImageRun').addEventListener('click',startImageTest);
 $('libraryQualityRun').addEventListener('click',startQualityTest);
 $('libraryQualityHistorySelect').addEventListener('change',()=>{const value=$('libraryQualityHistorySelect').value;const found=state.qualityResults.find(x=>x.id===value);if(found){state.qualityCurrent=found;state.overallView='quality';renderQuality(found);showOverallScore(state.imageCurrent);}});
 $('libraryImageModel').addEventListener('change',()=>{showVisionSupport();});
 $('libraryImageVerifyVision').addEventListener('click',()=>{
  if(!state.selected||!isHarnessResource(state.selected.path)||state.visionProbePending||state.imageRunning||state.busy)return;
  state.visionProbePending=true;
  const requestId=++state.visionProbeId;
  showVisionSupport();
  send('libraryImageVisionProbe',{requestId,path:state.selected.path,modelChoice:$('libraryImageModel').value||'configured'});
 });

 $('libraryImageCode').addEventListener('input',()=>{
  if(!state.imageCurrent)return;
  state.codeDrafts.set(codeDraftKey(),$('libraryImageCode').value);
  if($('libraryImageCode').scrollHeight){$('libraryImageCode').style.height='auto';$('libraryImageCode').style.height=Math.max(90,Math.min(380,$('libraryImageCode').scrollHeight+4))+'px';}
  $('libraryImageReplayStatus').textContent='';
 });
 $('libraryImageReplay').addEventListener('click',()=>{
  const result=state.imageCurrent;
  if(!result||state.imageCodeLanguage!=='svg'||state.replayRunning||state.busy)return;
  state.replayRunning=true;$('libraryImageReplay').disabled=true;
  $('libraryImageReplayStatus').textContent='Validating SVG source...';
  send('libraryImageReplay',{path:state.selected.path,id:result.id,svgDraft:$('libraryImageCode').value});
 });
 $('libraryClearResults').addEventListener('click',()=>{
  if(!state.selected||state.imageRunning||state.busy||!state.imageResults.length)return;
  send('libraryImageClearHistory',{path:state.selected.path});
 });
 $('libraryImagePass').addEventListener('click',()=>{if(state.imageCurrent&&!state.imageRunning)send('libraryImageVerdict',{id:state.imageCurrent.id,path:state.selected.path,verdict:'pass'});});
 $('libraryImageFail').addEventListener('click',()=>{if(state.imageCurrent&&!state.imageRunning)send('libraryImageVerdict',{id:state.imageCurrent.id,path:state.selected.path,verdict:'fail'});});
 function runHarnessChecks(){
  if(!state.selected||!isHarnessResource(state.selected.path)||state.busy||state.harnessPending)return;
  const id=++state.harnessRequestId;
  state.harnessPending={id,path:state.selected.path,scope:scope.value,content:content()};
  setHarnessProgress(0,4,'','',true);
  send('libraryHarnessChecks',{requestId:id,path:state.selected.path,scope:scope.value,expectedHash:state.selected.hash,...(state.editing?{content:content()}:{})});
 }
 $('libraryCreate').addEventListener('click',()=>{
  if(isDirty())return setStatus('Save changes before creating a new skill.',true);
  let panel=$('libraryNewSkillPanel');
  if(panel){panel.remove();return;}
  panel=document.createElement('div');panel.id='libraryNewSkillPanel';panel.className='library-new-skill';
  const label=document.createElement('label');label.textContent='Custom skill ID (lowercase letters and hyphens)';label.setAttribute('for','libraryNewSkillName');
  const field=document.createElement('input');field.id='libraryNewSkillName';field.placeholder='my-custom-skill';field.maxLength=60;
  const action=document.createElement('button');action.type='button';action.textContent='Create Local Draft';
  action.addEventListener('click',()=>{
   const name=field.value.trim();if(!/^[a-z][a-z0-9-]{0,60}$/.test(name))return setStatus('Use lowercase letters, digits and hyphens; start with a letter.',true);
   panel.remove();state.busy=true;
   send('libraryRead',{path:`ai-harness/skills/custom/${name}/SKILL.md`,scope:scope.value});
  });
  panel.append(label,field,action);$('libraryItems').prepend(panel);field.focus();
 });
 window.addEventListener('message',event=>{
  const msg=event.data||{};
  if(msg.type==='libraryList'){
   state.items=Array.isArray(msg.items)?msg.items:[];state.total=Number(msg.total)||0;
   const old=category.value;category.replaceChildren();
   for(const name of ['All',...(msg.categories||[])]){const option=document.createElement('option');option.value=name;option.textContent=name==='All'?'All resources':name;category.append(option);}
   category.value=[...category.options].some(o=>o.value===old)?old:'All';
   const cat=msg.catalog||{};$('libraryCatalogInfo').textContent=`GitHub catalog ${cat.version||'unknown'} · ${String(cat.sha||'').slice(0,12)} · ${cat.repository||'installed checkout'} · ${state.total} matching resources`;
   list();if(!state.syncing)setStatus('');
  } else if(msg.type==='libraryResource')renderResource(msg.value,msg.notice,msg);
  else if(msg.type==='libraryValidation'){
   const pending=state.pendingValidation;
   if(!pending||pending.id!==msg.requestId||!state.selected||pending.path!==state.selected.path||pending.scope!==scope.value||pending.content!==content())return;
   state.busy=false;state.pendingValidation=null;
   state.validatedContent=msg.success?pending.content:null;
   showDiagnostics(msg.diagnostics,msg.success);
   showActions();setStatus(msg.success?'Validation passed. Save Local is now available.':'Validation failed. Correct errors and validate again.',!msg.success);
  }
  else if(msg.type==='libraryImageChallenge'){
   if(msg.path&&state.selected?.path!==msg.path)return;
   state.challengePending=false;state.challenge=msg.challenge;
   showReferencePreview();showActions();
  }
  else if(msg.type==='libraryQualityHistory'){
   if(state.selected?.path!==msg.path)return;
   state.qualityResults=Array.isArray(msg.entries)?msg.entries:[];
   state.qualityCurrent=state.qualityResults[0]||null;
   renderQuality(state.qualityCurrent);renderQualityHistory();
   if(state.qualityCurrent&&state.overallView==='quality')showOverallScore(state.imageCurrent);
  }
  else if(msg.type==='libraryQualityResult'){
   if(msg.requestId!==state.qualityRequestId)return;
   state.qualityRunning=false;showActions();
   if(state.selected?.path!==msg.path)return;
   state.qualityResults.unshift(msg.result);state.qualityCurrent=msg.result;state.overallView='quality';
   renderQuality(msg.result);renderQualityHistory();showOverallScore(state.imageCurrent);
  }
  else if(msg.type==='libraryQualityFailure'){
   if(msg.requestId&&msg.requestId!==state.qualityRequestId)return;
   state.qualityRunning=false;showActions();
   if(state.selected?.path!==msg.path)return;
   $('libraryQualityStatus').textContent='Quality benchmark could not complete: '+msg.message;
  }
  else if(msg.type==='libraryImageModels'){
   const sel=$('libraryImageModel'),prev=sel.value||'configured';sel.replaceChildren();
   state.imageModelList=Array.isArray(msg.models)?msg.models:[];
   state.configuredVision=msg.configured||{visionStatus:'unverified',visionReason:'Model capability not detected.'};
   const statusLabel=status=>status==='verified'?'Verified vision':status==='supported'?'Vision declared':status==='unsupported'?'No image input':'Unverified vision';
   const base=document.createElement('option');base.value='configured';base.textContent='Configured model · '+statusLabel(state.configuredVision.visionStatus);sel.append(base);
   for(const m of state.imageModelList){const o=document.createElement('option');o.value=m.id;o.textContent=m.label+' · '+statusLabel(m.visionStatus);sel.append(o);}
   sel.value=[...sel.options].some(o=>o.value===prev)?prev:'configured';
   const qs=$('libraryQualityModel');if(qs){const old=qs.value||'configured';qs.replaceChildren();
    const configured=document.createElement('option');configured.value='configured';configured.textContent='Configured model';qs.append(configured);
    for(const model of state.imageModelList){const option=document.createElement('option');option.value=model.id;option.textContent=model.label;qs.append(option);}
    qs.value=[...qs.options].some(o=>o.value===old)?old:'configured';}
   showVisionSupport();
  }
  else if(msg.type==='libraryImageVisionProbeResult'){
   if(msg.requestId!==state.visionProbeId)return;
   state.visionProbePending=false;
   if(state.selected?.path!==msg.path){showActions();return;}
   const vision={visionStatus:msg.result?.status||'unverified',visionReason:msg.result?.reason||'',visionVerifiedAt:msg.result?.checkedAt||''};
   if(msg.modelChoice==='configured')state.configuredVision=vision;
   else {const item=state.imageModelList.find(x=>x.id===msg.modelChoice);if(item)Object.assign(item,vision);}
   showVisionSupport();showActions();
   send('libraryImageModels',{});
  }
  else if(msg.type==='libraryImageHistory'){
   if(state.selected?.path!==msg.path)return;
   state.imageResults=Array.isArray(msg.entries)?msg.entries:[];state.codeDrafts.clear();renderImageHistory();renderImageResult(state.imageResults[0]||null);showActions();
  }
  else if(msg.type==='libraryImageResult'){
   if(msg.requestId!==state.imageRequestId)return;
   state.imageRunning=false;showActions();
   if(state.selected?.path!==msg.path)return;
   state.imageResults.unshift(msg.result);renderImageHistory();renderImageResult(msg.result);
   $('libraryImageTestStatus').textContent='Geometry and image-grounding evaluation recorded.';
  }
  else if(msg.type==='libraryImageReplayResult'){
   state.replayRunning=false;
   if(state.selected?.path!==msg.path||state.imageCurrent?.id!==msg.id)return;
   if(msg.error){$('libraryImageReplayStatus').textContent='Code replay failed: '+msg.error;}
   else if(msg.result){
    const idx=state.imageResults.findIndex(x=>x.id===msg.id);
    if(idx>=0)state.imageResults[idx]=msg.result;
    renderImageResult(msg.result);
    $('libraryImageReplayStatus').textContent='';
   }
   showImageCode();
  }
  else if(msg.type==='libraryImageVerdict'){
   if(state.selected?.path!==msg.path)return;
   const idx=state.imageResults.findIndex(x=>x.id===msg.result.id);if(idx>=0)state.imageResults[idx]=msg.result;
   renderImageHistory();renderImageResult(msg.result);$('libraryImageTestStatus').textContent='Verdict recorded for '+msg.result.model+'.';
  }
  else if(msg.type==='libraryImageFailure'){
   if(msg.requestId&&msg.requestId!==state.imageRequestId)return;
   if(state.selected?.path!==msg.path)return;
   if(!msg.requestId){state.challengePending=false;state.challenge=null;showReferencePreview();}
   state.imageRunning=false;showActions();
   $('libraryImageTestStatus').textContent='Image test failed: '+msg.message;
  }
  else if(msg.type==='libraryHarnessResult'){
   const pending=state.harnessPending;
   if(!pending||pending.id!==msg.requestId||pending.path!==msg.path||pending.scope!==msg.scope||state.selected?.path!==msg.path||pending.content!==content())return;
   state.harnessPending=null;showActions();
   if(msg.error){state.staticChecks=[{label:'Context',status:'fail',detail:msg.error}];setHarnessProgress(0,4,'Checks could not run','Fix the configuration or retry; no tests completed.');renderCombinedChecks();return;}
   const report=msg.report||{};
   const resultChecks=report.checks||[];state.staticChecks=resultChecks;
   const passed=resultChecks.filter(x=>x.status==='pass').length,failed=resultChecks.filter(x=>x.status==='fail').length,untested=resultChecks.filter(x=>x.status!=='pass'&&x.status!=='fail').length;
   setHarnessProgress(passed,4,failed?`${failed} configuration check(s) failed`:untested?'Configuration partially verified':'Configuration checks passed',`${passed} passed · ${failed} failed · ${untested} not tested (out of 4). Live agent traces still required.`);
   renderCombinedChecks();
  }
  else if(msg.type==='libraryEditorHealth'){
   const label=$('libraryEditorRuntime');
   if(label){label.textContent=msg.ready?'CodeMirror ready':'CodeMirror unavailable'+(msg.reason?' · '+msg.reason:'');label.className='library-language-badge'+(msg.ready?'':' library-editor-error');}
  }
  else if(msg.type==='libraryError') {state.busy=false;state.syncing=false;invalidate();showActions();setStatus(msg.message||'Library operation failed.',true);} 
  else if(msg.type==='librarySyncResult'){
   state.busy=false;state.syncing=false;
   if(msg.clearSelection){
    state.selected=null;state.editing=false;putContent('');invalidate();clearHarnessResults();editorLanguage('');
    $('libraryResourceTitle').textContent='Select a resource';
    $('libraryResourceMeta').textContent='Choose a catalog item to preview its instructions.';
    $('libraryEditNotice').textContent='Select a resource to preview it. Click Edit before changing any content.';
    $('libraryUpdateBadge').classList.add('hidden');
    $('libraryComparePanel').classList.add('hidden');$('libraryComparison').replaceChildren();
   }
   showActions();list();setStatus(msg.message||'Catalog sync completed.',!msg.success);
  }
  else if(msg.type==='libraryAction'){
   state.busy=false;showActions();state.prUrl=msg.url||'';
   setStatus((msg.message||'')+(msg.url?' Draft PR: '+msg.url:''));
  }
  else if(msg.type==='catalogAction'&&msg.action==='check'&&document.querySelector('#libraryView:not(.hidden)')){
   setStatus(msg.message||'Catalog update check complete. Review updates in Settings.');
  }
 });
 showActions();
 window.atgvLibraryStudio={refresh,isDirty,getContent:content,hasCodeMirror:!!cm};
 send('libraryWebviewBoot',{hasCodeMirror:!!cm,loadErrors:window.atgvLibraryAssetFailures||[]});
})();
