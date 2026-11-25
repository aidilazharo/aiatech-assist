'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {reconstructSource}=require('../scripts/generate-source-test-index');
const root=path.resolve(__dirname,'..');
const lf=text=>text.replace(/\r\n/g,'\n');
const crlf=text=>lf(text).replace(/\n/g,'\r\n');
const runtime=lf(fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8'));
const renderer=lf(fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8'));
test('source test index is identical for LF, CRLF and mixed checkouts',()=>{
 const expected=reconstructSource(runtime,renderer);
 assert.ok(expected.includes('function html(webview,{resumeLibrary=false}={}){'));
 assert.ok(!expected.includes('\r\n'));
 assert.equal(reconstructSource(crlf(runtime),crlf(renderer)),expected);
 assert.equal(reconstructSource(crlf(runtime),renderer),expected);
 assert.equal(reconstructSource(runtime,crlf(renderer)),expected);
});
test('missing source marker or renderer boundary fails with targeted diagnostics',()=>{
 assert.throws(()=>reconstructSource('',renderer),/runtime import marker/);
 assert.throws(()=>reconstructSource(runtime,''),/renderer function start/);
});
