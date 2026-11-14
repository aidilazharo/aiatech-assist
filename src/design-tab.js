'use strict';
const { screenFlowDiagram } = require('./diagram-model');
const { erd, schemaSql, openapi } = require('./design-artifacts');
const { KINDS } = require('./design-proposals');
const escapeHtml = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const a = escapeHtml;
function nodeLabelRows(label, width = 220, height = 90) {
    const maxChars = Math.max(8, Math.floor((Math.max(90, Number(width) || 220) - 28) / 8));
    const maxRows = Math.max(1, Math.min(5, Math.floor((Math.max(45, Number(height) || 90) - 22) / 17) + 1));
    const rows = [];
    for (const paragraph of String(label || '').split('\n')) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        let line = '';
        for (const word of words) {
            if (line && (line + ' ' + word).length > maxChars) {
                rows.push(line);
                line = '';
            }
            if (word.length > maxChars) {
                if (line) {
                    rows.push(line);
                    line = '';
                }
                for (let pos = 0; pos < word.length; pos += maxChars) {
                    const part = word.slice(pos, pos + maxChars);
                    if (pos + maxChars < word.length)
                        rows.push(part);
                    else
                        line = part;
                }
            }
            else
                line = line ? line + ' ' + word : word;
        }
        if (line)
            rows.push(line);
    }
    if (rows.length > maxRows) {
        const visible = rows.slice(0, maxRows);
        visible[maxRows - 1] = visible[maxRows - 1].slice(0, Math.max(1, maxChars - 1)) + '…';
        return visible;
    }
    return rows;
}
function diagramSvg(model, aria) {
    const nodes = Array.isArray(model?.nodes) ? model.nodes : [], edges = Array.isArray(model?.edges) ? model.edges : [];
    if (!nodes.length)
        return '<p class="empty">No diagram nodes were generated.</p>';
    const width = Math.max(900, ...nodes.map(n => Number(n.x || 0) + Number(n.width || 220) + 90));
    const height = Math.max(450, ...nodes.map(n => Number(n.y || 0) + Number(n.height || 90) + 85));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const lines = edges.map(e => {
        const f = byId.get(e.from), t = byId.get(e.to);
        if (!f || !t)
            return '';
        const x1 = Number(f.x) + Number(f.width) / 2, y1 = Number(f.y) + Number(f.height) / 2, x2 = Number(t.x) + Number(t.width) / 2, y2 = Number(t.y) + Number(t.height) / 2;
        return `<g data-edge-from="${a(e.from)}" data-edge-to="${a(e.to)}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8eb1d2" stroke-width="2.2" marker-end="url(#atgv-arrow)"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 9}" fill="#bacce0" font-size="12" text-anchor="middle">${a(e.label || '')}</text></g>`;
    }).join('');
    const blocks = nodes.map(n => {
        const x = Number(n.x || 0), y = Number(n.y || 0), w = Number(n.width || 220), h = Number(n.height || 90);
        const rows = nodeLabelRows(n.label, w, h);
        const ty = rows.map((s, i) => `<text x="${x + 14}" y="${y + 25 + i * 17}" fill="${i === 0 ? '#f2f7fc' : '#aabed1'}" font-size="${i === 0 ? 14 : 12}" font-weight="${i === 0 ? 700 : 400}">${a(s.slice(0, 65))}</text>`).join('');
        return `<g class="diagram-node" tabindex="0" role="group" aria-label="${a(n.label)}" data-node-id="${a(n.id)}" data-x="${x}" data-y="${y}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#203346" stroke="#5887aa" stroke-width="1.5"/><rect x="${x}" y="${y}" width="${w}" height="7" rx="3" fill="#5f9ad3"/>${ty}</g>`;
    }).join('');
    return `<div class="diagram-controls"><button type="button" id="zoomOut" class="secondary">− Zoom</button><output id="zoomValue">100%</output><button type="button" id="zoomIn" class="secondary">+ Zoom</button><button type="button" id="zoomFit" class="secondary">Fit</button><span class="muted">Drag boxes to explore layouts · Save draft positions in the design tab · Draw.io export available</span><button type="button" id="saveLayout" class="secondary" hidden>Save node positions</button></div><div class="diagram-scroll" id="diagramScroll"><svg id="designSvg" role="img" aria-label="${a(aria)}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="atgv-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9Z" fill="#8eb1d2"/></marker></defs>${lines}${blocks}</svg></div>`;
}
function componentsMarkup(components) {
    return (components || []).slice(0, 16).map(item => {
        const name = String(item), low = name.toLowerCase();
        if (/(submit|save|approve|reject|cancel|back|continue|button|create|delete|view|open|login|sign in)/.test(low))
            return `<button class="demo-button" type="button" data-demo-action="${a(name)}">${a(name)}</button>`;
        if (/(search|input|field|email|password|name|date|filter|select|textarea|description|dropdown)/.test(low))
            return `<label class="sample-field">${a(name)}<input type="text" placeholder="${a(name)}" aria-label="${a(name)}"/></label>`;
        if (/(table|grid|list|results)/.test(low))
            return `<div class="mock-table"><strong>${a(name)}</strong><div>Example row <span>Draft example</span></div><div>Second row <span>For review</span></div></div>`;
        return `<div class="mock-component">${a(name)}</div>`;
    }).join('');
}
function screenFrames(d, { interactive = false } = {}) {
    const screens = d.screens || [];
    if (!screens.length)
        return '<p class="empty">No screens generated.</p>';
    return `<div class="screen-tabs" role="tablist" aria-label="Design screens">${screens.map((s, i) => `<button type="button" data-screen-tab="${i}" class="screen-tab${i === 0 ? ' current' : ''}" role="tab" aria-selected="${i === 0}">${a(s.name)}</button>`).join('')}</div><div class="mock-browser"><div class="browser-toolbar"><span>● ● ●</span><span class="browser-address">Project preview · ${interactive ? 'interactive prototype' : 'screen mockup'}</span><span>⋮</span></div>${screens.map((s, i) => `<section data-screen-panel="${i}" ${i ? 'hidden' : ''}><div class="mock-topnav"><b>${a(d.title)}</b><span>Home　 •　 ${a(s.name)}</span></div><div class="mock-content"><div class="mock-heading"><small>SCREEN ${i + 1} / ${screens.length}</small><h2>${a(s.name)}</h2><p>${a(s.purpose || 'Screen layout for review')}</p></div><div class="mock-grid">${componentsMarkup(s.components)}</div><div class="interaction-hint">${(s.interactions || []).map(x => `<span>${a(x)}</span>`).join('')}</div>${interactive ? `<div class="mock-foot"><button type="button" data-screen-prev="${i}" class="secondary" ${!i ? 'disabled' : ''}>Previous</button><button type="button" data-screen-next="${i}" ${i === screens.length - 1 ? 'disabled' : ''}>Next screen</button></div>` : ''}</div></section>`).join('')}</div>`;
}
function designSystem(d) {
    const t = d.tokens || {}, colors = t.colors || {}, palette = Object.entries(colors).slice(0, 24);
    const typography = t.typography || {}, spacing = t.spacing || {}, radii = t.radii || {};
    return `<div class="section-heading"><div class="eyebrow">FOUNDATIONS / UI KIT</div><h2>Product Design System</h2><p>Reusable visual language derived from the approved requirements · review color contrast, accessibility and consistency</p></div>
 <div class="design-summary"><article class="summary-tile"><small>SCREENS</small><strong>${d.screens.length}</strong><span>Design inventory</span></article><article class="summary-tile"><small>COLOR TOKENS</small><strong>${palette.length}</strong><span>Defined palette</span></article><article class="summary-tile"><small>COMPONENTS</small><strong>${d.screens.reduce((n, s) => n + s.components.length, 0)}</strong><span>Across screens</span></article></div>
 <section class="section"><div class="section-header"><div><h3>01 · Color foundations</h3><p class="muted">Swatches from the generated theme, not hard-coded brand assumptions</p></div></div>${palette.length ? `<div class="swatches">${palette.map(([name, value]) => `<div class="swatch"><div class="swatch-color" data-swatch-color="${/^#[0-9a-f]{3,8}$/i.test(String(value)) ? a(value) : '#738395'}"></div><b>${a(name)}</b><small>${a(value)}</small></div>`).join('')}</div>` : '<p class="muted">No theme colors were generated; approve tokens before implementation.</p>'}</section>
 <section class="section"><h3>02 · Typography & spacing</h3><div class="foundation-grid"><div class="type-preview"><div class="type-xl">The quick brown fox</div><div class="type-md">Section heading — product experience</div><p>Body text establishes a clear content hierarchy across screens and components.</p><small>Font: ${a(typography.fontFamily || 'Project default')} · Base: ${a(typography.baseSizePx || 'Not specified')} px</small></div><div class="type-preview"><h4>Layout tokens</h4><div class="token-row"><span>Spacing</span><code>${a(JSON.stringify(spacing).slice(0, 180))}</code></div><div class="token-row"><span>Radii</span><code>${a(JSON.stringify(radii).slice(0, 180))}</code></div></div></div></section>
 <section class="section"><h3>03 · Component inventory</h3><div class="component-showcase"><button class="demo-button" type="button" data-demo-action="Primary action">Primary action</button><button type="button" class="secondary" data-demo-action="Secondary action">Secondary</button><label class="sample-field">Sample input<input type="text" placeholder="Enter an example" /></label><span class="status Approved">Approved</span><span class="status">Draft</span></div><div class="component-grid">${d.screens.map(s => `<article class="component-card"><small class="muted">SCREEN</small><h4>${a(s.name)}</h4><p>${a(s.purpose)}</p><div class="chips">${(s.components || []).map(c => `<span>${a(c)}</span>`).join('')}</div></article>`).join('')}</div></section>`;
}
function schemaSample(schema, level = 0) {
    if (!schema || typeof schema !== 'object' || level > 5)
        return null;
    if (schema.example !== undefined)
        return schema.example;
    if (schema.enum?.length)
        return schema.enum[0];
    const type = schema.type || ((schema.properties) ? 'object' : 'string');
    if (type === 'object')
        return Object.fromEntries(Object.entries(schema.properties || {}).slice(0, 12).map(([k, v]) => [k, schemaSample(v, level + 1)]));
    if (type === 'array')
        return schema.items ? [schemaSample(schema.items, level + 1)] : [];
    if (type === 'boolean')
        return true;
    if (type === 'integer' || type === 'number')
        return 0;
    return schema.format === 'date-time' ? '2026-10-31T00:00:00Z' : schema.format === 'date' ? '2026-10-31' : 'example';
}
function apiView(d) {
    let api, issue = '';
    try {
        api = openapi(d);
    }
    catch (error) {
        issue = error.message;
        api = { openapi: '3.1.0', info: { title: d.title, version: '0.1.0' }, paths: {} };
    }
    return `<div class="swagger-header"><div class="eyebrow">OPENAPI 3.1 / API REFERENCE</div><h2>${a(d.title)}</h2><p>${a(d.summary || 'Proposed API specification for developer review')}</p><div class="swagger-info"><span>OAS 3.1</span><span>${d.endpoints.length} operations</span><span>Draft specification · No live server configured</span></div></div>
 ${issue ? `<div class="notice">Schema validation needs review: ${a(issue)}</div>` : ''}
 <div class="swagger-operations">${d.endpoints.map((e, i) => {
        const req = e.requestSchema ? JSON.stringify(schemaSample(e.requestSchema), null, 2) : (e.request || 'No request body');
        const res = e.responseSchema ? JSON.stringify(schemaSample(e.responseSchema), null, 2) : (e.response || 'No response schema provided');
        return `<details class="endpoint swagger-operation method-border-${a(e.method.toLowerCase())}" ${i === 0 ? 'open' : ''}><summary><span class="method method-${a(e.method.toLowerCase())}">${a(e.method)}</span><code>${a(e.path)}</code><span>${a(e.operation || 'Review this operation')}</span><small>⌄</small></summary><div class="endpoint-body"><div class="operation-meta"><div><strong>Authorization</strong><p>${a(e.authorization)}</p></div><div><strong>Implementation status</strong><p>Proposed · not deployed</p></div></div><div class="two-cols"><div><h4>Request body</h4><pre class="api-request">${a(req)}</pre></div><div><h4>Example response</h4><pre class="api-example">${a(res)}</pre></div></div><div class="try-panel"><div><b>Try it out · simulated</b><p class="muted">Generate a local example response from the design schema. No network request is sent.</p></div><button class="try-api" type="button" data-api-index="${i}">Execute example</button></div><div class="api-test-output" data-api-result="${i}" hidden aria-live="polite"></div></div></details>`;
    }).join('')}</div>
 <details class="section"><summary>OpenAPI JSON · exportable contract</summary><pre>${a(JSON.stringify(api, null, 2))}</pre></details>`;
}
function dbView(d) { return `<div class="section-heading"><h2>Entity Relationship Diagram</h2><p>${d.entities.length} proposed tables · Keys and relationships · SQL schema preview</p></div>${diagramSvg(erd(d), 'Database Entity Relationship Diagram')}<section class="section"><h3>Tables and columns</h3><div class="entity-grid">${d.entities.map(e => `<div class="entity-card"><h4>${a(e.name)}</h4><p>${a(e.description)}</p><table><thead><tr><th>Column</th><th>Type</th><th>Constraints</th></tr></thead><tbody>${e.fields.map(f => `<tr><td>${a(f.name)}</td><td><code>${a(f.type)}</code></td><td>${f.key ? 'PK ' : ''}${f.required ? 'NOT NULL' : ''}</td></tr>`).join('')}</tbody></table><div class="relations">${e.relationships.map(r => `<p>${a(typeof r === 'string' ? r : `${r.field || 'Column'} → ${r.target || 'Table'}.${r.targetField || 'id'} ${r.cardinality || ''}`)}</p>`).join('')}</div></div>`).join('')}</div></section><details class="section"><summary>Generated SQL schema</summary><pre>${a((() => { try {
    return schemaSql(d);
}
catch (e) {
    return 'Schema validation requires review: ' + e.message;
} })())}</pre></details>`; }
function renderMain(kind, d) {
    if (kind === 'design')
        return designSystem(d);
    if (kind === 'ux')
        return `<div class="section-heading"><h2>User Journey & Navigation Flow</h2><p>Review screens, transitions and decision points</p></div>${diagramSvg(d.diagram || screenFlowDiagram(d.screens), 'User Experience Flow')}<div class="diagram-legend"><span>● Screen / action</span><span>→ User transition</span><span>⚑ Validate alternate and error paths</span></div><section class="section"><h3>Journey decisions</h3>${(d.flows || []).map((f, i) => `<p class="flow-line"><b>${i + 1}.</b> ${a(f)}</p>`).join('') || '<p class="muted">Review and add missing error and alternate journeys.</p>'}</section>`;
    if (kind === 'mockup' || kind === 'prototype')
        return `<div class="section-heading"><h2>${kind === 'prototype' ? 'Interactive UI Prototype' : 'Screen Mockups'}</h2><p>${kind === 'prototype' ? 'Clickable screen navigation and simulated actions. No real data is saved.' : 'Rendered screen compositions for visual review.'}</p></div>${screenFrames(d, { interactive: true })}`;
    if (kind === 'architecture')
        return `<div class="section-heading"><h2>System Architecture</h2><p>Software components, service boundaries and integrations · Editable Draw.io file available on export</p></div>${diagramSvg(d.diagram, 'System Architecture Diagram')}<div class="diagram-legend"><span>● Component</span><span>→ Data / service interaction</span><span>⚑ Confirm proposed integrations</span></div><section class="section"><h3>Architecture components</h3><div class="chips">${d.diagram.nodes.map(n => `<span>${a(n.label.split('\n')[0])}</span>`).join('')}</div></section>`;
    if (kind === 'api')
        return apiView(d);
    if (kind === 'database')
        return dbView(d);
    return '<p>Unsupported design type.</p>';
}
function render({ item, kind, isLatest, approvedHash, projectId, nonce, standalone = false }) {
    const d = item.design || {}, readonly = item.status === 'approved' || !isLatest;
    const stale = !!approvedHash && item.sourceHash !== approvedHash;
    const canEdit = !readonly && !stale;
    const label = KINDS[kind] || kind;
    const pending = !!item.manuallyEdited;
    const status = stale ? 'Outdated' : item.status === 'approved' ? 'Approved' : 'Draft';
    const warning = stale ? 'Approved Business Requirements changed. Regenerate this design before approving or exporting.' : pending ? 'The Markdown draft was edited separately; reconcile and save structured JSON before approval.' : '';
    const source = JSON.stringify(d, null, 2).replace(/<\//g, '<\\/');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; font-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${a(label)} – ${a(item.design?.title)}</title><style nonce="${nonce}">
 :root{color-scheme:dark;--bg:var(--vscode-editor-background,#17191c);--surface:var(--vscode-sideBar-background,#22252a);--ink:var(--vscode-foreground,#e6e7e9);--muted:var(--vscode-descriptionForeground,#aab1bd);--line:var(--vscode-panel-border,#434a54);--accent:var(--vscode-button-background,#2164a7)}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 var(--vscode-font-family,system-ui,sans-serif)}button{background:var(--accent);color:var(--vscode-button-foreground,#fff);border:0;border-radius:5px;padding:8px 14px;font:inherit;cursor:pointer}button.secondary{border:1px solid var(--line);background:var(--surface);color:var(--ink)}button:disabled{opacity:.45;cursor:default}button:focus-visible,summary:focus-visible{outline:2px solid #86b7f3;outline-offset:2px}.muted,.caption{color:var(--muted)}header{background:var(--surface);border-bottom:1px solid var(--line);padding:20px clamp(20px,4vw,65px)}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.4px;color:#88b0ea;font-weight:700}.header-row{display:flex;align-items:start;justify-content:space-between;gap:16px;flex-wrap:wrap}h1{font-size:26px;margin:3px 0 6px}h2{font-size:22px;margin:0 0 5px}h3{font-size:17px;margin:12px 0}h4{font-size:14px;margin:4px 0}.status{display:inline-block;border:1px solid var(--line);padding:3px 10px;border-radius:100px;font-size:12px}.status.Approved{color:#7bdba4}.status.Outdated{color:#e8b675}.actionbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.layout{padding:25px clamp(20px,4vw,65px);max-width:none;margin:0;text-align:left}.section-heading{margin-bottom:16px}.section-heading p{margin:0;color:var(--muted)}.section{margin-top:20px;padding:20px;border-radius:8px;border:1px solid var(--line);background:var(--surface)}.section>summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:480px;overflow:auto;background:#141a21;padding:14px;border:1px solid var(--line);border-radius:6px;color:#c7e1f9}code{font-size:13px}.swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}.swatch{display:flex;flex-direction:column;gap:3px;font-size:12px}.swatch-color{height:70px;border-radius:6px;border:1px solid var(--line)}.swatch small{color:var(--muted)}.type-samples{display:flex;flex-direction:column;gap:8px}.type-xl{font-size:30px;font-weight:700}.type-md{font-size:20px;font-weight:600}.component-grid,.entity-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,390px),1fr));gap:12px;min-width:0}.component-card,.entity-card{background:#19232e;border:1px solid var(--line);border-radius:8px;padding:18px}.component-card,.entity-card{min-width:0;overflow:hidden;overflow-wrap:anywhere}.entity-card h4,.component-card h4{overflow-wrap:anywhere}.component-card p,.entity-card p{color:var(--muted)}.chips{display:flex;flex-wrap:wrap;gap:7px}.chips span{background:#334759;border-radius:20px;padding:4px 9px;font-size:12px}.diagram-controls{display:flex;align-items:center;gap:8px;margin:12px 0}.diagram-scroll{overflow:auto;max-height:75vh;min-height:370px;border:1px solid var(--line);border-radius:8px;background:#121b24;background-image:radial-gradient(#344351 0.5px,transparent 0.5px);background-size:14px 14px;padding:15px}.diagram-scroll svg{max-width:none;display:block}.screen-tabs{display:flex;gap:8px;overflow-x:auto;margin:12px 0}.screen-tab{background:var(--surface);border:1px solid var(--line);flex-shrink:0}.screen-tab.current{background:var(--accent);border-color:var(--accent)}.mock-browser{background:#f5f7fc;color:#172637;border-radius:10px;min-height:430px;overflow:hidden;border:1px solid #738499}.browser-toolbar{background:#e1e7ee;display:flex;gap:14px;padding:10px 16px;color:#8392a4}.browser-address{flex:1;text-align:center;background:#f5f7fc;border-radius:6px}.mock-topnav{display:flex;justify-content:space-between;background:#102e4b;padding:16px 25px;color:white}.mock-content{padding:22px 28px}.mock-heading small{color:#477bb6;font-weight:700}.mock-heading h2{margin:2px 0;color:#172637}.mock-heading p{margin:0 0 20px;color:#526c86}.mock-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:13px}.mock-component,.sample-field,.mock-table{display:block;padding:17px;background:white;color:#293f52;border:1px solid #ced8e6;border-radius:7px}.sample-field input{width:100%;display:block;border:1px solid #ccd7e3;padding:9px;color:#243851;margin-top:6px}.mock-table{grid-column:span 2}.mock-table div{padding:8px 0;border-top:1px solid #dce4ec;display:flex;justify-content:space-between}.demo-button{align-self:start}.interaction-hint{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.interaction-hint span{background:#e2ebf5;color:#425f79;padding:4px 8px;border-radius:20px;font-size:11px}.mock-foot{display:flex;justify-content:space-between;margin-top:22px}.endpoint{border:1px solid var(--line);border-radius:7px;margin:9px 0;background:var(--surface)}.endpoint summary{display:flex;align-items:center;gap:14px;cursor:pointer;padding:13px;flex-wrap:wrap}.endpoint summary span:last-child{color:var(--muted)}.method{width:68px;text-align:center;padding:4px;border-radius:4px;font-size:11px;font-weight:800}.method-get{background:#136d49}.method-post{background:#2457a2}.method-put,.method-patch{background:#97710c}.method-delete{background:#a63b3b}.endpoint-body{padding:15px;border-top:1px solid var(--line)}.two-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}table{border-collapse:collapse;width:100%;max-width:100%;table-layout:fixed;font-size:12px}
 th,td{padding:7px 5px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;min-width:0;overflow-wrap:anywhere;word-break:normal}
 .entity-card th:nth-child(1),.entity-card td:nth-child(1){width:38%}
 .entity-card th:nth-child(2),.entity-card td:nth-child(2){width:31%}
 .entity-card th:nth-child(3),.entity-card td:nth-child(3){width:31%}
 .entity-card td code{font:inherit;white-space:normal;overflow-wrap:anywhere}
 .relations p{overflow-wrap:anywhere}
 .section,.layout,.header-row,.section-heading,.summary-tile{min-width:0}
 h1,h2,h3,h4,.caption,.section-heading p{overflow-wrap:anywhere}.relations{color:#87c1ed;font-size:12px}.flow-line{padding:8px;border-bottom:1px solid var(--line)}textarea{width:100%;min-height:260px;resize:vertical;padding:14px;color:var(--ink);background:#161f28;border:1px solid var(--line);font:12px/1.5 var(--vscode-editor-font-family,monospace)}.notice{background:#383126;border-left:3px solid #dba84b;padding:10px 14px;margin:12px 0}.toast{color:#8fdab1;padding:8px 0;min-height:18px}.empty{padding:30px;text-align:center;color:var(--muted)}[hidden]{display:none!important}
 
/* v0.1.03: higher fidelity visual reviews */
header{position:relative;text-align:left;border-bottom:1px solid var(--line);background:linear-gradient(135deg,#1b2938 0%,var(--surface) 58%,#191c24 100%)}
header h1{letter-spacing:-.6px;max-width:900px}.eyebrow{font-size:11px}.generation-info{display:flex;flex-wrap:wrap;gap:10px 24px;color:var(--muted);font-size:12px;margin-top:15px}.generation-info b{color:var(--ink);font-weight:600}
.layout{padding-top:30px}.section{border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
.section-heading h2,.swagger-header h2{font-size:26px;letter-spacing:-.5px}.section-header{display:flex;justify-content:space-between;align-items:center}
.design-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:22px 0}.summary-tile{background:linear-gradient(125deg,#263447,#18232c);border:1px solid var(--line);border-radius:12px;padding:17px;display:flex;flex-direction:column}.summary-tile small{color:#95b5d6;font-size:11px;letter-spacing:1px}.summary-tile strong{font-size:30px;margin:6px 0 0}.summary-tile span{color:var(--muted);font-size:12px}
.swatches{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.swatch{background:#1a2632;padding:8px;border:1px solid var(--line);border-radius:10px}.swatch-color{height:95px;margin-bottom:5px}
.foundation-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:14px}.type-preview{background:#1a2632;padding:23px;border-radius:9px}.type-preview p{color:#a9bbc9}.type-preview small{color:#8eabc3}.token-row{display:flex;justify-content:space-between;gap:8px;padding:13px 0;border-bottom:1px solid #425161}.token-row code{overflow-wrap:anywhere}
.component-showcase{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#17232f;border:1px dashed #667d94;padding:19px;border-radius:9px;margin-bottom:18px}.component-showcase .sample-field{padding:6px 12px;max-width:220px}
.component-card{background:linear-gradient(145deg,#1e3041,#19232e)}.component-card h4{font-size:17px;margin:5px 0}
.diagram-node{touch-action:none;outline:none}.diagram-node:focus rect:first-child{stroke:#b4d9fa;stroke-width:3}.diagram-controls{flex-wrap:wrap}.diagram-legend{display:flex;flex-wrap:wrap;gap:15px;margin:12px 0;color:#a6bcd0;font-size:12px}.diagram-legend span{border:1px solid var(--line);border-radius:12px;padding:5px 12px;background:#202f3e}
.swagger-header{background:linear-gradient(125deg,#132a28,#1e3035);padding:24px;border-radius:12px;margin-bottom:21px;border:1px solid #486961}.swagger-header h2{margin:7px 0}.swagger-header p{color:#b9d4c9}.swagger-info{display:flex;flex-wrap:wrap;gap:8px}.swagger-info span{border:1px solid #55796a;border-radius:20px;padding:5px 12px;font-size:12px;color:#d2e8df}
.swagger-operation{overflow:hidden;border-radius:8px}.swagger-operation summary{padding:16px 20px}.swagger-operation summary code{font-size:14px;font-weight:650}.swagger-operation summary small{margin-left:auto;color:var(--muted)}.method-border-get{border-color:#288b68}.method-border-post{border-color:#3480cd}.method-border-patch,.method-border-put{border-color:#b48b2c}.method-border-delete{border-color:#ae5660}.operation-meta{display:flex;gap:25px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin-bottom:15px}.operation-meta p{margin:5px 0 13px;color:var(--muted)}.try-panel{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;padding:13px;background:#1b3030;border:1px solid #38625b;border-radius:8px}.try-panel p{margin:3px 0}.api-test-output{white-space:pre-wrap;font:12px/1.6 var(--vscode-editor-font-family,monospace);background:#102722;color:#b3e5c8;border:1px solid #4c9d75;border-radius:8px;padding:16px;margin-top:12px}
@media(max-width:850px){.foundation-grid{grid-template-columns:1fr}.design-summary{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}}
</style></head><body><header><div class="eyebrow">ATGV · SOLUTION DESIGNS / ${a(label)}</div><div class="header-row"><div><h1>${a(d.title || label)}</h1><div class="caption">Revision ${Number(item.number)} · ${a(label)} · ${readonly ? 'Read-only' : 'Draft for review'}</div></div><span class="status ${status}">${status}</span></div><p>${a(d.summary || 'AI-generated design based on approved Business Requirements. Review before implementation.')}</p><div class="generation-info"><span>Generated by <b>${a(item.actor || 'Not recorded')}</b></span><span>On <b>${a(item.at ? new Date(item.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown')}</b></span><span>AI <b>${a(item.aiModel || item.model || item.aiProvider || 'Not recorded')}</b></span></div><div class="actionbar">${canEdit && !standalone ? '<button type="button" id="editBtn" class="secondary">Edit Structured Design</button>' : ''}${!standalone && item.status === 'draft' && isLatest ? `<button type="button" id="approveBtn" ${stale || pending ? 'disabled' : ''}>Approve Design</button>` : ''}${!standalone && item.status === 'approved' ? `<button type="button" id="exportBtn" ${stale || pending ? 'disabled' : ''}>Export Artifacts</button>` : ''}${!standalone && kind === 'mockup' ? '<button type="button" id="browserBtn" class="secondary">Open Full Website in Browser</button>' : ''}</div>${warning ? `<p class="notice">${a(warning)}</p>` : ''}<div class="toast" id="actionStatus" role="status" aria-live="polite"></div></header><main class="layout">${renderMain(kind, d)}${(d.assumptions?.length || d.questions?.length) ? `<details class="section"><summary>Assumptions & Open Questions</summary><h3>Assumptions</h3>${(d.assumptions || []).map(x => `<p>${a(x)}</p>`).join('')}<h3>Open Questions</h3>${(d.questions || []).map(x => `<p>${a(x)}</p>`).join('')}</details>` : ''}${canEdit && !standalone ? `<details class="section" id="editorSection"><summary>Edit source design (JSON)</summary><p class="muted">Changes are validated and saved as a draft. This updates the previews and generated export files.</p><textarea id="designJson" spellcheck="false" aria-label="Design JSON">${a(source)}</textarea><div class="actionbar"><button type="button" id="saveBtn">Validate & Save Draft</button></div></details>` : ''}<details class="section"><summary>Revision information</summary><p>Status: ${a(item.status)} · Revision ${Number(item.number)}</p><p>Design source: Approved Business Requirements</p><p class="muted">Approval accepts the specification only. No API or database is deployed and no real data is saved by previews.</p></details></main><script nonce="${nonce}">
 (function(){'use strict';const vscode=${standalone ? '{postMessage(){}}' : 'acquireVsCodeApi()'};const status=document.getElementById('actionStatus');const kind=${JSON.stringify(kind)},id=${JSON.stringify(item.id)},revision=${Number(item.number)};const post=(command,more={})=>{status.textContent='Processing…';vscode.postMessage({command,kind,proposalId:id,...more})};const action=(button,fn)=>{const b=document.getElementById(button);if(b)b.addEventListener('click',fn)};action('approveBtn',()=>post('designApprove'));action('exportBtn',()=>post('designExport'));action('browserBtn',()=>post('designOpenMockupBrowser'));action('editBtn',()=>{document.getElementById('editorSection')?.setAttribute('open','');document.getElementById('designJson')?.focus()});action('saveBtn',()=>{let proposal;try{proposal=JSON.parse(document.getElementById('designJson').value)}catch(e){status.textContent='Invalid JSON: '+e.message;return}post('designEditStructured',{proposal})});window.addEventListener('message',e=>{if(e.data?.type==='designTabError')status.textContent=e.data.message||'Action failed';if(e.data?.type==='designTabNotice')status.textContent=e.data.message||'Updated'});
 document.querySelectorAll('[data-swatch-color]').forEach(n=>{n.style.backgroundColor=n.dataset.swatchColor});const tabs=[...document.querySelectorAll('[data-screen-tab]')],panels=[...document.querySelectorAll('[data-screen-panel]')];function show(i){if(i<0||i>=panels.length)return;tabs.forEach((t,j)=>{t.classList.toggle('current',i===j);t.setAttribute('aria-selected',i===j?'true':'false')});panels.forEach((p,j)=>{p.hidden=i!==j})}tabs.forEach(t=>t.addEventListener('click',()=>show(Number(t.dataset.screenTab))));document.querySelectorAll('[data-screen-prev]').forEach(b=>b.addEventListener('click',()=>show(Number(b.dataset.screenPrev)-1)));document.querySelectorAll('[data-screen-next]').forEach(b=>b.addEventListener('click',()=>show(Number(b.dataset.screenNext)+1)));document.querySelectorAll('[data-demo-action]').forEach(b=>b.addEventListener('click',()=>{status.textContent=b.dataset.demoAction+' (simulated action; nothing saved)'}));let zoom=1;const svg=document.getElementById('designSvg');const val=document.getElementById('zoomValue');function zoomTo(z){if(!svg)return;zoom=Math.max(.4,Math.min(3,Math.round(z*100)/100));svg.style.width=(Number(svg.viewBox.baseVal.width)*zoom)+'px';svg.style.height=(Number(svg.viewBox.baseVal.height)*zoom)+'px';val.textContent=Math.round(zoom*100)+'%'}action('zoomIn',()=>zoomTo(zoom*1.25));action('zoomOut',()=>zoomTo(zoom/1.25));action('zoomFit',()=>{const sc=document.getElementById('diagramScroll');if(sc&&svg){zoomTo(Math.max(.4,Math.min(1,(sc.clientWidth-35)/svg.viewBox.baseVal.width)));sc.scrollTo(0,0)}});

 const apiExamples=${JSON.stringify((d.endpoints || []).map(e => ({ method: e.method, body: JSON.stringify(e.responseSchema ? schemaSample(e.responseSchema) : (e.response || { message: "No response schema specified" }), null, 2) }))).replace(/</g, "\\u003c")},canSaveLayout=${Boolean(canEdit && ['ux', 'architecture'].includes(kind))},model=${JSON.stringify(['ux', 'architecture'].includes(kind) ? { ...d, diagram: d.diagram || screenFlowDiagram(d.screens || []) } : null).replace(/</g, '\\u003c')};
 document.querySelectorAll('[data-api-index]').forEach(b=>b.addEventListener('click',()=>{
  const i=Number(b.dataset.apiIndex),response=apiExamples[i],target=document.querySelector('[data-api-result="'+i+'"]');
  if(!target||!response)return;
  target.hidden=false;target.textContent='SIMULATED RESPONSE · HTTP '+(response.method==='POST'?'201 Created':'200 OK')+'\\n\\n'+response.body+'\\n\\nNo HTTP request was sent.';
 }));
 const diagramNodes=[...document.querySelectorAll('.diagram-node')],nodeCoords=new Map();
 for(const node of diagramNodes){nodeCoords.set(node.dataset.nodeId,{x:Number(node.dataset.x),y:Number(node.dataset.y)});node.style.cursor='grab'}
 const redrawEdges=()=>{for(const edge of document.querySelectorAll('[data-edge-from]')){
  const from=nodeCoords.get(edge.dataset.edgeFrom),to=nodeCoords.get(edge.dataset.edgeTo);
  const f=diagramNodes.find(n=>n.dataset.nodeId===edge.dataset.edgeFrom),t=diagramNodes.find(n=>n.dataset.nodeId===edge.dataset.edgeTo);
  const fr=f?.querySelector('rect'),tr=t?.querySelector('rect'),line=edge.querySelector('line');if(!from||!to||!fr||!tr||!line)continue;
  const coords=[from.x+Number(fr.getAttribute('width'))/2,from.y+Number(fr.getAttribute('height'))/2,to.x+Number(tr.getAttribute('width'))/2,to.y+Number(tr.getAttribute('height'))/2];
  ['x1','y1','x2','y2'].forEach((attr,i)=>line.setAttribute(attr,String(coords[i])));
  const label=edge.querySelector('text');if(label){label.setAttribute('x',String((coords[0]+coords[2])/2));label.setAttribute('y',String((coords[1]+coords[3])/2-9))}
 }};
 let dragging=null;const canvas=document.getElementById('designSvg');
 diagramNodes.forEach(node=>node.addEventListener('pointerdown',event=>{
  if(event.button!==0||!canvas)return;
  event.preventDefault();const id=node.dataset.nodeId,pos=nodeCoords.get(id);
  dragging={node,id,x:event.clientX,y:event.clientY,startX:pos.x,startY:pos.y};node.setPointerCapture(event.pointerId);node.style.cursor='grabbing';
 }));
 diagramNodes.forEach(node=>node.addEventListener('pointermove',event=>{
  if(!dragging||dragging.node!==node)return;
  const bounds=canvas.getBoundingClientRect(),factor=Number(canvas.viewBox.baseVal.width)/bounds.width;
  const x=Math.max(0,Math.round(dragging.startX+(event.clientX-dragging.x)*factor)),y=Math.max(0,Math.round(dragging.startY+(event.clientY-dragging.y)*factor));
  const originalX=Number(node.dataset.x),originalY=Number(node.dataset.y);nodeCoords.set(dragging.id,{x,y});
  node.setAttribute('transform','translate('+(x-originalX)+' '+(y-originalY)+')');redrawEdges();
  const save=document.getElementById('saveLayout');if(save&&canSaveLayout)save.hidden=false;
 }));
 for(const node of diagramNodes){const finish=()=>{if(dragging?.node===node){node.style.cursor='grab';dragging=null}};node.addEventListener('pointerup',finish);node.addEventListener('pointercancel',finish)}
 action('saveLayout',()=>{if(!model?.diagram?.nodes)return;for(const node of model.diagram.nodes){const pos=nodeCoords.get(node.id);if(pos){node.x=pos.x;node.y=pos.y}}post('designEditStructured',{proposal:model})});

 })();</script></body></html>`;
}
module.exports = { render, diagramSvg, screenFrames, escapeHtml };
