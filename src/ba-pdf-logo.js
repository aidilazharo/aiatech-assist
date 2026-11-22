'use strict';
// Decode a packaged ATGV PNG mark for a self-contained PDF Image XObject.
// No third-party packages or external requests. Unexpected formats gracefully
// fall back to the vector AI monogram in ba-iso29148-pdf.js.
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
function paeth(a,b,c){
 const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);
 return aa<=bb&&aa<=cc?a:bb<=cc?b:c;
}
function decodePng(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<45||!bytes.subarray(0,8).equals(SIGNATURE))throw Error('Not a PNG logo.');
 let pos=8,width=0,height=0,bitDepth=0,colorType=0,palette=null,alphaPalette=null,interlace=0;
 const chunks=[];
 while(pos+12<=bytes.length){
  const length=bytes.readUInt32BE(pos),type=bytes.toString('ascii',pos+4,pos+8);
  if(length>4*1024*1024||pos+12+length>bytes.length)throw Error('Invalid logo PNG chunk.');
  const data=bytes.subarray(pos+8,pos+8+length);pos+=12+length;
  if(type==='IHDR'){
   width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];interlace=data[12];
  }else if(type==='IDAT')chunks.push(data);
  else if(type==='PLTE')palette=Buffer.from(data);
  else if(type==='tRNS')alphaPalette=Buffer.from(data);
  else if(type==='IEND')break;
 }
 if(width<1||height<1||width>2048||height>2048||bitDepth!==8||interlace!==0||!chunks.length)
  throw Error('Unsupported logo PNG dimensions, bit depth or interlace.');
 const channels=({0:1,2:3,3:1,4:2,6:4})[colorType];
 if(!channels)throw Error('Unsupported logo PNG color type.');
 const stride=width*channels,raw=zlib.inflateSync(Buffer.concat(chunks),{maxOutputLength:(stride+1)*height+1024});
 if(raw.length!==(stride+1)*height)throw Error('Invalid decompressed logo PNG length.');
 const rgb=Buffer.alloc(width*height*3),prior=Buffer.alloc(stride),cur=Buffer.alloc(stride);
 let input=0,output=0;
 for(let row=0;row<height;row++){
  const filter=raw[input++];
  for(let j=0;j<stride;j++){
   const a=j>=channels?cur[j-channels]:0,b=prior[j],c=j>=channels?prior[j-channels]:0;
   const predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):NaN;
   if(!Number.isFinite(predictor))throw Error('Unsupported PNG scanline filter.');
   cur[j]=(raw[input++]+predictor)&255;
  }
  for(let col=0;col<width;col++){
   const offset=col*channels;let r,g,b,a=255;
   if(colorType===6){r=cur[offset];g=cur[offset+1];b=cur[offset+2];a=cur[offset+3];}
   else if(colorType===2){r=cur[offset];g=cur[offset+1];b=cur[offset+2];}
   else if(colorType===4){r=g=b=cur[offset];a=cur[offset+1];}
   else if(colorType===0){r=g=b=cur[offset];}
   else{
    const ix=cur[offset];r=palette?.[ix*3]??255;g=palette?.[ix*3+1]??255;b=palette?.[ix*3+2]??255;
    a=alphaPalette?.[ix]??255;
   }
   // PDF logo mark is placed on a white tile, so flatten alpha to white.
   rgb[output++]=Math.round((r*a+255*(255-a))/255);
   rgb[output++]=Math.round((g*a+255*(255-a))/255);
   rgb[output++]=Math.round((b*a+255*(255-a))/255);
  }
  cur.copy(prior);
 }
 return {width,height,data:zlib.deflateSync(rgb,{level:9})};
}
function loadPackagedLogo(){
 // The red extension icon is visible on the PDF's white logo tile.
 try{
  const buffer=fs.readFileSync(path.resolve(__dirname,'../assets/icon.png'));
  return buffer.length<=4*1024*1024?decodePng(buffer):null;
 }catch{return null;}
}
module.exports={decodePng,loadPackagedLogo};
