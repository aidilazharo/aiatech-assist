'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const benchmark=require('../src/agent-image-test');
const ui=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media/library-studio.css'),'utf8');

test('overall benchmark includes both geometry and vision, never static configuration checks',()=>{
 assert.deepEqual(benchmark.overallBenchmarkScore({accuracy:{score:100},vision:{status:'fail',score:50}}),{
  status:'complete',score:75,geometryScore:100,visualScore:50,completedComponents:2,totalComponents:2,method:'geometry-50_visual-grounding-50'
 });
 assert.equal(benchmark.overallBenchmarkScore({accuracy:{score:30},vision:{status:'pass',score:100}}).score,65);
 assert.equal(benchmark.overallBenchmarkScore({accuracy:{score:100},vision:{status:'unsupported'}}).score,null);
 assert.equal(benchmark.overallBenchmarkScore({accuracy:{score:100}}).score,null);
 assert.equal(benchmark.overallBenchmarkScore({accuracy:{score:0},vision:{status:'fail',score:0}}).score,0);
});

test('new benchmark records store an overall result for audit and model comparisons',()=>{
 const challenge=benchmark.makeRandomChallenge('overall-score-history','medium'),questions=benchmark.visualQuestions(challenge);
 const vision=benchmark.gradeVisualAnswer(JSON.stringify({existingColor:'#0000ff',missingColor:'none'}),questions);
 const result=benchmark.makeRecord({agentPath:'ai-harness/agents/business-analyst.json',model:'Model X',target:{kind:'vscode',model:{id:'x'}},spec:challenge.spec,prompt:challenge.prompt,challenge,startedAt:'2026-11-15T00:00:00Z',durationMs:1,vision});
 assert.equal(result.overallBenchmark.geometryScore,100);
 assert.equal(result.overallBenchmark.visualScore,vision.score);
 assert.equal(result.overallBenchmark.score,Math.round((100+vision.score)/2));
 assert.equal(result.vision.answers.missingColor,'none');
});

test('the overall score is on the same title row as the agent, not inside visual hallucination section',()=>{
 assert.match(html,/class="section-title library-resource-title-row"[\s\S]*id="libraryResourceTitle"[\s\S]*id="libraryOverallScore"/);
 assert.match(css,/\.library-resource-title-row\{align-items:center;flex-wrap:nowrap\}/);
 assert.match(ui,/function showOverallScore\(result\)/);
 assert.match(ui,/showOverallScore\(result\)/);
 assert.doesNotMatch(ui,/heading\.textContent='Visual grounding \/ false-premise'[\s\S]{0,300}library-vision-score/);
 assert.match(ui,/Overall = 50% geometry replication \+ 50% visual grounding/);
});

test('each visual question is paired with a model answer, expected value and pass/fail',()=>{
 assert.match(ui,/const questions=Array\.isArray\(outcome\.questions\)/);
 assert.match(ui,/answer:answers\.existingColor,expected:expected\.existingColor,passed:outcome\.groundedAnswer/);
 assert.match(ui,/answer:answers\.missingColor,expected:expected\.missingColor,passed:outcome\.falsePremiseRejected/);
 assert.match(ui,/Model answer: /);
 assert.match(ui,/Expected: /);
 assert.doesNotMatch(ui,/textContent='Model: '\+outcome\.response/);
});

test('webview displays 75% overall beside agent and readable answers to both questions',()=>{
 const vm=require('node:vm');
 class E{
  constructor(){this.value='';this.textContent='';this.disabled=false;this.readOnly=false;this.children=[];this.options=[];this.style={};this.listeners={};this.attributes={};
   const cls=new Set();this.classList={contains:k=>cls.has(k),add:k=>cls.add(k),remove:k=>cls.delete(k),toggle:(k,v)=>{v=v===undefined?!cls.has(k):v;v?cls.add(k):cls.delete(k);return v;}};
  }
  addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
  append(...args){this.children.push(...args);this.options.push(...args);}
  replaceChildren(...args){this.children=[...args];this.options=[...args];}
  setAttribute(k,v){this.attributes[k]=v;}
  getAttribute(k){return this.attributes[k]??null;}
  focus(){}
  remove(){}
 }
 const el=new Map(),events={},get=id=>{if(!el.has(id))el.set(id,new E());return el.get(id)};
 get('libraryCategory').value='All';get('libraryScope').value='user';get('libraryScope').options=[{text:'User',value:'user'}];
 const tabs=['svg','typescript','csharp','java'].map(language=>{const el=new E();el.setAttribute('data-code-language',language);return el;});
 vm.runInNewContext(ui,{window:{addEventListener:(k,f)=>events[k]=f},document:{getElementById:get,createElement:()=>new E(),querySelectorAll:()=>tabs},send:()=>{},encodeURIComponent},{timeout:2000});
 const recv=msg=>events.message({data:msg});
 const pathName='ai-harness/agents/business-analyst.json';
 recv({type:'libraryResource',value:{path:pathName,category:'AI Harness',content:'{}',shared:'{}',hash:'x',scope:'user',source:'shared'}});
 const challenge=benchmark.makeRandomChallenge('color-test-example','medium');
 const q=benchmark.visualQuestions(challenge);
 const wrong=q.expected.existingColor==='#0000ff'?'#990099':'#0000ff';
 const vision=benchmark.gradeVisualAnswer(JSON.stringify({existingColor:wrong,missingColor:'none'}),q);
 const record=benchmark.makeRecord({agentPath:pathName,model:'Example model',target:{kind:'vscode',model:{id:'example'}},spec:challenge.spec,prompt:challenge.prompt,challenge,startedAt:'2026-11-15T00:00:00Z',durationMs:2,vision});
 recv({type:'libraryImageHistory',path:pathName,entries:[record]});
 assert.equal(get('libraryResourceTitle').textContent,'Business Analyst Agent');
 assert.equal(get('libraryOverallScoreValue').textContent,'75%');
 assert.match(get('libraryOverallScoreDetail').textContent,/Geometry: 100%/);
 assert.match(get('libraryOverallScoreDetail').textContent,/Vision: 50%/);
 const host=get('libraryVisualQuestions');
 const rows=host.children.filter(c=>c.className==='library-vision-answer-row');
 assert.equal(rows.length,2);
 assert.equal(rows[0].children[0].children[1].textContent,'Fail');
 assert.match(rows[0].children[2].textContent,/#/);
 assert.match(rows[0].children[3].textContent,/Expected: #/);
 assert.equal(rows[1].children[0].children[1].textContent,'Pass');
 assert.match(rows[1].children[2].textContent,/none \(no such shape\)/);
});
