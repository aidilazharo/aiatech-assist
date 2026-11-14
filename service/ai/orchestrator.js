'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { ProjectMemory, hash } = require('./memory');
const { ProjectRegistry } = require('../../src/projects');
const { getRoleSettings } = require('../../src/sdlc-catalog');
const { resolveAiTarget, sendAiText } = require('../../src/ai-models');
const { SharedMemory, assertNoSecrets } = require('./shared');
const { projectConfig } = require('../../src/projects');
const projectIdFromRoot = async (root) => { const obj = JSON.parse(await fs.readFile(path.join(root, 'atgv.project.json'), 'utf8')); if (!/^[a-z][a-z0-9-]{0,48}$/.test(obj.id))
    throw Error('Invalid project manifest.'); return obj; };
const workerId = () => `${os.hostname().replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60)}-${hash(os.homedir()).slice(0, 12)}`;
async function readText(file) { const stat = await fs.lstat(file).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e)); if (!stat)
    return ''; if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512000)
    throw Error('Unsafe or oversize SDLC document.'); return fs.readFile(file, 'utf8'); }
async function inspectProject(root, memory) {
    const project = await projectIdFromRoot(root), registry = new ProjectRegistry(path.dirname(path.dirname(root))), settings = await getRoleSettings(registry, project.id);
    const raw = await readText(path.join(root, 'documents', 'requirements', 'br-register.json'));
    const br = raw ? JSON.parse(raw) : { brs: [] };
    memory.set('project', { id: project.id, name: project.name, techStackId: project.techStackId || '' });
    memory.set('roles', { enabled: settings.enabled, dependencies: settings.dependencies });
    memory.set('traceability', br.canonical || br.traceability || null);
    memory.syncBR(br);
    const approved = (br.brs || []).filter(x => x.approvedContent && x.approvedRevision && x.status !== 'retired').map(x => ({ br_id: x.id, revision: String(x.approvedRevision), digest: hash(JSON.stringify(x.approvedContent)), data: x.approvedContent }));
    const mappings = JSON.parse(await fs.readFile(path.join(root, 'sdlc', 'ai-document-mapping.json'), 'utf8').catch(e => e.code === 'ENOENT' ? '{}' : Promise.reject(e)));
    const tasks = [];
    for (const role of settings.roles.filter(x => x.enabled)) {
        for (const task of role.tasks.filter(x => x.document)) {
            const relative = path.posix.normalize(task.document);
            if (relative.startsWith('../') || path.isAbsolute(relative) || !relative.endsWith('.md'))
                continue;
            const absolute = path.resolve(root, 'documents', relative);
            if (!absolute.startsWith(path.resolve(root, 'documents') + path.sep))
                throw Error('SDLC document escapes project.');
            const contents = await readText(absolute);
            const baseDigest = hash(contents);
            const id = `${role.id}/${task.id}`;
            const assigned = Array.isArray(mappings[id]) ? approved.filter(x => mappings[id].includes(x.br_id)) : approved;
            const specDigest = hash({ project: project.id, document: id, approved: assigned.map(x => [x.br_id, x.revision, x.digest]), template: task.document });
            const inputDigest = hash([specDigest, baseDigest]);
            memory.document(id, role.id, task.id, baseDigest, { path: relative, title: task.label, snapshot: contents.slice(0, 100000), brRefs: assigned.map(x => ({ id: x.br_id, revision: x.revision })) });
            tasks.push({ id, roleId: role.id, taskId: task.id, relative, title: task.label, contents, baseDigest, inputDigest, specDigest, absolute, approved: assigned });
        }
    }
    return { project, settings, approved, tasks };
}
function allowedOutput(text) { const candidate = String(text || '').trim(); if (!candidate || candidate.length > 80000)
    throw Error('Unusable AI document proposal.'); if (/^(?:I ran|Tests passed|Deployment completed|Approved by)/im.test(candidate))
    throw Error('AI response contains unsupported execution or approval claims.'); return candidate; }
const sectionStart = '## ATGV Requirements-Derived Draft';
const sectionEnd = '## End ATGV Requirements-Derived Draft';
function mergeSection(original, generated) { const text = String(original || ''); const body = allowedOutput(generated).replace(/^## ATGV Requirements-Derived Draft\s*/i, '').trim(); const start = text.indexOf(sectionStart), end = start < 0 ? -1 : text.indexOf(sectionEnd, start + sectionStart.length); if (start >= 0 && end < 0)
    throw Error('Existing generated section markers are inconsistent. Manual reconciliation required.'); if (start < 0)
    return text.trimEnd() + '\n\n' + sectionStart + '\n\n' + body + '\n\n' + sectionEnd + '\n'; return text.slice(0, start) + sectionStart + '\n\n' + body + '\n\n' + text.slice(end); }
const contextPrompt = (item, approved, decisions) => { assertNoSecrets({ current: item.contents, approved, decisions }); return `Create ONLY the requirements-derived Markdown section body for ${item.relative} (${item.title}). You must not claim completed testing, approvals, deployment, or completed tasks. All assumptions must be labeled as assumptions; output a proposal, not evidence of implementation. The host will preserve manually authored sections, so do not reproduce existing content. Do not include the ATGV heading, output Markdown section body only.\n\nEXISTING DOCUMENT CONTEXT:\n${item.contents.slice(0, 16000)}\n\nAPPROVED BR SNAPSHOTS:\n${JSON.stringify(approved.map(x => ({ id: x.br_id, revision: x.revision, content: x.data }))).slice(0, 32000)}\n\nACCEPTED DECISIONS:\n${JSON.stringify(decisions || []).slice(0, 5000)}`; };
async function modelFromEnv(env = process.env) { const provider = env.ATGV_AI_PROVIDER || ''; if (!['openai-compatible', 'ollama'].includes(provider))
    throw Error('Set an organisation-approved unattended ATGV_AI_PROVIDER (openai-compatible or ollama). Interactive Copilot is not supported.'); const endpoint = env.ATGV_AI_ENDPOINT || ''; if (!endpoint)
    throw Error('Set ATGV_AI_ENDPOINT to an approved service.'); if (provider === 'openai-compatible' && !env.ATGV_AI_API_KEY)
    throw Error('ATGV_AI_API_KEY must be provided through a secure environment/credential manager.'); return resolveAiTarget({ config: { provider, endpoint, model: env.ATGV_AI_MODEL || '' }, secret: env.ATGV_AI_API_KEY || '' }); }
async function run({ root, shared, model, limit = 40, worker = workerId(), memoryFactory = dir => new ProjectMemory(dir), generate = sendAiText, onProgress = () => { } }) { const memory = memoryFactory(root), runId = memory.startRun(); let inspected = 0, generated = 0; try {
    onProgress('Scanning approved requirements and role documents', 5);
    const state = await inspectProject(root, memory);
    if (!state.approved.length) {
        memory.finishRun(runId, 'no-approved-br', 0, 0);
        return { status: 'no-approved-br', inspected: 0, generated: 0 };
    }
    const prior = memory.proposals();
    const pending = state.tasks.filter(x => x.approved.length && !prior.some(p => (p.job_id === hash([state.project.id, x.id, x.inputDigest])) || (p.status === 'accepted' && p.metadata.specDigest === x.specDigest && hash(p.content) === x.baseDigest)));
    inspected = state.tasks.length;
    onProgress('Comparing approved revisions and document fingerprints', 20);
    if (!pending.length) {
        memory.finishRun(runId, 'unchanged', inspected, 0);
        return { status: 'unchanged', inspected, generated: 0 };
    }
    if (!shared) {
        memory.finishRun(runId, 'waiting-for-coordination', inspected, 0, 'Shared Confluence coordination is required for distributed generation.');
        return { status: 'waiting-for-coordination', inspected, generated: 0 };
    }
    const target = model || await modelFromEnv();
    const decisions = memory.decisions();
    for (const [i, item] of pending.slice(0, limit).entries()) {
        const jobId = hash([state.project.id, item.id, item.inputDigest]);
        memory.job(jobId, item.id, item.inputDigest, worker);
        const lease = await shared.acquire(jobId, worker);
        if (!lease) {
            onProgress(`Job owned by another worker: ${item.id}`, 25 + Math.floor(i / pending.length * 65));
            continue;
        }
        try {
            memory.jobState(jobId, 'running', worker);
            const heartbeat = typeof shared.renew === 'function' ? setInterval(() => shared.renew(jobId, worker, lease.nonce).catch(() => { }), 60000) : null;
            heartbeat?.unref?.();
            try {
                const draft = mergeSection(item.contents, await generate({ target, prompt: contextPrompt(item, item.approved, decisions), maxChars: 40000 }));
                if (!await shared.holds(jobId, worker, lease.nonce))
                    throw Error('Shared lease expired before saving; generated output discarded.');
                const current = await readText(item.absolute);
                if (hash(current) !== item.baseDigest)
                    throw Error('Document changed during generation. Proposal discarded; retry with new input.');
                memory.proposal({ jobId, documentId: item.id, baseDigest: item.baseDigest, inputDigest: item.inputDigest, content: draft, metadata: { roleId: item.roleId, taskId: item.taskId, path: item.relative, worker, approved: item.approved.map(x => ({ id: x.br_id, revision: x.revision })), specDigest: item.specDigest, model: target.name || target.modelId } });
                await shared.finish(jobId, worker, lease.nonce, true);
                memory.jobState(jobId, 'proposed', worker);
                generated++;
                onProgress('Draft proposed: ' + item.id, 25 + Math.floor((i + 1) / pending.length * 70));
            }
            finally {
                if (heartbeat)
                    clearInterval(heartbeat);
            }
        }
        catch (e) {
            memory.jobState(jobId, 'failed', worker, e.message);
            await shared.finish(jobId, worker, lease.nonce, false).catch(() => { });
            onProgress('Generation failed: ' + item.id + ' — ' + e.message, 90);
        }
    }
    memory.finishRun(runId, 'complete', inspected, generated);
    return { status: 'complete', inspected, generated };
}
catch (e) {
    memory.finishRun(runId, 'error', inspected, generated, e.message);
    throw e;
}
finally {
    memory.close();
} }
async function readStatus(root) { const memory = new ProjectMemory(root); try {
    return memory.status();
}
finally {
    memory.close();
} }
async function decide({ root, jobId, action, edited, expectedDigest }) { const memory = new ProjectMemory(root); try {
    const proposal = memory.proposals().find(x => x.job_id === jobId);
    if (!proposal || proposal.status !== 'pending')
        throw Error('Proposal is no longer pending.');
    if (action === 'reject') {
        memory.decide(jobId, 'rejected');
        return { status: 'rejected' };
    }
    if (action !== 'accept')
        throw Error('Invalid proposal action.');
    const project = await projectIdFromRoot(root);
    const registry = new ProjectRegistry(path.dirname(path.dirname(root)));
    const settings = await getRoleSettings(registry, project.id);
    const [roleId, taskId] = proposal.document_id.split('/');
    if (!settings.roles.some(r => r.id === roleId && r.enabled && r.tasks.some(t => t.id === taskId)))
        throw Error('Role document no longer enabled.');
    const { saveDocumentMarkdown, documentLocation } = require('../../src/document-editor');
    const current = await readText(await documentLocation(registry, project.id, roleId, taskId));
    if (hash(current) !== proposal.base_digest || expectedDigest !== proposal.base_digest)
        throw Error('Document changed since proposal generation. Reconcile before accepting.');
    const content = allowedOutput(edited === undefined ? proposal.content : edited);
    await saveDocumentMarkdown(registry, project.id, roleId, taskId, content, proposal.base_digest);
    memory.decide(jobId, 'accepted', content);
    memory.event('accepted', { jobId, roleId, taskId, approved: proposal.metadata.approved });
    memory.recordDecision('ai-document-accepted', { jobId, documentId: proposal.document_id, contentDigest: hash(content), approved: proposal.metadata.approved });
    memory.queueOperation('confluence-doc', { documentId: proposal.document_id, digest: hash(content) });
    return { status: 'accepted', documentId: proposal.document_id };
}
finally {
    memory.close();
} }
module.exports = { run, inspectProject, readStatus, decide, modelFromEnv, workerId, contextPrompt, allowedOutput, mergeSection };
