'use strict';
// Build-only optimization with vendored Acorn. Preserve token spelling and AST.
const acorn=require('../src/vendor/acorn');
const lineBreak=/[\r\n\u2028\u2029]/, wordChar=/[\w$\u0080-\uffff]/;
const opts={ecmaVersion:'latest',sourceType:'script',allowHashBang:true,allowReturnOutsideFunction:true};
const fingerprint=ast=>JSON.stringify(ast,(key,value)=>['start','end','loc','range'].includes(key)?undefined:typeof value==='bigint'?String(value)+'n':value);
function javascript(input,conservative=false){
 const tokens=[],comments=[],inserted=new Set();
 const original=acorn.parse(input,{...opts,onToken:tokens,onComment:comments,onInsertedSemicolon:pos=>inserted.add(pos)});
 const keep=comments.filter(c=>/^!|@license|@preserve|copyright/i.test(c.value.trim())||input.slice(c.start,c.start+2)==='#!');
 const entries=[...tokens.filter(t=>t.type.label!=='eof'),...keep].sort((a,b)=>a.start-b.start);
 let out='',prev=null;
 for(const entry of entries){
  const raw=input.slice(entry.start,entry.end);
  if(prev){
   const gap=input.slice(prev.end,entry.start),a=input[prev.end-1],b=raw[0];
   if(prev.type==='Line'||lineBreak.test(gap)&&(conservative||inserted.has(prev.end)||input.slice(prev.start,prev.end)==='async'))out+='\n';
   else if(gap&&(wordChar.test(a)&&wordChar.test(b)||/[+\-/.<>=!&|?*]/.test(a)&&/[+\-/.<>=!&|?*]/.test(b)||/\d/.test(a)&&b==='.'||a==='.'&&/\d/.test(b)))out+=' ';
  }
  out+=raw;prev=entry;
 }
 out+='\n';
 try{
  const afterTokens=[],after=acorn.parse(out,{...opts,onToken:afterTokens});
  const tokenRaw=(text,list)=>list.filter(t=>t.type.label!=='eof').map(t=>text.slice(t.start,t.end));
  if(fingerprint(after)!==fingerprint(original)||JSON.stringify(tokenRaw(input,tokens))!==JSON.stringify(tokenRaw(out,afterTokens)))return conservative?input:javascript(input,true);
  return out;
 }catch{return conservative?input:javascript(input,true);}
}
function css(input){
 // Remove indentation only outside strings, comments and escaped characters.
 let out='',quote='',comment=false,lineStart=true;
 for(let i=0;i<input.length;i++){
  const c=input[i],n=input[i+1];
  if(c==='\\'){out+=c+(n||'');i++;lineStart=false;continue;}
  if(comment){out+=c;if(c==='*'&&n==='/'){out+=n;i++;comment=false;}continue;}
  if(quote){out+=c;if(c===quote)quote='';continue;}
  if(c==='/'&&n==='*'){out+=c+n;i++;comment=true;lineStart=false;continue;}
  if(c==='"'||c==="'"){quote=c;out+=c;lineStart=false;continue;}
  if(c==='\r'||c==='\n'){out+=c;lineStart=true;continue;}
  if(lineStart&&(c===' '||c==='\t'))continue;
  out+=c;lineStart=false;
 }
 return out;
}
module.exports={javascript,css};
