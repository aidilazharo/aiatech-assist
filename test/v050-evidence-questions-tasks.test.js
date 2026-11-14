'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../src/change-engine');
const {matchEvidence}=require('../src/evidence-link');
test('question records are individually traceable, evidence never linked indiscriminately, task records have permanent paths',()=>{
 const evidence={digest:'a'.repeat(64),name:'customer.docx',passage:'Customers register their accounts with secure mobile authentication for every new account.',verified:true,passageIndex:0};
 const state={discoveryRevision:'v1',discoveryAnswers:{problem:'Customer registration',scope:'Customer registration'},sourceDocuments:[{name:'customer.docx',digest:'a'.repeat(64)},{name:'billing.pdf',digest:'b'.repeat(64)}],processedSources:['a'.repeat(64),'b'.repeat(64)],brs:[{id:'BR-001',title:'Customer registration',objective:'Customer registration',features:[{id:'F-001',title:'Account',description:'Create account',stories:[{id:'S-001',title:'Register',description:'Onboarding',tasks:[{id:'T-001',title:'Verify phone',description:'Send OTP'}]}]}],evidence:[evidence],questionRefs:['problem','scope']}],synced:{}};
 const graph=engine.graph(state);
 assert.equal(graph.records.filter(x=>x.type==='question').length,12);
 assert.equal(graph.records.filter(x=>x.type==='task').length,1);
 assert.ok(graph.edges.some(x=>x.from==='QUESTION:problem'&&x.to==='BR-001'));
 assert.equal(graph.edges.filter(x=>x.relation==='supports').length,1);
 assert.equal(graph.edges.filter(x=>x.from==='SOURCE:'+('b'.repeat(64))&&x.relation==='contains-evidence').length,0);
 assert.equal(engine.coverage(graph).missingEvidence.length,0);
});
test('evidence matcher needs distinct matching terms and never invents excerpts',()=>{
 const source={name:'account.docx',digest:'a'.repeat(64),text:'Customers register their accounts with secure mobile authentication for every new account.\n\nThe warehouse contains refrigerated storage devices.'};
 const result=matchEvidence({title:'Customer account registration',objective:'Secure customer registration with mobile authentication',scope:'New accounts',features:[]},source);
 assert.ok(result.length>0);
 assert.ok(result.every(x=>source.text.includes(x.passage)));
 assert.equal(matchEvidence({title:'Quantum reactor deployment',objective:'Plasma confinement in vacuum',scope:'Reactor core'},source).length,0);
});
