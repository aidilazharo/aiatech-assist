'use strict';
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { OwnershipRegistry, identifier } = require('../src/ownership');
const { WorkflowEngine } = require('../src/workflow-engine');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
function createServer({ root, users = {}, model = null, sharedProjectsRoot = null, autoProjects = [], pollMs = 60000 } = {}) {
    if (!root)
        throw new Error('ATGV service data directory required.');
    const registry = new OwnershipRegistry(path.join(root, 'ownership.json'));
    const sharedRoot = sharedProjectsRoot || path.join(root, 'projects');
    const work = new WorkflowEngine({ root: sharedRoot, generate: model });
    let timer = null, polling = false;
    const poll = async () => {
        if (polling || !model)
            return;
        polling = true;
        try {
            for (const project of autoProjects) {
                try {
                    identifier(project);
                    const raw = await fs.readFile(path.join(sharedRoot, project, 'documents', 'requirements', 'discovery-12.json'), 'utf8');
                    const d = JSON.parse(raw);
                    if (!d.answers)
                        continue;
                    await work.prepare(project, d.answers, { allowModel: true });
                }
                catch (e) {
                    if (e.code !== 'ENOENT')
                        console.error('Background project ' + project + ': ' + e.message);
                }
            }
        }
        finally {
            polling = false;
        }
    };
    if (autoProjects.length) {
        timer = setInterval(() => poll().catch(e => console.error(e.message)), Math.max(1000, pollMs));
        timer.unref?.();
        poll().catch(e => console.error(e.message));
        ;
    }
    const server = http.createServer(async (req, res) => {
        const reply = (code, json) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(json)); };
        try {
            const token = String(req.headers.authorization || '').match(/^Bearer (.{20,})$/)?.[1];
            const person = token ? users[hash(token)] : null;
            if (!person?.id)
                return reply(401, { error: 'Authorized user token required.' });
            identifier(person.id);
            const url = new URL(req.url, 'http://localhost');
            if (req.method === 'GET' && url.pathname === '/v1/me')
                return reply(200, { id: person.id });
            const m = url.pathname.match(/^\/v1\/projects\/([^/]+)\/(ownership|automation)(?:\/([^/]+))?$/);
            if (!m)
                return reply(404, { error: 'Not found.' });
            const [, project, area, document] = m;
            identifier(project);
            if (person.projects && !person.projects.includes(project))
                return reply(403, { error: 'Project access denied.' });
            if (req.method === 'GET' && area === 'ownership' && !document)
                return reply(200, { documents: await registry.list(project) });
            if (req.method === 'GET' && area === 'automation' && !document) {
                const d = await work.inspect(project, {});
                return reply(200, d);
            }
            if (req.method !== 'POST')
                return reply(405, { error: 'Method not allowed.' });
            let body = '';
            for await (const part of req) {
                body += part;
                if (body.length > 250000)
                    throw new Error('Request too large.');
            }
            const data = JSON.parse(body || '{}');
            if (area === 'ownership' && document) {
                return reply(200, { document: await registry.act({ project, document: decodeURIComponent(document), actor: person.id, action: data.action, expectedRevision: data.expectedRevision, target: data.target }) });
            }
            if (area === 'automation' && !document) {
                if (!person.canStartAI)
                    return reply(403, { error: 'AI workflow permission required.' });
                if (!model)
                    return reply(409, { error: 'No approved background model configured.' });
                if (!data.answers || typeof data.answers !== 'object')
                    throw new Error('Discovery answers required.');
                const output = await work.prepare(project, data.answers, { allowModel: true });
                return reply(200, { tasks: output });
            }
            return reply(404, { error: 'Not found.' });
        }
        catch (e) {
            return reply(/conflict|already|pending|revision/i.test(e.message) ? 409 : 400, { error: e.message });
        }
    });
    if (timer) {
        const oldClose = server.close.bind(server);
        server.close = (...args) => { clearInterval(timer); return oldClose(...args); };
    }
    return server;
}
if (require.main === module) {
    const root = process.env.ATGV_SERVICE_DATA;
    const userFile = process.env.ATGV_SERVICE_USERS_FILE;
    if (!root || !userFile)
        throw new Error('Set ATGV_SERVICE_DATA and ATGV_SERVICE_USERS_FILE (hashed API tokens, user IDs, project permissions).');
    (async () => {
        const users = JSON.parse(await fs.readFile(userFile, 'utf8'));
        let model = null;
        const endpoint = process.env.ATGV_MODEL_ENDPOINT;
        if (endpoint) {
            if (!/^https:\/\//.test(endpoint) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(endpoint))
                throw new Error('Model endpoint must be HTTPS or loopback.');
            model = async ({ task, answers }) => {
                let modelName = String(process.env.ATGV_MODEL_NAME || 'auto').trim();
                if (modelName === 'auto') {
                    const { modelsEndpoint, selectLatest } = require('../src/ai-models');
                    const catalog = await fetch(modelsEndpoint(endpoint), { headers: { ...(process.env.ATGV_MODEL_API_KEY ? { Authorization: `Bearer ${process.env.ATGV_MODEL_API_KEY}` } : {}) }, signal: AbortSignal.timeout(10000) });
                    if (!catalog.ok)
                        throw Error('Unable to discover models from the approved backend (HTTP ' + catalog.status + ').');
                    const available = (await catalog.json()).data;
                    const chosen = selectLatest((Array.isArray(available) ? available : []).filter(item => !/(embedding|rerank|whisper|moderation)/i.test(item.id || '')));
                    if (!chosen)
                        throw Error('No generation models were listed by the approved backend.');
                    modelName = chosen.id;
                }
                const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.ATGV_MODEL_API_KEY ? { Authorization: `Bearer ${process.env.ATGV_MODEL_API_KEY}` } : {}) }, body: JSON.stringify({ model: modelName, messages: [{ role: 'system', content: 'Generate a clearly labeled draft only. Cite what is given; list assumptions and missing information. Never invent approvals. Reply as Markdown.' }, { role: 'user', content: JSON.stringify({ task, answers }) }], temperature: 0.1 }), signal: AbortSignal.timeout(90000) });
                if (!response.ok)
                    throw new Error('Approved model provider returned ' + response.status);
                return (await response.json()).choices?.[0]?.message?.content || '';
            };
        }
        const autoProjects = String(process.env.ATGV_AUTO_PROJECTS || '').split(',').map(x => x.trim()).filter(Boolean);
        const server = createServer({ root, users, model, sharedProjectsRoot: process.env.ATGV_SHARED_PROJECTS_ROOT || undefined, autoProjects });
        server.listen(Number(process.env.ATGV_SERVICE_PORT || 8787), '127.0.0.1', () => console.log('ATGV coordination service listening on 127.0.0.1'));
    })().catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { createServer, hash };
