'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { evaluate } = require('./continuity');
const TASK_MAP = { planning: 'documents/development/project-plan.md', architecture: 'documents/architecture/architecture-proposal.md', 'acceptance-tests': 'documents/testing/acceptance-test-draft.md' };
const fingerprint = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
async function rejectLinks(target, stop) {
    const root = path.resolve(stop), resolved = path.resolve(target);
    if (resolved !== root && !resolved.startsWith(root + path.sep))
        throw new Error('Unsafe project path.');
    const parts = path.relative(root, resolved).split(path.sep);
    let at = root;
    const roots = await fs.lstat(at).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    if (roots?.isSymbolicLink())
        throw new Error('Symlinked project root is not allowed.');
    for (const p of parts) {
        at = path.join(at, p);
        const st = await fs.lstat(at).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (st?.isSymbolicLink())
            throw new Error('Symlinked project file or directory refused.');
    }
}
async function loadState(file) { try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}
catch (e) {
    if (e.code === 'ENOENT')
        return { schema: 1, tasks: {}, events: [] };
    throw e;
} }
async function persist(file, state) { await fs.mkdir(path.dirname(file), { recursive: true }); const tmp = file + '.' + crypto.randomUUID() + '.tmp'; try {
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(tmp, file);
}
finally {
    await fs.rm(tmp, { force: true });
} }
function plan(answers, prior = { tasks: {} }) {
    const readiness = evaluate(answers);
    const inputs = { planning: ['problem', 'scope', 'stakeholders', 'measures'], architecture: ['targetProcess', 'dependencies', 'constraints', 'data', 'scope'],
        'acceptance-tests': ['acceptance', 'businessRules', 'targetProcess', 'problem'] };
    return readiness.tasks.filter(t => t.id in TASK_MAP).map(t => {
        const fingerprintInput = Object.fromEntries(inputs[t.id].map(k => [k, answers[k] || '']));
        const inputHash = fingerprint(fingerprintInput);
        return { id: t.id, title: t.name, path: TASK_MAP[t.id], inputHash, status: !t.ready ? 'blocked' : prior.tasks?.[t.id]?.inputHash === inputHash && ['draft', 'existing-file'].includes(prior.tasks[t.id].status) ? 'up-to-date' : 'ready', blockedBy: t.blockedBy || null };
    });
}
class WorkflowEngine {
    constructor({ root, generate }) { this.root = root; this.generate = generate; this.inFlight = new Set(); }
    statePath(projectId) { if (!/^[a-z0-9][a-z0-9-]{0,70}$/.test(projectId))
        throw new Error('Invalid project ID.'); return path.join(this.root, projectId, 'sdlc', 'automation.json'); }
    async inspect(projectId, answers) { const state = await loadState(this.statePath(projectId)); return { tasks: plan(answers, state), history: state.events.slice(-30) }; }
    async prepare(projectId, answers, { allowModel = false } = {}) {
        if (this.inFlight.has(projectId))
            throw new Error('Project AI run already active.');
        this.inFlight.add(projectId);
        try {
            const file = this.statePath(projectId);
            await rejectLinks(file, this.root);
            const state = await loadState(file), tasks = plan(answers, state), results = [];
            for (const task of tasks) {
                if (task.status !== 'ready') {
                    results.push({ id: task.id, status: task.status, blockedBy: task.blockedBy });
                    continue;
                }
                if (!allowModel) {
                    results.push({ id: task.id, status: 'awaiting-consent' });
                    continue;
                }
                if (typeof this.generate !== 'function')
                    throw new Error('No approved AI provider configured.');
                let output;
                try {
                    output = String(await this.generate({ task, answers }));
                    if (!output.trim())
                        throw new Error('AI returned an empty document.');
                }
                catch (e) {
                    state.events.push({ task: task.id, type: 'generation-failed', reason: String(e.message).slice(0, 250), at: new Date().toISOString() });
                    results.push({ id: task.id, status: 'failed', reason: e.message });
                    continue;
                }
                const draftRel = `sdlc/ai-proposals/${task.id}-${task.inputHash.slice(0, 12)}.md`;
                const target = path.join(this.root, projectId, draftRel), base = path.resolve(this.root, projectId);
                if (!path.resolve(target).startsWith(base + path.sep))
                    throw new Error('Document outside project.');
                await rejectLinks(target, this.root);
                await fs.mkdir(path.dirname(target), { recursive: true });
                let written = false;
                try {
                    await fs.writeFile(target, `<!-- AI DRAFT: requires human review; source hash ${task.inputHash} -->\n\n` + output, { flag: 'wx' });
                    written = true;
                }
                catch (e) {
                    if (e.code !== 'EEXIST')
                        throw e;
                }
                state.tasks[task.id] = { inputHash: task.inputHash, status: written ? 'draft' : 'existing-file', path: draftRel, updated: new Date().toISOString() };
                state.events.push({ task: task.id, type: written ? 'ai-draft-created' : 'existing-file-protected', at: new Date().toISOString() });
                results.push({ id: task.id, status: written ? 'draft' : 'existing-file', path: draftRel });
            }
            state.events = state.events.slice(-200);
            await persist(file, state);
            return results;
        }
        finally {
            this.inFlight.delete(projectId);
        }
    }
}
module.exports = { WorkflowEngine, plan, fingerprint, loadState };
