'use strict';
// Safe, self-contained read-only component index. It never executes or embeds
// HTML, CSS, or JavaScript supplied by a remote GitHub catalog.
function escapeHtml(value) {return String(value??'').replace(/[&<>"']/g,match=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[match]));}
function render(catalog,source={}) {
 if(!catalog||!Array.isArray(catalog.components)||!catalog.components.length||catalog.components.length>200)throw Error('The approved catalog does not contain a valid component inventory.');
 const groups=new Map();
 for(const item of catalog.components){
  if(!item||typeof item.name!=='string'||!item.name.trim()||item.name.length>130||typeof item.category!=='string'||item.category.length>80)throw Error('Invalid component entry in approved catalog.');
  const group=item.category.toLowerCase();if(!groups.has(group))groups.set(group,[]);groups.get(group).push(item);
 }
 const heading=(source.repository||'Approved SDLC Catalog')+' / '+(source.ref||'main');
 const frameworkId=String(source.frameworkId||'aia-qi');
 const isQi=frameworkId==='aia-qi';
 const label=String(source.frameworkLabel||(isQi?'AIA Qi':frameworkId)).slice(0,80);
 const cards=[...groups].map(([name,items])=>`<section class="group"><h2>${escapeHtml(name)} <span>${items.length}</span></h2><div class="cards">${items.map(item=>{
  const classes=Array.isArray(item.classes)?item.classes.slice(0,30).filter(x=>typeof x==='string').map(x=>`<code>${escapeHtml(x.slice(0,100))}</code>`).join(' '):'';
  const entries=[['Purpose',item.use],['Semantics',item.semantic],['States',Array.isArray(item.states)?item.states.join(' · '):''],['Interaction',item.behavior],['API',item.api]]
   .filter(([,v])=>typeof v==='string'&&v.trim()).map(([title,v])=>`<p><strong>${title}:</strong> ${escapeHtml(v.slice(0,500))}</p>`).join('');
  return `<article><h3>${escapeHtml(item.name)}</h3>${entries}<div class="classes">${classes||'<span>Semantic HTML</span>'}</div></article>`;
 }).join('')}</div></section>`).join('');
 const style=`:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#1f2024;color:#e8e9ea}body{margin:0;padding:32px;max-width:1250px;margin-inline:auto}h1{font-size:28px;margin:0 0 10px}h2{font-size:18px;text-transform:capitalize;display:flex;justify-content:space-between;color:#dfe2e7}h2 span{font-size:13px;color:#9ca7b2}h3{font-size:16px;margin:0 0 13px}p{line-height:1.5;color:#bec6d0}p strong{color:#e6e8eb}.sub{font-size:13px;color:#b4bcc7;margin-bottom:25px;line-height:1.7}.notice{background:#292c32;border-left:3px solid #e5ba50;border-radius:5px;padding:12px 16px;margin:25px 0}.group{margin:28px 0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}article{border:1px solid #444951;border-radius:10px;background:#282a30;padding:18px;min-width:0}article p{font-size:13px;margin:7px 0}.classes{margin-top:12px;display:flex;flex-wrap:wrap;gap:5px}code{font:12px ui-monospace,monospace;background:#343b46;color:#b5d7ff;padding:5px 7px;border-radius:4px;overflow-wrap:anywhere}.meta{font-size:12px;color:#a8b4c1}.count{font-weight:bold;color:#66d7b2}a{color:inherit}`;
 return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-atgv-local-style'; base-uri 'none'; form-action 'none'; frame-src 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(label)} Component Catalogue</title><style nonce="atgv-local-style">${style}</style></head><body><div class="meta">ATGV · UI/UX Designer / SDLC Catalogue</div><h1>${escapeHtml(label)} component catalogue</h1><div class="sub">Source: ${escapeHtml(heading)}<br>Snapshot: ${escapeHtml(source.sha||'unknown')} · Catalog ${escapeHtml(source.version||'unknown')} · Kit ${escapeHtml(catalog.version||'unknown')} · <span class="count">${catalog.components.length} components</span></div><div class="notice"><strong>${isQi?'Independent Qi-inspired adaptation, not an official AIA Qi component library.':'Offline framework component reference, from approved GitHub catalog assets.'}</strong><p>Inventory, classes and usage metadata are loaded from the version-pinned GitHub SDLC Catalog. This page displays safe reference metadata; it does not execute downloaded templates or scripts.${isQi?' Production usage requires design-owner approval.':''}</p></div>${cards}</body></html>`;
}
module.exports={render,escapeHtml};
