'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { withLock } = require('./file-lock');
const key = (roleId, brId) => roleId + '|' + brId;
async function fileFor(registry, projectId) {
    const root = path.dirname(registry.fileFor(projectId));
    for (const rel of ['sdlc', 'sdlc/handoff-progress.json']) {
        const file = path.join(root, rel);
        const st = await fs.lstat(file).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (st?.isSymbolicLink())
            throw Error('Unsafe handoff progress path.');
        if (st && (rel.endsWith('.json') ? !st.isFile() : !st.isDirectory()))
            throw Error('Invalid handoff progress path.');
    }
    return path.join(root, 'sdlc', 'handoff-progress.json');
}
async function read(registry, projectId) {
    const file = await fileFor(registry, projectId);
    const raw = await fs.readFile(file, 'utf8').catch(e => e.code === 'ENOENT' ? '' : Promise.reject(e));
    if (!raw)
        return {};
    const result = JSON.parse(raw);
    if (!result || Array.isArray(result) || typeof result !== 'object' || Object.keys(result).length > 1000)
        throw Error('Invalid handoff progress data.');
    return result;
}
async function toggle(registry, projectId, roleId, brId, brRevision, taskId, completed) {
    if (!/^[a-z][a-z0-9-]{0,48}$/.test(roleId) || !/^BR-[0-9]+$/.test(brId) || !Number.isInteger(brRevision) || brRevision < 1 || !/^[a-z][a-z0-9-]{0,48}$/.test(taskId))
        throw Error('Invalid handoff task.');
    const file = await fileFor(registry, projectId);
    const { loadProjectRoles } = require('./sdlc-catalog');
    const roles = await loadProjectRoles(registry, projectId), role = roles.find(x => x.id === roleId);
    if (!role || !role.tasks.some(x => x.id === taskId))
        throw Error('Unknown role task.');
    await fs.mkdir(path.dirname(file), { recursive: true });
    return withLock(file, async () => {
        const { workState } = require('./sdlc-work');
        const state = await workState(registry, projectId);
        const handoff = state.readiness.handoffs.find(x => x.roleId === roleId)?.items.find(x => x.brId === brId);
        if (!handoff || handoff.brRevision !== brRevision || handoff.status === 'blocked')
            throw Error('BR revision or prerequisites changed. Refresh My Work.');
        const progress = await read(registry, projectId);
        const id = key(roleId, brId), entry = progress[id];
        const tasks = entry?.revision === brRevision ? { ...entry.tasks } : {};
        tasks[taskId] = Boolean(completed);
        progress[id] = { revision: brRevision, tasks, updated: new Date().toISOString() };
        const temp = file + '.' + crypto.randomUUID() + '.tmp';
        try {
            await fs.writeFile(temp, JSON.stringify(progress, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
            await fs.rename(temp, file);
        }
        finally {
            await fs.rm(temp, { force: true });
        }
        return progress[id];
    });
}
module.exports = { read, toggle, key };
