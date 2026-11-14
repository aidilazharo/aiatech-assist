'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { loadProjectRoles, allProjectRoles } = require('./sdlc-catalog');
const { checksum } = require('./document-editor');
const { fromDrawioXml, toDrawioXml, normalizeModel } = require('./diagram-model');
const DRAWIO_START = '<?xml version="1.0" encoding="UTF-8"?><mxfile host="ATGV"><diagram name="Architecture" id="architecture"><mxGraphModel dx="900" dy="600" grid="1" gridSize="10" page="1" pageWidth="827" pageHeight="1169"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
function projectRoot(registry, id) { return path.dirname(registry.fileFor(id)); }
async function ensureSafeDocument(root, relative, content) {
    const pathname = path.resolve(root, relative);
    if (!pathname.startsWith(root + path.sep))
        throw Error('Outside project.');
    let p = root;
    for (const seg of path.relative(root, pathname).split(path.sep)) {
        p = path.join(p, seg);
        const st = await fs.lstat(p).catch(e => { if (e.code === 'ENOENT')
            return null; throw e; });
        if (st?.isSymbolicLink())
            throw Error('Cannot access symlinked project document.');
    }
    await fs.mkdir(path.dirname(pathname), { recursive: true });
    await fs.writeFile(pathname, content, { flag: 'wx', mode: 0o600 }).catch(e => { if (e.code !== 'EEXIST')
        throw e; });
    return pathname;
}
function datePlus(start, days) { let date = new Date(start + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
async function createTimeline(registry, id) {
    const roles = await loadProjectRoles(registry, id);
    const start = new Date().toISOString().slice(0, 10);
    const tasks = roles.map((r, i) => ({ id: r.id, name: r.label, start: datePlus(start, i * 7), end: datePlus(start, i * 7 + 6), progress: 0, dependencies: i ? roles[i - 1].id : '' }));
    return ensureSafeDocument(projectRoot(registry, id), 'sdlc/timeline.json', JSON.stringify({ schema: 1, note: 'Illustrative schedule. Edit dates and dependencies to reflect your actual plan.', tasks }, null, 2) + '\n');
}
function validDate(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
}
async function readTimeline(registry, id) {
    const file = await createTimeline(registry, id), raw = await fs.readFile(file, 'utf8');
    if (raw.length > 200000)
        throw Error('Timeline is too large.');
    const doc = JSON.parse(raw);
    if (!Array.isArray(doc.tasks) || doc.tasks.length > 100)
        throw Error('Timeline tasks malformed.');
    const saved = doc.tasks.map(t => {
        for (const k of ['id', 'name', 'start', 'end'])
            if (typeof t[k] !== 'string' || t[k].length > 120)
                throw Error('Invalid timeline field.');
        if (!validDate(t.start) || !validDate(t.end) || t.end < t.start)
            throw Error('Invalid timeline date.');
        return { id: t.id, name: t.name, start: t.start, end: t.end, progress: Math.max(0, Math.min(100, Number(t.progress) || 0)), dependencies: String(t.dependencies || '') };
    });
    const roles = await loadProjectRoles(registry, id), byId = new Map(saved.map(t => [t.id, t]));
    const baseline = new Date().toISOString().slice(0, 10);
    const all = new Set((await allProjectRoles(registry, id)).map(r => r.id));
    const tasks = [...roles.map((r, i) => byId.get(r.id) || { id: r.id, name: r.label, start: datePlus(baseline, i * 7), end: datePlus(baseline, i * 7 + 6), progress: 0, dependencies: '' }), ...saved.filter(t => !all.has(t.id))];
    return { tasks, revision: checksum(raw), path: 'sdlc/timeline.json' };
}
async function saveRoleTimeline(registry, id, roleId, { start, end, progress }, revision) {
    const roles = await loadProjectRoles(registry, id), role = roles.find(r => r.id === roleId);
    if (!role)
        throw Error('Role is not enabled for this project.');
    if (!validDate(start) || !validDate(end) || end < start)
        throw Error('Choose valid dates, with end on or after start.');
    const duration = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000);
    if (duration > 3650)
        throw Error('Role timeline cannot exceed ten years.');
    if (!Number.isInteger(progress) || progress < 0 || progress > 100)
        throw Error('Progress must be 0–100.');
    const root = projectRoot(registry, id), filename = await ensureSafeDocument(root, 'sdlc/timeline.json', '{}');
    const raw = await fs.readFile(filename, 'utf8');
    if (checksum(raw) !== revision)
        throw Error('Timeline changed. Reload Planning before saving.');
    const doc = JSON.parse(raw);
    if (!Array.isArray(doc.tasks) || doc.tasks.length > 100)
        throw Error('Invalid timeline.');
    const next = { id: role.id, name: role.label, start, end, progress };
    const index = doc.tasks.findIndex(t => t.id === roleId);
    if (index >= 0)
        doc.tasks[index] = { ...doc.tasks[index], ...next };
    else
        doc.tasks.push({ ...next, dependencies: '' });
    const payload = JSON.stringify(doc, null, 2) + '\n';
    const tmp = filename + '.atgv-role-save';
    await fs.writeFile(tmp, payload, { flag: 'wx', mode: 0o600 });
    try {
        if (checksum(await fs.readFile(filename, 'utf8')) !== revision)
            throw Error('Timeline changed during save.');
        await fs.rename(tmp, filename);
    }
    finally {
        await fs.rm(tmp, { force: true });
    }
    return readTimeline(registry, id);
}
async function saveBulkRoleTimelines(registry, id, updates, revision) {
    const roles = await loadProjectRoles(registry, id);
    if (!Array.isArray(updates) || updates.length !== roles.length || updates.length > 100)
        throw Error('Provide one timeline update for every enabled role.');
    const enabled = new Map(roles.map(role => [role.id, role]));
    const seen = new Set(), validated = [];
    for (const item of updates) {
        if (!item || typeof item !== 'object' || !enabled.has(item.roleId) || seen.has(item.roleId))
            throw Error('Invalid, duplicated or disabled role timeline.');
        seen.add(item.roleId);
        const { start, end, progress } = item;
        if (!validDate(start) || !validDate(end) || end < start)
            throw Error('Choose valid dates, with end on or after start.');
        const duration = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000);
        if (duration > 3650)
            throw Error('Role timeline cannot exceed ten years.');
        if (!Number.isInteger(progress) || progress < 0 || progress > 100)
            throw Error('Progress must be 0–100.');
        const role = enabled.get(item.roleId);
        validated.push({ id: role.id, name: role.label, start, end, progress });
    }
    const root = projectRoot(registry, id), filename = await ensureSafeDocument(root, 'sdlc/timeline.json', '{}');
    const raw = await fs.readFile(filename, 'utf8');
    if (checksum(raw) !== revision)
        throw Error('Timeline changed. Reload Planning before saving.');
    const doc = JSON.parse(raw);
    if (!Array.isArray(doc.tasks) || doc.tasks.length > 100)
        throw Error('Invalid timeline.');
    const index = new Map(doc.tasks.map((task, i) => [task.id, i]));
    for (const row of validated) {
        if (index.has(row.id))
            doc.tasks[index.get(row.id)] = { ...doc.tasks[index.get(row.id)], ...row };
        else
            doc.tasks.push({ ...row, dependencies: '' });
    }
    if (doc.tasks.length > 100)
        throw Error('Too many timeline tasks.');
    const payload = JSON.stringify(doc, null, 2) + '\n', tmp = filename + '.atgv-bulk-save';
    await fs.writeFile(tmp, payload, { flag: 'wx', mode: 0o600 });
    try {
        if (checksum(await fs.readFile(filename, 'utf8')) !== revision)
            throw Error('Timeline changed during save.');
        await fs.rename(tmp, filename);
    }
    finally {
        await fs.rm(tmp, { force: true });
    }
    return readTimeline(registry, id);
}
async function readDiagram(registry, id) {
    const file = await ensureSafeDocument(projectRoot(registry, id), 'documents/architecture/system-diagram.drawio', DRAWIO_START);
    const st = await fs.stat(file);
    if (st.size > 512000)
        throw Error('Diagram exceeds 512KB.');
    const xml = await fs.readFile(file, 'utf8');
    let model = null, error = '';
    try {
        model = fromDrawioXml(xml);
    }
    catch (e) {
        error = e.message;
    }
    return { model, editable: !!model, error, revision: checksum(xml), path: 'documents/architecture/system-diagram.drawio' };
}
async function saveDiagram(registry, id, xml, revision) {
    if (typeof xml !== 'string' || xml.length > 512000 || !/^\s*(?:<\?xml[^>]*>\s*)?<mxfile\b/.test(xml) || /<(?:!DOCTYPE|!ENTITY)/i.test(xml))
        throw Error('Expected a valid draw.io mxfile document.');
    fromDrawioXml(xml);
    const file = await ensureSafeDocument(projectRoot(registry, id), 'documents/architecture/system-diagram.drawio', DRAWIO_START);
    const current = await fs.readFile(file, 'utf8');
    if (checksum(current) !== revision)
        throw Error('Diagram changed on disk. Reopen before saving.');
    fromDrawioXml(current);
    const tmp = file + '.atgv-save';
    await fs.writeFile(tmp, xml, { flag: 'wx', mode: 0o600 });
    try {
        if (checksum(await fs.readFile(file, 'utf8')) !== revision)
            throw Error('Diagram changed during save.');
        await fs.rename(tmp, file);
    }
    finally {
        await fs.rm(tmp, { force: true });
    }
    return { revision: checksum(xml) };
}
async function saveDiagramModel(registry, id, model, revision) {
    const validated = normalizeModel(model);
    const xml = toDrawioXml(validated);
    return saveDiagram(registry, id, xml, revision);
}
module.exports = { readTimeline, createTimeline, saveRoleTimeline, saveBulkRoleTimelines, readDiagram, saveDiagram, saveDiagramModel, DRAWIO_START };
