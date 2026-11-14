'use strict';
const MAX_BYTES = 4 * 1024 * 1024;
const xmlEscape = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const xmlUnescape = v => String(v ?? '').replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (s, n, name) => {
    if (name)
        return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name.toLowerCase()] || s;
    try {
        const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    catch {
        return '';
    }
});
function cleanId(x) { const v = String(x ?? '').slice(0, 140); if (!/^[a-zA-Z0-9_:.\-]+$/.test(v))
    throw new Error('Invalid diagram element identifier.'); return v; }
function number(v, fallback) { const n = Number(v); return Number.isFinite(n) ? Math.max(-100000, Math.min(100000, n)) : fallback; }
function normalizeModel(data) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges))
        throw new Error('Diagram requires nodes and edges.');
    if (data.nodes.length > 800 || data.edges.length > 1800)
        throw new Error('Diagram exceeds editor size limits.');
    const ids = new Set(), nodes = data.nodes.map((n, i) => {
        const id = cleanId(n.id ?? `n${i}`);
        if (ids.has(id) || id === '0' || id === '1')
            throw new Error('Duplicate/reserved node ID.');
        ids.add(id);
        return { id, label: String(n.label ?? '').slice(0, 1500), kind: String(n.kind || 'component').slice(0, 40), key: String(n.key || '').slice(0, 140), x: number(n.x, 90 + (i % 4) * 240), y: number(n.y, 90 + Math.floor(i / 4) * 135), width: Math.max(70, Math.min(500, number(n.width, 186))), height: Math.max(40, Math.min(260, number(n.height, 72))) };
    });
    const edgeIds = new Set();
    const edges = data.edges.map((e, i) => { const from = cleanId(e.from ?? e.source), to = cleanId(e.to ?? e.target); if (!ids.has(from) || !ids.has(to))
        throw new Error('Diagram edge has an unknown endpoint.'); const id = cleanId(e.id ?? `edge${i}`); if (ids.has(id) || edgeIds.has(id))
        throw new Error('Duplicate diagram edge ID.'); edgeIds.add(id); return { id, from, to, label: String(e.label || '').slice(0, 500), kind: String(e.kind || e.type || '').slice(0, 40) }; });
    return { title: String(data.title || 'ATGV Diagram').slice(0, 180), nodes, edges };
}
function toDrawioXml(source) {
    const model = normalizeModel(source);
    const vertices = model.nodes.map(n => `<mxCell id="${xmlEscape(n.id)}" value="${xmlEscape(n.label)}" atgvKind="${xmlEscape(n.kind)}" atgvKey="${xmlEscape(n.key)}" style="rounded=1;whiteSpace=wrap;html=0;fillColor=#ffffff;strokeColor=#48535e;fontColor=#20232b;" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" as="geometry"/></mxCell>`).join('');
    const edges = model.edges.map(e => `<mxCell id="${xmlEscape(e.id)}" value="${xmlEscape(e.label)}" atgvKind="${xmlEscape(e.kind)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;endArrow=block;strokeColor=#697481;" edge="1" parent="1" source="${xmlEscape(e.from)}" target="${xmlEscape(e.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="ATGV-AIATECH-Assist" modified="${new Date().toISOString()}"><diagram id="ATGV" name="${xmlEscape(model.title)}"><mxGraphModel dx="1200" dy="900" grid="1" gridSize="10" page="1" pageScale="1" pageWidth="1600" pageHeight="1200"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${vertices}${edges}</root></mxGraphModel></diagram></mxfile>\n`;
}
function attributes(markup) { const a = {}; for (const m of String(markup).matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs))
    a[m[1]] = xmlUnescape(m[3]); return a; }
function fromDrawioXml(xml) {
    if (typeof xml !== 'string' || Buffer.byteLength(xml) > MAX_BYTES)
        throw new Error('Diagram is too large.');
    if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml) || /<\s*script\b/i.test(xml))
        throw new Error('XML declarations or scripts are not supported.');
    if (!/<mxGraphModel\b/.test(xml) || !/<root[\s>]/.test(xml))
        throw new Error('Compressed or unsupported draw.io format. Open in diagrams.net to save as uncompressed XML.');
    if ((xml.match(/<diagram\b/g) || []).length > 1)
        throw new Error('Multi-page draw.io files require the full diagrams.net editor; source not modified.');
    const diagramTag = xml.match(/<diagram\b([^>]*)>/), name = diagramTag ? attributes(diagramTag[1]).name : 'Imported Diagram';
    const matches = [...xml.matchAll(/<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g)];
    if (!matches.length)
        throw new Error('No diagram cells found.');
    if (/<(?:UserObject|object|mxImage|mxConnectionConstraint|mxCell[^>]*?style=["'][^"']*(?:image=|shape=|fontFamily=|gradientColor=))/i.test(xml))
        throw new Error('Advanced draw.io objects or styles require the full diagrams.net editor. File not modified.');
    const cellCount = (xml.match(/<mxCell\b/g) || []).length;
    if (matches.length !== cellCount)
        throw new Error('Unsupported nested draw.io cells; source not modified.');
    const nodes = [], edges = [];
    for (const m of matches) {
        const a = attributes(m[1]);
        if (a.id === '0' || a.id === '1')
            continue;
        const styles = String(a.style || '').split(';').filter(Boolean).map(x => x.split('=')[0]);
        if (styles.some(x => !['rounded', 'whiteSpace', 'html', 'fillColor', 'strokeColor', 'fontColor', 'edgeStyle', 'endArrow', 'strokeWidth', 'fontSize', 'align', 'verticalAlign', 'dashed', 'startArrow'].includes(x)))
            throw new Error('Advanced draw.io styles are not supported by this offline canvas. Source not modified.');
        if (a.vertex === '1') {
            const geo = (m[2] || '').match(/<mxGeometry\b([^>]*)\/?\s*>/);
            if (!geo)
                throw new Error('Unsupported vertex geometry.');
            const g = attributes(geo[1]);
            if (a.parent !== '1' || /<mxPoint\b|<Array\b/.test(m[2] || ''))
                throw new Error('Grouped or advanced node geometry is not supported; source not modified.');
            nodes.push({ id: a.id, label: a.value || '', kind: a.atgvKind || a.aiaKind || 'component', key: a.atgvKey || a.aiaKey || '', x: number(g.x, 80), y: number(g.y, 80), width: number(g.width, 186), height: number(g.height, 72) });
        }
        else if (a.edge === '1') {
            if (a.parent !== '1' || /<mxPoint\b|<Array\b/.test(m[2] || ''))
                throw new Error('Grouped or custom-routed edges are not supported.');
            edges.push({ id: a.id, from: a.source, to: a.target, label: a.value || '', kind: a.atgvKind || a.aiaKind || '' });
        }
        else
            throw new Error('Unsupported custom diagram cells detected; source was not modified.');
    }
    return normalizeModel({ title: name || 'Imported Diagram', nodes, edges });
}
function hierarchyDiagram(data) {
    const kinds = ['epic', 'feature', 'story', 'task', 'subtask'];
    const counts = {};
    const nodes = (data.nodes || []).map(n => { const level = Math.max(0, kinds.indexOf(n.kind)), idx = counts[level] || 0; counts[level] = idx + 1; return { id: n.key, key: n.key, label: n.key + '\n' + n.title, kind: n.kind, x: 70 + idx * 244, y: 50 + level * 150, width: 214, height: 84 }; });
    return normalizeModel({ title: 'Jira Linked Hierarchy — ' + String(data.epicKey || ''), nodes, edges: (data.edges || []).map((e, i) => ({ id: 'e' + i, from: e.source, to: e.target, label: e.type === 'logical' ? 'logical' : '', kind: e.type })) });
}
function sdlcDiagram(stages) {
    const nodes = (stages || []).map((s, i) => ({ id: 'stage' + (i + 1), label: (i + 1) + '. ' + s.title + '\nRole: ' + s.role + '\nGate: ' + s.gate, kind: 'sdlc', x: 90 + (i % 3) * 325, y: 65 + Math.floor(i / 3) * 140, width: 285, height: 108 }));
    return normalizeModel({ title: 'SDLC Workflow (draft)', nodes, edges: nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id, label: 'Next (after approval)' })) });
}
function screenFlowDiagram(screens) {
    const nodes = (screens || []).map((s, i) => ({ id: 'screen' + (i + 1), label: String(s.name || 'Screen ' + (i + 1)) + '\n' + String(s.purpose || '').slice(0, 120), kind: 'screen', x: 70 + (i % 3) * 300, y: 65 + Math.floor(i / 3) * 155, width: 250, height: 90 }));
    return normalizeModel({ title: 'UI/UX Screen Flow (draft)', nodes, edges: nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id, label: 'Proposed navigation' })) });
}
module.exports = { normalizeModel, toDrawioXml, fromDrawioXml, hierarchyDiagram, sdlcDiagram, screenFlowDiagram, xmlEscape };
