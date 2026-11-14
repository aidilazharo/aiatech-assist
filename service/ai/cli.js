'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { run, workerId } = require('./orchestrator');
const { SharedMemory } = require('./shared');
const { projectConfig } = require('../../src/projects');
const { ProjectMemory, hash } = require('./memory');
const { DocumentSync } = require('../../src/confluence-docsync');
async function runOnce({ root, env = process.env }) {
    const configuration = JSON.parse(await fs.readFile(path.join(root, 'atgv.project.json'), 'utf8'));
    const settings = JSON.parse(await fs.readFile(path.join(root, 'knowledge', 'ai-service.json'), 'utf8').catch(e => e.code === 'ENOENT' ? '{}' : Promise.reject(e)));
    const local = new ProjectMemory(root);
    try {
        local.set('project', configuration);
        const raw = await fs.readFile(path.join(root, 'documents', 'requirements', 'br-register.json'), 'utf8').catch(e => e.code === 'ENOENT' ? '{}' : Promise.reject(e));
        local.syncBR(JSON.parse(raw));
    }
    finally {
        local.close();
    }
    if (!settings.enabled)
        return { status: 'disabled' };
    const effective = projectConfig(configuration);
    const token = env.ATGV_ATLASSIAN_TOKEN;
    if (!token) {
        const m = new ProjectMemory(root);
        try {
            m.event('sync-unavailable', { reason: 'No OS credential injection configured' });
        }
        finally {
            m.close();
        }
        return { status: 'no-shared-credentials' };
    }
    const shared = new SharedMemory({ config: effective, token, projectId: configuration.id });
    const store = new ProjectMemory(root);
    try {
        const remote = await shared.read();
        store.importShared(remote.value.manifest, configuration.id);
    }
    finally {
        store.close();
    }
    const result = await run({ root, shared, worker: workerId() });
    const refreshed = new ProjectMemory(root);
    try {
        const docs = new DocumentSync({ folder: root, config: effective, token });
        for (const operation of refreshed.operations().filter(x => x.kind === 'confluence-doc')) {
            try {
                const body = JSON.parse(operation.body), doc = refreshed.documentMeta(body.documentId);
                if (!doc?.metadata?.path)
                    throw Error('Document mapping unavailable');
                const rel = doc.metadata.path, result = await docs.sync({ max: 1, only: [rel] }), links = await docs.read();
                const current = await fs.readFile(path.join(root, 'documents', rel), 'utf8');
                if ((result.conflicts || []).length)
                    throw Error('Confluence document conflict needs owner review');
                if (links.entries[rel]?.localHash !== hash(current.replace(/\r\n/g, '\n')))
                    throw Error('Accepted document not yet synchronized; retry later');
                refreshed.completeOperation(operation.operation_id);
            }
            catch (e) {
                refreshed.retryOperation(operation.operation_id, e.message);
            }
        }
        const manifest = refreshed.manifest(configuration.id);
        const merged = await shared.mergeManifest(manifest, refreshed.get('shared-manifest', {}));
        refreshed.set('shared-manifest', merged);
        refreshed.set('shared-sync', new Date().toISOString());
        for (const op of refreshed.operations().filter(x => x.kind === 'manifest'))
            refreshed.completeOperation(op.operation_id);
    }
    catch (e) {
        refreshed.queueOperation('manifest', refreshed.manifest(configuration.id));
        refreshed.event('sync-failed', { message: e.message });
    }
    finally {
        refreshed.close();
    }
    return result;
}
if (require.main === module) {
    const args = process.argv.slice(2), index = args.indexOf('--project');
    if (index < 0 || !args[index + 1]) {
        process.stderr.write('Usage: node cli.js --project /absolute/project/path\n');
        process.exitCode = 2;
    }
    else
        runOnce({ root: path.resolve(args[index + 1]) }).then(x => process.stdout.write(JSON.stringify(x) + '\n')).catch(e => { process.stderr.write('ATGV AI service: ' + e.message + '\n'); process.exitCode = 1; });
}
module.exports = { runOnce };
