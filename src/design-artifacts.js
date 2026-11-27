'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { toDrawioXml, normalizeModel, screenFlowDiagram } = require('./diagram-model');
const { validate, markdown, KINDS } = require('./design-proposals');
const { sha } = require('./utils');
const html = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = v => JSON.stringify(v, null, 2) + '\n';
const ident = v => /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(String(v || '')) ? `"${v}"` : null;
const safeName = v => String(v || '').replace(/[^a-z0-9_-]/gi, '-').slice(0, 60);
const defaultTokens = { colors: { primary: '#3267B0', background: '#F5F7FA', surface: '#FFFFFF', text: '#202936', border: '#D6DEE8' }, typography: { fontFamily: 'system-ui, sans-serif', baseSizePx: 14 }, spacing: { unitPx: 4 }, radii: { cardPx: 8, fieldPx: 6 } };
function tokenData(d) { return { ...defaultTokens, ...(d.tokens || {}), colors: { ...defaultTokens.colors, ...(d.tokens?.colors || {}) } }; }
function sqlType(type) {
    const raw = String(type || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (/^(UUID|TEXT|BOOLEAN|DATE|TIMESTAMP|TIMESTAMPTZ|INTEGER|INT|BIGINT|SMALLINT|REAL|DOUBLE PRECISION|JSONB|JSON|BYTEA|SERIAL|BIGSERIAL|TIME)$/.test(raw))
        return raw === 'INT' ? 'INTEGER' : raw;
    if (/^VARCHAR\([1-9][0-9]{0,4}\)$/.test(raw) && Number(raw.slice(8, -1)) <= 10485760)
        return raw;
    if (/^CHAR\([1-9][0-9]{0,3}\)$/.test(raw))
        return raw;
    if (/^NUMERIC\([1-9][0-9]?(?:,[0-9]{1,2})?\)$/.test(raw))
        return raw;
    return null;
}
function schemaSql(d) {
    const lines = ['-- Proposed PostgreSQL DDL. Review types, permissions, migrations and data handling before applying.', '-- Generated from a reviewable design; it has NOT been executed.', ''];
    const tables = new Map();
    for (const entity of d.entities) {
        const table = ident(entity.name);
        if (!table)
            throw Error('SQL generation requires entity names using ASCII letters, numbers and underscores (starting with a letter or underscore).');
        if (tables.has(entity.name))
            throw Error('Duplicate SQL entity: ' + entity.name);
        tables.set(entity.name, entity);
        const cols = [];
        let pk = [];
        for (const field of entity.fields) {
            const name = ident(field.name);
            if (!name)
                throw Error(`Invalid SQL column name in ${entity.name}: ${field.name}`);
            const type = sqlType(field.type);
            if (!type)
                throw Error(`Unsupported SQL type ${field.type} on ${entity.name}.${field.name}. Edit the structured specification before exporting.`);
            if (cols.some(c => c.name === field.name))
                throw Error(`Duplicate column ${entity.name}.${field.name}`);
            cols.push({ name: field.name, sql: `  ${name} ${type}${field.required ? ' NOT NULL' : ''}` });
            if (field.key)
                pk.push(name);
        }
        lines.push(`CREATE TABLE IF NOT EXISTS ${table} (`, cols.map(c => c.sql).concat(pk.length ? [`  PRIMARY KEY (${pk.join(', ')})`] : []).join(',\n'), ');', '');
    }
    for (const entity of d.entities) {
        for (const relation of entity.relationships || []) {
            if (typeof relation === 'string')
                continue;
            if (!relation.target || !relation.field || !relation.targetField)
                continue;
            const foreign = entity.fields.find(f => f.name === relation.field);
            const parent = tables.get(relation.target);
            const primary = parent?.fields?.find(f => f.name === relation.targetField);
            if (!foreign || !primary)
                throw Error(`Invalid relationship ${entity.name}.${relation.field} → ${relation.target}.${relation.targetField}`);
            const constraint = `fk_${entity.name}_${relation.field}`.slice(0, 62);
            lines.push(`ALTER TABLE ${ident(entity.name)} ADD CONSTRAINT ${ident(constraint)} FOREIGN KEY (${ident(relation.field)}) REFERENCES ${ident(relation.target)} (${ident(relation.targetField)});`);
        }
    }
    return lines.join('\n') + '\n';
}
function erd(d) {
    const nodes = d.entities.map((e, i) => ({ id: `entity${i + 1}`, label: e.name + '\n' + e.fields.map(f => (f.key ? 'PK ' : '') + f.name + ': ' + f.type).join('\n').slice(0, 900), kind: 'entity', x: d.layout?.[e.name]?.x ?? 70 + (i % 3) * 320, y: d.layout?.[e.name]?.y ?? 70 + Math.floor(i / 3) * 225, width: 270, height: Math.min(195, Math.max(85, 30 + e.fields.length * 17)) }));
    const indexes = new Map(d.entities.map((e, i) => [e.name, `entity${i + 1}`]));
    const edges = [];
    d.entities.forEach((e, i) => (e.relationships || []).forEach(r => { if (typeof r === 'object' && indexes.has(r.target))
        edges.push({ id: `relation${edges.length + 1}`, from: `entity${i + 1}`, to: indexes.get(r.target), label: (r.cardinality || 'relationship') + (r.field ? ' · ' + r.field : '') }); }));
    return normalizeModel({ title: d.title + ' — Entity Relationship Diagram', nodes, edges });
}
function openapi(d) {
    const paths = {};
    for (const e of d.endpoints) {
        const method = e.method.toLowerCase(), p = paths[e.path] || (paths[e.path] = {});
        if (p[method])
            throw Error(`Duplicate endpoint ${e.method} ${e.path}`);
        const operation = { summary: e.operation || 'Proposed endpoint', description: 'Draft API design; verify request and response contracts before implementation.', tags: ['Proposed'], responses: { '200': { description: e.response || 'Proposed success response' }, '400': { description: 'Validation error (draft)' }, '401': { description: 'Authentication required where applicable' }, '500': { description: 'Unexpected server error' } } };
        if (e.request)
            operation.requestBody = { description: e.request, required: false, content: { 'application/json': { schema: e.requestSchema || { type: 'object', description: 'Draft schema. Confirm fields before implementation.' } } } };
        if (e.responseSchema)
            operation.responses['200'].content = { 'application/json': { schema: e.responseSchema } };
        if (e.authorization && e.authorization !== 'None' && e.authorization !== 'Public')
            operation.security = [{ bearerAuth: [] }];
        p[method] = operation;
    }
    return { openapi: '3.1.0', info: { title: d.title, version: '0.1.0', description: (d.summary || '') + '\nProposed design, not an implemented service.' }, servers: [{ url: 'https://example.invalid', description: 'Placeholder only; configure actual server before use' }], paths, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } };
}
function yaml(data, depth = 0) { const indent = ' '.repeat(depth); if (Array.isArray(data)) {
    if (!data.length)
        return '[]';
    return data.map(v => { if (v && typeof v === 'object') {
        const s = yaml(v, depth + 2);
        return indent + '-\n' + s;
    } return indent + '- ' + JSON.stringify(v); }).join('\n');
} if (data && typeof data === 'object') {
    const entries = Object.entries(data);
    if (!entries.length)
        return '{}';
    return entries.map(([k, v]) => { const key = JSON.stringify(k); if (v && typeof v === 'object' && Object.keys(v).length)
        return indent + key + ':\n' + yaml(v, depth + 2); return indent + key + ': ' + (v && typeof v === 'object' ? JSON.stringify(v) : JSON.stringify(v)); }).join('\n');
} return JSON.stringify(data); }
function screenHtml(d) {
    const cards = d.screens.map((s, i) => {
        const components = (s.components || []).map((c, j) => { const label = html(c); const lower = String(c).toLowerCase(); if (/(button|submit|save|cancel|sign in|login|search)/.test(lower))
            return `<button type="button" disabled>${label}</button>`; if (/(input|field|email|password|name|date|filter)/.test(lower))
            return `<label>${label}<input type="text" disabled placeholder="${label}" /></label>`; if (/(table|list|grid)/.test(lower))
            return `<div class="placeholder-grid"><span></span><span></span><span></span></div><div class="mock-text">${label}</div>`; return `<div class="component">${label}</div>`; }).join('\n');
        return `<section class="mock-screen" aria-labelledby="screen-${i}"><div class="mock-top"><span class="mock-dot"></span><span class="mock-dot"></span><span class="mock-dot"></span><small>Proposed screen ${i + 1}</small></div><div class="mock-content"><h2 id="screen-${i}">${html(s.name)}</h2><p>${html(s.purpose)}</p>${components}</div></section>`;
    }).join('\n');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${html(d.title)} — Draft mockups</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;padding:30px;background:#e9eef5;color:#1f2937;font:14px/1.5 system-ui,sans-serif}h1{margin:0 0 4px;font-size:25px}.notice{font-size:12px;color:#526175}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,350px),1fr));gap:24px;margin-top:24px}.mock-screen{background:white;border:1px solid #c6d1de;border-radius:12px;overflow:hidden;box-shadow:0 8px 30px #172b4d12}.mock-top{display:flex;align-items:center;gap:5px;background:#eef1f6;border-bottom:1px solid #dce4ed;padding:10px 13px}.mock-dot{width:9px;height:9px;border-radius:50%;background:#b4bfcc}.mock-top small{margin-left:auto;color:#59687b}.mock-content{padding:24px;min-height:320px}.mock-content h2{margin:0 0 8px;font-size:20px}.mock-content p{margin:0 0 22px;color:#536171}button,input,.component,.placeholder-grid{width:100%;margin:7px 0;border:1px solid #d3dde8;border-radius:7px;padding:11px;background:#f7f9fc;font:inherit}button{background:#3267b0;color:white;border:0;text-align:center;opacity:.9}label{display:block;font-weight:600;font-size:12px}label input{display:block;font-weight:400;color:#778}.placeholder-grid{display:flex;gap:8px}.placeholder-grid span{height:12px;flex:1;background:#cad6e4;border-radius:3px}.mock-text{font-size:12px;color:#536171}</style></head><body><h1>${html(d.title)}</h1><div class="notice">Static illustrative mockups generated for review, not functioning application screens.</div><main class="gallery">${cards}</main></body></html>\n`;
}
function prototypeHtml(d) {
    const screens = d.screens || [];
    const nav = screens.map((s, i) => `<button type="button" class="nav-btn${i === 0 ? ' active' : ''}" data-screen="${i}" aria-label="Go to ${html(s.name)}">${html(s.name)}</button>`).join('');
    const pages = screens.map((s, i) => {
        const components = (s.components || []).map((text, j) => {
            const label = html(text), lower = String(text).toLowerCase();
            if (/(table|grid|list|results)/.test(lower))
                return `<div class="sample-table"><strong>${label}</strong><div class="sample-row"><span>Example item</span><span>For review</span></div><div class="sample-row"><span>Sample record</span><span>Draft</span></div></div>`;
            if (/(input|field|email|password|date|filter|search|name|select|dropdown|textarea|description)/.test(lower))
                return `<label class="field">${label}<input type="text" placeholder="Enter ${label}" autocomplete="off"></label>`;
            if (/(button|submit|save|cancel|approve|reject|next|back|add|create|edit|delete|login|sign in|continue|view|open)/.test(lower))
                return `<button type="button" class="action-btn" data-action="${html(text)}">${label}</button>`;
            return `<div class="component">${label}</div>`;
        }).join('');
        return `<section class="page" data-page="${i}" ${i ? 'hidden' : ''}><div class="page-intro"><small>SCREEN ${i + 1} OF ${screens.length}</small><h2>${html(s.name)}</h2><p>${html(s.purpose)}</p></div><div class="components">${components}</div><div class="pager"><button type="button" class="prev" ${i === 0 ? 'disabled' : ''}>Previous</button><button type="button" class="next" ${i === screens.length - 1 ? 'disabled' : ''}>Next screen</button></div></section>`;
    }).join('');
    const flow = (d.flows || []).map(f => `<li>${html(f)}</li>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'"><title>${html(d.title)} — Interactive UI Prototype</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.55 system-ui,sans-serif;background:#edf2f8;color:#182535}button,input{font:inherit}button{cursor:pointer}.app{display:flex;min-height:100vh}.sidebar{width:245px;flex-shrink:0;background:#18283d;color:white;padding:22px 14px}.brand{font-size:14px;font-weight:800;margin:0 8px 4px}.sub{font-size:11px;color:#b2c2d8;margin:0 8px 25px}.nav-btn{display:block;width:100%;padding:12px;border:0;border-radius:7px;background:transparent;text-align:left;color:#dae7f6;margin:5px 0}.nav-btn.active,.nav-btn:hover{background:#37649b;color:#fff}.main{flex:1;min-width:0;padding:20px 30px;max-width:1150px}.notice{padding:10px 16px;background:#fff6db;border:1px solid #ead9a4;border-radius:8px;color:#725222;font-size:12px;margin-bottom:18px}.page{background:white;border:1px solid #d3dce7;border-radius:12px;min-height:510px;padding:30px;box-shadow:0 9px 24px #1527430a}.page-intro{border-bottom:1px solid #e1e6ef;padding-bottom:15px;margin-bottom:20px}.page-intro small{color:#55759a;font-weight:700;letter-spacing:1px}.page h2{font-size:25px;margin:6px 0}.page p{color:#526377;margin:0}.components{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:15px}.field{display:block;color:#34465b;font-size:12px;font-weight:600}.field input{display:block;margin-top:6px;width:100%;padding:12px;border:1px solid #b8c9de;border-radius:7px;background:#f9fbff}.component,.sample-table{padding:16px;border:1px solid #e0e6f0;border-radius:8px;background:#f7f9fc}.sample-row{display:flex;justify-content:space-between;border-top:1px solid #dce4ed;padding:8px 0;color:#526377}.action-btn,.pager button{background:#2362a5;color:white;border:0;border-radius:7px;padding:11px 18px;align-self:end}.pager{display:flex;justify-content:space-between;border-top:1px solid #e1e6ef;margin-top:25px;padding-top:18px}.pager button:disabled{background:#c7cdd6;cursor:default}.toast{position:fixed;right:20px;bottom:20px;border-radius:8px;background:#183958;color:white;padding:13px 17px;box-shadow:0 10px 35px #0003;display:none}.flow{font-size:12px;color:#435772;padding:16px 10px}.flow summary{cursor:pointer;font-weight:700}#flow-list{padding-left:23px}@media(max-width:720px){.app{flex-direction:column}.sidebar{width:100%}.nav{display:flex;overflow-x:auto;gap:6px}.nav-btn{min-width:160px}.main{padding:15px}.page{padding:18px}}</style></head><body><div class="app"><aside class="sidebar"><div class="brand">${html(d.title)}</div><p class="sub">Interactive draft · browser-only</p><nav class="nav" aria-label="Prototype screens">${nav}</nav><details class="flow"><summary>User journey notes</summary><ol id="flow-list">${flow}</ol></details></aside><main class="main"><div class="notice">Interactive design prototype for human review. Actions are simulated; no data is saved or sent to a service.</div>${pages}</main></div><div class="toast" role="status" aria-live="polite"></div><script>(function(){'use strict';const pages=[...document.querySelectorAll('[data-page]')],nav=[...document.querySelectorAll('[data-screen]')],toast=document.querySelector('.toast');let current=0;function show(i){if(i<0||i>=pages.length)return;current=i;pages.forEach((p,n)=>{p.hidden=n!==i});nav.forEach((b,n)=>{b.classList.toggle('active',n===i);b.setAttribute('aria-current',n===i?'page':'false')});window.scrollTo(0,0)}function announce(t){toast.textContent=t+' (simulated — no data saved)';toast.style.display='block'}nav.forEach(b=>b.addEventListener('click',()=>show(Number(b.dataset.screen))));pages.forEach(p=>{p.querySelector('.prev').addEventListener('click',()=>show(current-1));p.querySelector('.next').addEventListener('click',()=>show(current+1));p.querySelectorAll('.action-btn').forEach(b=>b.addEventListener('click',()=>{const action=b.dataset.action||'Action';if(/next|continue|open|view/i.test(action)&&current<pages.length-1)show(current+1);else if(/back|cancel/i.test(action)&&current>0)show(current-1);else announce(action)}))});show(0)})();</script></body></html>\n`;
}
function outputFiles(kind, source) {
    const d = validate(source, kind), files = { 'design-specification.md': markdown(d) + '\n', 'design-specification.json': json(d) };
    if (kind === 'design') {
        files['design-tokens.json'] = json(tokenData(d));
        files['components.json'] = json(d.screens.map(s => ({ screen: s.name, components: s.components, interactions: s.interactions })));
    }
    if (kind === 'ux') {
        const model = d.diagram || screenFlowDiagram(d.screens);
        files['user-flows.drawio'] = toDrawioXml(model);
        files['user-flows.json'] = json(model);
        files['user-flows.mmd'] = 'flowchart TD\n' + model.nodes.map(n => `  ${n.id}[${JSON.stringify(n.label.replace(/\n/g, ' '))}]`).join('\n') + '\n' + model.edges.map(e => `  ${e.from} --> ${e.to}`).join('\n') + '\n';
    }
    if (kind === 'mockup') {
        files['screen-mockups.html'] = prototypeHtml(d);
        files['screen-inventory.json'] = json(d.screens);
    }
    if (kind === 'prototype') {
        files['interactive-prototype.html'] = prototypeHtml(d);
        files['prototype-screens.json'] = json(d.screens);
        files['prototype-navigation.json'] = json(d.flows);
    }
    if (kind === 'architecture') {
        files['architecture.drawio'] = toDrawioXml(d.diagram);
        files['architecture.json'] = json(d.diagram);
    }
    if (kind === 'api') {
        const api = openapi(d);
        files['openapi.yaml'] = yaml(api) + '\n';
        files['openapi.json'] = json(api);
    }
    if (kind === 'database') {
        files['schema.sql'] = schemaSql(d);
        files['database-erd.drawio'] = toDrawioXml(erd(d));
        files['database-erd.json'] = json(erd(d));
    }
    return files;
}
function checkReady(item, approvedHash, { allowDraft = false } = {}) { if (!item || !KINDS[item.kind])
    throw Error('Unknown design revision.'); if (!approvedHash || item.sourceHash !== approvedHash)
    throw Error('Approved Business Requirements changed. Regenerate this design before approval or export.'); if (item.manuallyEdited)
    throw Error('Markdown has been edited independently of the structured specification. Save a reconciled structured JSON design to validate the artifacts.'); if (item.status !== 'approved' && !allowDraft)
    throw Error('Approve this design before publishing its artifacts.'); return validate(item.design, item.kind); }
async function exportToProject(registry, id, item, approvedHash, { allowDraft = false } = {}) {
    checkReady(item, approvedHash, { allowDraft });
    const root = path.dirname(registry.fileFor(id)), dest = path.join(root, 'documents', 'designs', 'artifacts', item.kind, `revision-${item.number}-${item.id.slice(0, 8)}`);
    const components = [root, path.join(root, 'documents'), path.join(root, 'documents', 'designs'), path.join(root, 'documents', 'designs', 'artifacts'), path.join(root, 'documents', 'designs', 'artifacts', item.kind), dest];
    for (const c of components) {
        const st = await fs.lstat(c).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (st?.isSymbolicLink() || (st && !st.isDirectory()))
            throw Error('Unsafe design artifact destination.');
    }
    const files = outputFiles(item.kind, item.design);
    if (item.content)
        files['design-specification.md'] = item.content.endsWith('\n') ? item.content : item.content + '\n';
    const manifest = { schema: 1, kind: item.kind, revision: item.number, proposalId: item.id, status: item.status, sourceHash: item.sourceHash, sourceBusinessRequirements: item.sourceBusinessRequirements || [], generatedAt: new Date().toISOString(), files: Object.entries(files).map(([name, contents]) => ({ name, sha256: sha(contents) })) };
    files['manifest.json'] = json(manifest);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const existing = await fs.lstat(dest).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    if (existing) {
        if (!existing.isDirectory() || existing.isSymbolicLink())
            throw Error('Unsafe existing design artifact directory.');
        const saved = JSON.parse(await fs.readFile(path.join(dest, 'manifest.json'), 'utf8'));
        if (saved.proposalId !== item.id || saved.sourceHash !== approvedHash || saved.status !== 'approved' || saved.files.length !== manifest.files.length)
            throw Error('Existing export does not match this approved design.');
        for (const entry of saved.files) {
            if (!/^[a-z0-9._-]+$/i.test(entry.name))
                throw Error('Invalid existing export manifest.');
            const file = path.join(dest, entry.name);
            const st = await fs.lstat(file);
            if (!st.isFile() || st.isSymbolicLink() || sha(await fs.readFile(file, 'utf8')) !== entry.sha256)
                throw Error('Existing export has been modified. Inspect it before re-exporting.');
        }
        return { directory: dest, files: Object.keys(files), manifest: saved, alreadyExported: true };
    }
    const tmp = dest + '.' + crypto.randomUUID() + '.tmp';
    try {
        await fs.mkdir(tmp, { mode: 0o700 });
        for (const [name, contents] of Object.entries(files)) {
            await fs.writeFile(path.join(tmp, name), contents, { flag: 'wx', mode: 0o600 });
        }
        if (await fs.lstat(dest).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e)))
            throw Error('This revision was exported concurrently. Retry to open the existing artifacts.');
        await fs.rename(tmp, dest);
    }
    finally {
        await fs.rm(tmp, { recursive: true, force: true });
    }
    await require('./project-artifact-content').refreshSafe(root);
    return { directory: dest, files: Object.keys(files), manifest };
}
async function deleteExportedRevision(registry, id, item) {
    const root = path.dirname(registry.fileFor(id));
    const parts = ['documents', 'designs', 'artifacts', item.kind, `revision-${item.number}-${item.id.slice(0, 8)}`];
    let dest = root;
    for (const part of parts) {
        dest = path.join(dest, part);
        const st = await fs.lstat(dest).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (st?.isSymbolicLink() || (st && !st.isDirectory()))
            throw Error('Unsafe exported artifact directory.');
        if (!st)
            return { deleted: false };
    }
    const manifestPath = path.join(dest, 'manifest.json');
    const manifestStat = await fs.lstat(manifestPath).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    if (!manifestStat?.isFile() || manifestStat.isSymbolicLink())
        throw Error('Export manifest is missing or unsafe. Preserve this design and inspect the export folder.');
    let manifest;
    try {
        manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    }
    catch {
        throw Error('Cannot read the export manifest.');
    }
    if (manifest.proposalId !== item.id || manifest.kind !== item.kind || manifest.revision !== item.number || manifest.sourceHash !== item.sourceHash || !Array.isArray(manifest.files))
        throw Error('Export manifest does not match the design revision.');
    const names = new Set(['manifest.json']);
    for (const entry of manifest.files) {
        if (!entry || typeof entry.name !== 'string' || !/^[a-z0-9._-]+$/i.test(entry.name) || names.has(entry.name) || !(/^[0-9a-f]{64}$/i.test(entry.sha256)))
            throw Error('Invalid export manifest file entry.');
        names.add(entry.name);
        const file = path.join(dest, entry.name), st = await fs.lstat(file).catch(() => null);
        if (!st?.isFile() || st.isSymbolicLink() || sha(await fs.readFile(file, 'utf8')) !== entry.sha256)
            throw Error('Exported artifact was modified or removed. Deletion cancelled to protect your work.');
    }
    const entries = await fs.readdir(dest);
    if (entries.length !== names.size || entries.some(name => !names.has(name)))
        throw Error('Export folder contains additional files. Deletion cancelled to protect your work.');
    for (const name of names)
        await fs.unlink(path.join(dest, name));
    await fs.rmdir(dest);
    await require('./project-artifact-content').refreshSafe(root);
    return { deleted: true };
}
module.exports = { outputFiles, sqlType, schemaSql, erd, openapi, screenHtml, prototypeHtml, checkReady, exportToProject, deleteExportedRevision };
