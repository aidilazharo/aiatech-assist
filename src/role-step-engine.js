'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { withLock } = require('./file-lock');
const STATES = new Set(['draft', 'in-review', 'verified', 'blocked']);
const ID = /^[a-z][a-z0-9-]{0,48}$/;
const SCOPE = /^(project|BR-[0-9]{1,12}|[A-Z][A-Z0-9_]{1,16}-[0-9]{1,12})$/;
const DEFAULT_STEPS = ['Prepare', 'Execute', 'Review', 'Complete'];
const CONFIGS = {};
const pendingWrites = new Map();

async function withRoleStepWriteLock(filename, write) {
    // Queue local writers before acquiring the lock shared across processes.
    const previous = pendingWrites.get(filename);
    let release;
    const current = new Promise(resolve => { release = resolve; });
    pendingWrites.set(filename, current);
    await previous;
    try {
        return await withLock(filename, write);
    }
    finally {
        if (pendingWrites.get(filename) === current)
            pendingWrites.delete(filename);
        release();
    }
}

function register(roleId, items) {
    if (!ID.test(roleId) || !Array.isArray(items) || items.length < 1 || items.length > 6)
        throw Error('Invalid role plan.');
    CONFIGS[roleId] = items;
}
require('./role-step-plans')(register);
function getPlan(role) {
    const configured = CONFIGS[role.id];
    if (configured)
        return configured.map(s => ({ id: s[0], title: s[1], outputTitles: s[2], requiredCount: s[3] ?? 1 }));
    return role.tasks.map(t => ({ id: t.id, title: t.label, outputTitles: [t.label], requiredCount: 1 }));
}
function rootFor(registry, projectId) { return path.dirname(registry.fileFor(projectId)); }
async function safeFile(registry, projectId) {
    const root = rootFor(registry, projectId), folder = path.join(root, 'sdlc'), file = path.join(folder, 'role-steps.json');
    for (const candidate of [root, folder, file]) {
        const st = await fs.lstat(candidate).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (st?.isSymbolicLink())
            throw Error('Unsafe role progress symlink.');
        if (st && candidate === file && !st.isFile())
            throw Error('Role progress must be a file.');
        if (st && candidate !== file && !st.isDirectory())
            throw Error('Role progress parent must be a directory.');
    }
    return file;
}
async function load(registry, projectId) {
    const file = await safeFile(registry, projectId), raw = await fs.readFile(file, 'utf8').catch(e => e.code === 'ENOENT' ? '' : Promise.reject(e));
    if (!raw)
        return { schema: 1, scopes: {}, updatedAt: null };
    if (raw.length > 4000000)
        throw Error('Role step register too large.');
    const data = JSON.parse(raw);
    if (data?.schema !== 1 || !data.scopes || typeof data.scopes !== 'object' || Array.isArray(data.scopes))
        throw Error('Invalid role step register.');
    return data;
}
function groupKey(roleId, scopeId) { if (!ID.test(roleId) || !SCOPE.test(scopeId))
    throw Error('Invalid workflow scope.'); return roleId + '|' + scopeId; }
function sanitizeTitle(s) { const title = String(s || '').trim(); if (title.length < 3 || title.length > 180)
    throw Error('Output title must be 3–180 characters.'); return title; }
function validEvidence(value) {
    const s = String(value || '').trim();
    if (!s || s.length > 1000)
        throw Error('Provide a real evidence URL or relative document path.');
    if (/^https:\/\//i.test(s))
        return s;
    if (/^(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+$/i.test(s) && !s.split('/').includes('..') && !s.startsWith('.'))
        return s;
    throw Error('Evidence must be an HTTPS link or a safe relative file path.');
}
async function verifyEvidence(registry, projectId, value) {
    const evidence = validEvidence(value);
    if (evidence.startsWith('https://'))
        return evidence;
    const root = rootFor(registry, projectId);
    const full = path.resolve(root, evidence);
    if (!full.startsWith(root + path.sep))
        throw Error('Evidence path escapes project.');
    let at = root;
    for (const part of path.relative(root, full).split(path.sep)) {
        at = path.join(at, part);
        const st = await fs.lstat(at).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (st?.isSymbolicLink())
            throw Error('Symlinked evidence path is not allowed.');
    }
    const stat = await fs.stat(full).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    if (!stat?.isFile() || stat.size === 0)
        throw Error('Evidence file does not exist or is empty.');
    return evidence;
}
function summaryFor(role, state, scopeId = 'project') {
    const plan = getPlan(role), key = groupKey(role.id, scopeId), group = state.scopes[key] || {}, all = [];
    for (const step of plan) {
        const outputs = Array.isArray(group[step.id]?.outputs) ? group[step.id].outputs : [];
        const valid = outputs.filter(o => o && typeof o.title === 'string' && STATES.has(o.status));
        const completed = valid.filter(o => o.status === 'verified').length;
        const blocked = valid.some(o => o.status === 'blocked');
        const status = blocked ? 'blocked' : completed >= step.requiredCount ? 'completed' : valid.some(o => o.status === 'in-review') ? 'review' : 'ready';
        all.push({ id: step.id, title: step.title, requiredCount: step.requiredCount, completed, outputs: valid, status, outputSuggestions: step.outputTitles });
    }
    const done = all.filter(s => s.status === 'completed').length;
    return { roleId: role.id, scopeId, steps: all, completed: done, total: all.length, percent: Math.round(done / Math.max(1, all.length) * 100), nextStep: all.find(s => s.status !== 'completed')?.id || null, status: done === all.length ? 'completed' : all.some(s => s.status === 'blocked') ? 'blocked' : 'in-progress' };
}
async function overview(registry, projectId, roles, scopeId = 'project') {
    const state = await load(registry, projectId);
    return { scopeId, roles: roles.map(r => summaryFor(r, state, scopeId)), updatedAt: state.updatedAt || null };
}
async function update(registry, projectId, roles, action) {
    const role = roles.find(r => r.id === action.roleId);
    if (!role)
        throw Error('Role is disabled or unavailable.');
    const scopeId = String(action.scopeId || 'project'), key = groupKey(role.id, scopeId);
    const plan = getPlan(role), step = plan.find(s => s.id === action.stepId);
    if (!step)
        throw Error('Invalid role workflow step.');
    const filename = await safeFile(registry, projectId);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    return withRoleStepWriteLock(filename, async () => {
        const data = await load(registry, projectId), group = data.scopes[key] || {}, entry = group[step.id] || { outputs: [] };
        if (!Array.isArray(entry.outputs) || entry.outputs.length > 250)
            throw Error('Too many outputs recorded.');
        const now = new Date().toISOString();
        if (action.kind === 'add') {
            if (entry.outputs.length >= 250)
                throw Error('Maximum 250 outputs per workflow step.');
            const title = sanitizeTitle(action.title);
            if (entry.outputs.some(o => o.title.toLowerCase() === title.toLowerCase()))
                throw Error('Output title already exists for this step.');
            const evidence = action.evidence ? validEvidence(action.evidence) : '';
            entry.outputs.push({ id: crypto.randomUUID(), title, evidence, status: 'draft', owner: String(action.owner || '').slice(0, 120), updatedAt: now, history: [{ status: 'draft', at: now }] });
        }
        else if (action.kind === 'set-status') {
            const row = entry.outputs.find(o => o.id === action.outputId);
            if (!row)
                throw Error('Output no longer exists. Refresh.');
            if (!STATES.has(action.status))
                throw Error('Invalid output status.');
            if (row.status === 'verified' && action.status !== 'verified')
                throw Error('Verified output is immutable; create a new output revision instead.');
            if (action.evidence !== undefined)
                row.evidence = validEvidence(action.evidence);
            if (action.status === 'verified') {
                await verifyEvidence(registry, projectId, row.evidence);
                if (row.status !== 'in-review')
                    throw Error('Submit output for review before verifying it.');
                if (!String(action.reviewer || '').trim())
                    throw Error('Record the reviewer for local verification.');
                row.verifiedBy = String(action.reviewer).trim().slice(0, 120);
            }
            row.status = action.status;
            row.updatedAt = now;
            row.history = Array.isArray(row.history) ? row.history : [];
            row.history.push({ status: action.status, at: now, reviewer: row.verifiedBy || '' });
            row.history = row.history.slice(-50);
        }
        else
            throw Error('Unknown role workflow operation.');
        group[step.id] = entry;
        data.scopes[key] = group;
        data.updatedAt = now;
        await fs.mkdir(path.dirname(filename), { recursive: true });
        const tmp = filename + '.' + crypto.randomUUID() + '.tmp';
        try {
            await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
            await fs.rename(tmp, filename);
        }
        finally {
            await fs.rm(tmp, { force: true });
        }
        return summaryFor(role, data, scopeId);
    });
}
function consolidateState(data, roles) {
    const scopes = Object.keys(data.scopes || {}), enabled = new Map(roles.map(r => [r.id, r]));
    const summary = roles.map(role => ({ roleId: role.id, label: role.label, scopes: 0, totalSteps: 0, completedSteps: 0, outputs: 0, verifiedOutputs: 0 }));
    const byRole = new Map(summary.map(r => [r.roleId, r]));
    const evidence = [];
    for (const key of scopes) {
        const sep = key.indexOf('|');
        if (sep < 0)
            continue;
        const role = enabled.get(key.slice(0, sep)), scopeId = key.slice(sep + 1);
        if (!role || !SCOPE.test(scopeId))
            continue;
        const state = summaryFor(role, data, scopeId), target = byRole.get(role.id);
        target.scopes++;
        target.totalSteps += state.total;
        target.completedSteps += state.completed;
        for (const step of state.steps) {
            for (const output of step.outputs) {
                target.outputs++;
                if (output.status === 'verified') {
                    target.verifiedOutputs++;
                    evidence.push({ roleId: role.id, scopeId, stepId: step.id, outputId: output.id, title: output.title, evidence: output.evidence || '' });
                }
            }
        }
    }
    return { roles: summary, scopes: scopes.length, verifiedEvidence: evidence.length, outputs: summary.reduce((a, x) => a + x.outputs, 0), evidence, updatedAt: data.updatedAt };
}
async function consolidated(registry, projectId, roles) { return consolidateState(await load(registry, projectId), roles); }
module.exports = { register, getPlan, summaryFor, overview, update, load, validEvidence, verifyEvidence, CONFIGS, consolidateState, consolidated };
