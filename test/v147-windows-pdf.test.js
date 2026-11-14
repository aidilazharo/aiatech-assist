'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const importer=require('../src/discovery-import');
const {extractOfflinePdfText}=require('../src/pdf-offline-extractor');
const NO_POPPLER=async()=>{throw Object.assign(new Error('pdftotext.exe is not installed'),{code:'ENOENT'});};
function a85(b){
 let out='';for(let i=0;i<b.length;i+=4){const n=Math.min(4,b.length-i);let v=0;for(let j=0;j<4;j++)v=v*256+(j<n?b[i+j]:0);
  if(n===4&&v===0){out+='z';continue;}
  let chars='';for(let j=0;j<5;j++){chars=String.fromCharCode(33+(v%85))+chars;v=Math.floor(v/85);}out+=chars.slice(0,n+1);
 }return Buffer.from(out+'~>','latin1');
}
function buildPdf({text='Process documents in a controlled workflow.',filter='flate',withMap=false,imageOnly=false}={}){
 const content=imageOnly?'q 1 0 0 1 0 0 cm /Im1 Do Q':withMap?'BT /TT2 12 Tf <21> Tj ET':`BT /F1 12 Tf (${text}) Tj ET`;
 let raw=Buffer.from(content,'latin1');let spec='';
 if(filter==='flate'){raw=zlib.deflateSync(raw);spec='/Filter /FlateDecode ';}
 if(filter==='ascii85flate'){raw=a85(zlib.deflateSync(raw));spec='/Filter [ /ASCII85Decode /FlateDecode ] ';}
 const front=Buffer.from(`%PDF-1.4\n1 0 obj\n<< ${spec}/Length ${raw.length} >>\nstream\n`,'latin1');
 let data=Buffer.concat([front,raw,Buffer.from('\nendstream\nendobj\n2 0 obj\n<< /F1 3 0 R /TT2 4 0 R >>\nendobj\n3 0 obj\n<< /Type /Font /Subtype /Type1 /Name /F1 >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /TrueType /ToUnicode 5 0 R >>\nendobj\n','latin1')]);
 if(withMap){const cmap=Buffer.from('1 beginbfchar\n<21> <0047>\nendbfchar','latin1');data=Buffer.concat([data,Buffer.from(`5 0 obj\n<< /Length ${cmap.length} >>\nstream\n`,'latin1'),cmap,Buffer.from('\nendstream\nendobj\n')]);}
 return data;
}
test('Windows: bundled parser imports Flate-only PDF without Poppler or Swift',async()=>{
 const data=buildPdf({filter:'flate'});
 const result=await importer.extractPdf('C:\\docs\\req.pdf',data,{platform:'win32',run:NO_POPPLER});
 assert.match(result,/Process documents in a controlled workflow/);
});
test('Windows: compressed ASCII85 + Flate PDF imports without external binaries',async()=>{
 const data=buildPdf({filter:'ascii85flate'});
 assert.match(extractOfflinePdfText(data),/Process documents in a controlled workflow/);
 assert.match(await importer.extractPdf('C:\\docs\\spec.pdf',data,{platform:'win32',run:NO_POPPLER}),/controlled workflow/);
});
test('Windows: embedded ToUnicode CMap decoded instead of raw glyph code',async()=>{
 const data=buildPdf({filter:'flate',withMap:true});
 assert.equal(extractOfflinePdfText(data),'G');
 assert.equal(await importer.extractPdf('C:\\docs\\spec.pdf',data,{platform:'win32',run:NO_POPPLER}),'G');
});
test('Windows: image-only PDFs produce helpful OCR error rather than invalid text',async()=>{
 const data=buildPdf({imageOnly:true});
 await assert.rejects(importer.extractPdf('C:\\docs\\scan.pdf',data,{platform:'win32',run:NO_POPPLER}),/No extractable PDF text.*OCR/);
});
test('Windows: incorrect and oversized PDFs are rejected',async()=>{
 await assert.rejects(importer.extractPdf('C:\\bad.pdf',Buffer.from('not a PDF'),{platform:'win32',run:NO_POPPLER}),/valid PDF/);
 await assert.rejects(importer.importDocumentText('C:\\big.pdf',{readFile:async()=>Buffer.alloc(importer.MAX_FILE_BYTES+1)}),/12 MB|Choose a/);
});
