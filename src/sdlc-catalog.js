'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { ROLES } = require('./sdlc-work');
const { withLock } = require('./file-lock');
const OPTIONAL_ROLES = Object.freeze([
    { id: 'technical-lead', label: 'Technical Lead', short: 'TL', stage: 'Technical Delivery', description: 'Guide implementation, resolve blockers, review pull requests and validate test evidence alongside Developers.', tasks: [{ id: 'plan', label: 'Implementation plan', document: 'development/tech-lead-plan.md' }, { id: 'standards', label: 'Coding and test standards', document: 'development/coding-standards.md' }, { id: 'review', label: 'Independent pull request review', document: 'development/tech-lead-review.md' }, { id: 'handoff', label: 'Technical handoff reviewed', note: 'Verify current code and test evidence before sign-off' }] },
    { id: 'business-owner', label: 'Business Owner / Approver', short: 'BO', stage: 'Business Approval', description: 'Approve business outcomes and decisions.', tasks: [{ id: 'decision', label: 'Business approval decision', document: 'governance/business-approval.md' }] },
    { id: 'ai-ml-engineer', label: 'AI / ML Engineer', short: 'AI', stage: 'AI Development', description: 'Design and evaluate AI components.', tasks: [{ id: 'model', label: 'Model design', document: 'ai/model-design.md' }, { id: 'evaluation', label: 'Model evaluation', document: 'ai/model-evaluation.md' }] },
    { id: 'compliance-officer', label: 'Compliance / Risk Officer', short: 'RISK', stage: 'Compliance Review', description: 'Review regulatory and enterprise risk controls.', tasks: [{ id: 'control', label: 'Risk controls', document: 'governance/risk-controls.md' }, { id: 'decision', label: 'Compliance decision', document: 'governance/compliance-approval.md' }] }
]);
const STANDARD = [...ROLES, ...OPTIONAL_ROLES];
const BASE_DEPENDENCIES = {
    'product-owner': ['business-analyst'], 'solution-architect': ['business-analyst'], 'ux-designer': ['business-analyst'],
    'security-engineer': ['business-analyst'], 'data-engineer': ['business-analyst'], 'technical-writer': ['business-analyst'],
    'business-owner': ['business-analyst'], 'ai-ml-engineer': ['business-analyst'], 'compliance-officer': ['business-analyst'],
    'technical-lead': ['solution-architect'], 'software-developer': ['solution-architect', 'product-owner'], 'qa-engineer': ['business-analyst'],
    'uat-tester': ['qa-engineer'], 'release-manager': ['qa-engineer', 'uat-tester'], 'operations-support': ['release-manager']
};
const ID = /^[a-z][a-z0-9-]{0,48}$/;
const DOC = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.md$/;
function slug(s) { return String(s || '').normalize('NFKD').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48); }
function normalizeRole(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error('Invalid SDLC role configuration.');
    const id = String(value.id || '');
    if (!ID.test(id))
        throw Error('Invalid role ID.');
    const bounded = (v, k, max) => { if (typeof v !== 'string' || !v.trim() || v.length > max)
        throw Error('Invalid ' + k); return v.trim(); };
    const label = bounded(value.label, 'role label', 100), stage = bounded(value.stage || 'Delivery', 'role stage', 100);
    const description = bounded(value.description || label, 'role description', 400);
    if (!Array.isArray(value.tasks) || value.tasks.length < 1 || value.tasks.length > 25)
        throw Error('Role needs 1–25 tasks.');
    const used = new Set(), tasks = value.tasks.map((t) => {
        if (!t || !ID.test(t.id) || used.has(t.id))
            throw Error('Invalid or duplicate SDLC task ID.');
        used.add(t.id);
        const task = { id: t.id, label: bounded(t.label, 'task label', 150) };
        if (t.document !== undefined) {
            if (typeof t.document !== 'string' || !DOC.test(t.document) || t.document.includes('..'))
                throw Error('Invalid role document path.');
            task.document = t.document;
        }
        if (t.template !== undefined) {
            if (typeof t.template !== 'string' || !/^[a-z0-9-]+\.md$/.test(t.template))
                throw Error('Invalid template name.');
            task.template = t.template;
        }
        if (t.note !== undefined)
            task.note = bounded(t.note, 'task note', 250);
        return task;
    });
    return { id, label, short: String(value.short || label.split(/\s+/).slice(0, 2).map(w => w[0]).join('')).slice(0, 4).toUpperCase(), stage, description, icon: 'layers', tasks };
}
async function allProjectRoles(registry, projectId) {
    if (!registry || !projectId)
        return STANDARD;
    const folder = path.join(path.dirname(registry.fileFor(projectId)), 'sdlc', 'roles');
    const entries = await fs.readdir(folder, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT')
        return []; throw e; });
    if (entries.length > 150)
        throw Error('Too many role definitions.');
    const custom = [];
    for (const ent of entries) {
        if (!ent.name.endsWith('.json'))
            continue;
        if (!ent.isFile() || ent.isSymbolicLink())
            throw Error('Role configuration must be a regular file.');
        const filename = path.join(folder, ent.name);
        const stat = await fs.lstat(filename);
        if (stat.size > 16384)
            throw Error('Role configuration too large.');
        const def = normalizeRole(JSON.parse(await fs.readFile(filename, 'utf8')));
        if (ent.name !== def.id + '.json')
            throw Error('Role ID must match filename.');
        custom.push(def);
    }
    const merged = new Map(STANDARD.map(role => [role.id, role]));
    for (const role of custom) {
        if (merged.has(role.id))
            throw Error('Custom role cannot override a built-in role.');
        merged.set(role.id, role);
    }
    return [...merged.values()];
}
const { createHash } = require('node:crypto');
const roleRevision = raw => createHash('sha256').update(raw).digest('hex');
async function roleSettingsFile(registry, id) {
    const root = path.dirname(registry.fileFor(id)), folder = path.join(root, 'sdlc');
    const st = await fs.lstat(folder).catch(e => { if (e.code === 'ENOENT')
        return null; throw e; });
    if (st && (!st.isDirectory() || st.isSymbolicLink()))
        throw Error('Unsafe SDLC settings directory.');
    return path.join(folder, 'enabled-roles.json');
}
async function getRoleSettings(registry, projectId) {
    const roles = await allProjectRoles(registry, projectId);
    const filename = await roleSettingsFile(registry, projectId);
    const st = await fs.lstat(filename).catch(e => { if (e.code === 'ENOENT')
        return null; throw e; });
    if (st && (!st.isFile() || st.isSymbolicLink() || st.size > 20000))
        throw Error('Unsafe SDLC role settings.');
    const raw = st ? await fs.readFile(filename, 'utf8') : '';
    const data = raw ? JSON.parse(raw) : {};
    if (data.enabled !== undefined && (!Array.isArray(data.enabled) || data.enabled.some(x => typeof x !== 'string')))
        throw Error('Invalid enabled SDLC roles.');
    const enabled = data.enabled === undefined ? roles.filter(r => !OPTIONAL_ROLES.some(x => x.id === r.id)).map(r => r.id) : roles.filter(r => data.enabled.includes(r.id)).map(r => r.id);
    const originalOrder = Array.isArray(data.order) ? data.order.filter(id => typeof id === 'string' && roles.some(role=>role.id===id)) : [];
    const order = [...new Set([...originalOrder,...roles.map(role=>role.id)])];
    const orderedRoles = [...roles].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
    const dependencies = {};
    for (const role of roles) {
        const choices = data.dependencies?.[role.id] ?? BASE_DEPENDENCIES[role.id] ?? [];
        dependencies[role.id] = Array.isArray(choices) ? choices.filter(x => roles.some(r => r.id === x && x !== role.id)) : [];
    }
    const exposed = await Promise.all(orderedRoles.map(async (r) => ({ id: r.id, label: r.label, stage: r.stage, description: r.description, custom: !STANDARD.some(v => v.id === r.id), optional: OPTIONAL_ROLES.some(v => v.id === r.id), enabled: enabled.includes(r.id), dependsOn: dependencies[r.id], tasks: r.tasks.map(t => ({ id: t.id, label: t.label, document: t.document || '' })), definitionRevision: !STANDARD.some(v => v.id === r.id) ? await customRoleRevision(registry, projectId, r.id) : null })));
    return { roles: exposed, enabled, dependencies, order, revision: roleRevision(raw) };
}
async function loadProjectRoles(registry, projectId) {
    if (!registry || !projectId)
        return ROLES;
    const info = await getRoleSettings(registry, projectId);
    const enabled = new Set(info.enabled);
    const roles = await allProjectRoles(registry, projectId);
    return roles.filter(role=>enabled.has(role.id)).sort((a,b)=>info.order.indexOf(a.id)-info.order.indexOf(b.id));
}
function verifyDependencies(roles, dependencies) {
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies))
        throw Error('Invalid role dependencies.');
    const ids = new Set(roles.map(r => r.id)), output = {};
    for (const role of roles) {
        const deps = dependencies[role.id] || [];
        if (!Array.isArray(deps) || deps.length > 30 || new Set(deps).size !== deps.length || deps.some(d => !ids.has(d) || d === role.id))
            throw Error('Invalid dependency for ' + role.label);
        output[role.id] = deps;
    }
    const seen = new Set(), stack = new Set();
    function walk(id) { if (stack.has(id))
        throw Error('Circular SDLC role dependency.'); if (seen.has(id))
        return; stack.add(id); for (const dep of output[id])
        walk(dep); stack.delete(id); seen.add(id); }
    for (const role of roles)
        walk(role.id);
    return output;
}
async function saveRoleSettings(registry, projectId, enabled, revision, dependencies, roleOrder) {
    if (!Array.isArray(enabled) || !enabled.length || new Set(enabled).size !== enabled.length)
        throw Error('Enable at least one unique SDLC role.');
    const available = await allProjectRoles(registry, projectId);
    if (enabled.some(id => typeof id !== 'string' || !available.some(role => role.id === id)))
        throw Error('Unknown SDLC role.');
    const filename = await roleSettingsFile(registry, projectId);
    const current = await getRoleSettings(registry, projectId);
    const verified = verifyDependencies(available, dependencies === undefined ? current.dependencies : dependencies);
    const order = roleOrder === undefined ? current.order : roleOrder;
    if(!Array.isArray(order)||order.length!==available.length||new Set(order).size!==order.length||order.some(id=>!available.some(role=>role.id===id)))throw Error('Role display order is invalid. Refresh and try again.');
    if (revision !== current.revision)
        throw Error('Role settings changed. Refresh before saving.');
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const payload = JSON.stringify({ schema: 3, enabled: available.filter(role => enabled.includes(role.id)).map(role => role.id), order, dependencies: verified }, null, 2) + '\n';
    return withLock(filename, async () => {
        if ((await getRoleSettings(registry, projectId)).revision !== revision)
            throw Error('Role settings changed during save.');
        const tmp = filename + '.' + require('node:crypto').randomUUID() + '.tmp';
        try {
            await fs.writeFile(tmp, payload, { flag: 'wx', mode: 0o600 });
            await fs.rename(tmp, filename);
        }
        finally {
            await fs.rm(tmp, { force: true });
        }
        return getRoleSettings(registry, projectId);
    });
}
async function createProjectRole(registry, projectId, fields) {
    const label = String(fields?.label || '').trim();
    const id = slug(label);
    if (!ID.test(id) || !label)
        throw Error('Provide a valid role name.');
    if (STANDARD.some(r => r.id === id))
        throw Error('This role already exists.');
    const titles = String(fields?.documents || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    if (!titles.length || titles.length > 16 || titles.some(t => t.length > 120))
        throw Error('Enter 1–16 document titles (one per line).');
    const keys = new Set(), tasks = titles.map((title, index) => {
        let key = slug(title);
        if (!key)
            key = 'document-' + (index + 1);
        if (keys.has(key))
            throw Error('Document titles must be unique.');
        keys.add(key);
        return { id: key, label: title, document: 'custom/' + id + '/' + key + '.md' };
    });
    const role = normalizeRole({ id, label, stage: String(fields?.stage || 'Delivery'), description: String(fields?.description || 'Deliver project documents.'), tasks });
    const projectRoot = path.dirname(registry.fileFor(projectId)), folder = path.join(projectRoot, 'sdlc', 'roles');
    const root = await fs.realpath(projectRoot);
    const parent = path.join(projectRoot, 'sdlc');
    for (const location of [parent, folder]) {
        const st = await fs.lstat(location).catch(e => { if (e.code === 'ENOENT')
            return null; throw e; });
        if (st?.isSymbolicLink())
            throw Error('Unsafe SDLC role directory.');
    }
    for (const part of ['documents', 'documents/custom', 'documents/custom/' + id]) {
        const loc = path.join(projectRoot, part);
        const st = await fs.lstat(loc).catch(e => { if (e.code === 'ENOENT')
            return null; throw e; });
        if (st?.isSymbolicLink() || st && !st.isDirectory())
            throw Error('Unsafe role document directory.');
    }
    await fs.mkdir(folder, { recursive: true });
    const file = path.join(folder, id + '.json');
    await fs.writeFile(file, JSON.stringify({ schema: 1, ...role }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const docRoot = path.join(root, 'documents', 'custom', id);
    await fs.mkdir(docRoot, { recursive: true });
    for (const task of tasks) {
        const name = path.join(docRoot, task.id + '.md');
        await fs.writeFile(name, '# ' + task.label + '\n\n> Draft — ' + label + '\n\n## Purpose\n\nTBD\n\n## Content\n\nTBD\n\n## Review\n\nPending\n', { flag: 'wx', mode: 0o600 });
    }
    const processId = slug(role.stage);
    if (processId) {
        const processes = path.join(projectRoot, 'sdlc', 'processes');
        const stat = await fs.lstat(processes).catch(e => { if (e.code === 'ENOENT')
            return null; throw e; });
        if (stat?.isSymbolicLink())
            throw Error('Unsafe SDLC processes directory.');
        await fs.mkdir(processes, { recursive: true });
        await fs.writeFile(path.join(processes, processId + '.json'), JSON.stringify({ schema: 1, id: processId, name: role.stage, roles: [role.id], deliverables: tasks.map(t => t.document) }, null, 2) + '\n', { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST')
            throw e; });
    }
    return role;
}
async function updateProjectRole(registry, projectId, roleId, fields, revision) {
    const filename = path.join(path.dirname(registry.fileFor(projectId)), 'sdlc', 'roles', roleId + '.json');
    if (!ID.test(roleId) || STANDARD.some(r => r.id === roleId))
        throw Error('Only custom roles can be edited.');
    return withLock(filename, async () => {
        const st = await fs.lstat(filename);
        if (!st.isFile() || st.isSymbolicLink())
            throw Error('Unsafe role definition.');
        const raw = await fs.readFile(filename, 'utf8');
        if (roleRevision(raw) !== revision)
            throw Error('Role changed. Refresh before saving.');
        const previous = normalizeRole(JSON.parse(raw));
        const titles = String(fields.documents || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        if (!titles.length || titles.length > 16 || titles.some(x => x.length > 120))
            throw Error('Enter 1–16 deliverables.');
        const tasks = titles.map((label, i) => {
            const original = previous.tasks[i];
            if (original)
                return { ...original, label };
            let id = slug(label);
            if (!id)
                id = 'document-' + (i + 1);
            return { id, label, document: 'custom/' + roleId + '/' + id + '.md' };
        });
        const updated = normalizeRole({ id: roleId, label: fields.label, stage: fields.stage, description: fields.description, tasks });
        if (new Set(tasks.map(t => t.id)).size !== tasks.length)
            throw Error('Duplicate deliverable ID.');
        const root = path.dirname(registry.fileFor(projectId));
        for (const task of tasks.slice(previous.tasks.length)) {
            const folder = path.join(root, 'documents', 'custom', roleId);
            await fs.mkdir(folder, { recursive: true });
            const file = path.join(folder, task.id + '.md');
            await fs.writeFile(file, '# ' + task.label + '\n\n## Purpose\n\nTBD\n', { flag: 'wx', mode: 0o600 }).catch(e => { if (e.code !== 'EEXIST')
                throw e; });
        }
        const tmp = filename + '.' + require('node:crypto').randomUUID() + '.tmp';
        try {
            await fs.writeFile(tmp, JSON.stringify({ schema: 1, ...updated }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
            await fs.rename(tmp, filename);
        }
        finally {
            await fs.rm(tmp, { force: true });
        }
        return updated;
    });
}
async function deleteProjectRole(registry, projectId, roleId, revision) {
    if (!ID.test(roleId) || STANDARD.some(r => r.id === roleId))
        throw Error('Only custom roles can be removed.');
    const folder = path.join(path.dirname(registry.fileFor(projectId)), 'sdlc', 'roles');
    const filename = path.join(folder, roleId + '.json');
    await withLock(filename, async () => {
        const st = await fs.lstat(filename);
        if (!st.isFile() || st.isSymbolicLink())
            throw Error('Unsafe role definition.');
        if (roleRevision(await fs.readFile(filename, 'utf8')) !== revision)
            throw Error('Role changed. Refresh before removal.');
        await fs.unlink(filename);
    });
    return getRoleSettings(registry, projectId);
}
async function customRoleRevision(registry, projectId, roleId) {
    if (!ID.test(roleId) || STANDARD.some(r => r.id === roleId))
        throw Error('Not a custom role.');
    const file = path.join(path.dirname(registry.fileFor(projectId)), 'sdlc', 'roles', roleId + '.json');
    const st = await fs.lstat(file);
    if (!st.isFile() || st.isSymbolicLink())
        throw Error('Unsafe role definition.');
    return roleRevision(await fs.readFile(file, 'utf8'));
}
module.exports = { slug, normalizeRole, loadProjectRoles, allProjectRoles, getRoleSettings, saveRoleSettings, createProjectRole, updateProjectRole, deleteProjectRole, customRoleRevision, OPTIONAL_ROLES, BASE_DEPENDENCIES, verifyDependencies };
