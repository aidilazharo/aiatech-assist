'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { withLock } = require('./file-lock');
const { roleById } = require('./sdlc-work');
const checksum = text => crypto.createHash('sha256').update(text).digest('hex');
async function taskFor(registry, projectId, roleId, taskId) { const roles = await require('./sdlc-catalog').loadProjectRoles(registry, projectId); const task = roles.find(r => r.id === roleId)?.tasks.find(t => t.id === taskId); if (!roles.some(r => r.id === roleId))
    throw new Error('Unknown SDLC role.'); if (!task?.document)
    throw new Error('Not a role document.'); return task; }
async function documentLocation(registry, projectId, roleId, taskId) {
    const task = await taskFor(registry, projectId, roleId, taskId), root = path.dirname(registry.fileFor(projectId));
    const candidate = path.resolve(root, 'documents', task.document);
    if (!candidate.startsWith(root + path.sep))
        throw new Error('Document escapes project boundary.');
    let check = root;
    for (const component of path.relative(root, candidate).split(path.sep)) {
        check = path.join(check, component);
        const stat = await fs.lstat(check).catch(e => { if (e.code === 'ENOENT')
            return null; throw e; });
        if (stat?.isSymbolicLink())
            throw new Error('Refusing to follow document symlinks.');
    }
    return candidate;
}
function cleanInline(text) { return text.replace(/([\\`*_\[\]~])/g, '\\$1'); }
function parseDelta(delta) {
    if (!delta || !Array.isArray(delta.ops) || delta.ops.length > 30000)
        throw new Error('Invalid editor document.');
    let length = 0;
    let chunks = [];
    let line = '';
    for (const op of delta.ops) {
        if (typeof op.insert !== 'string' || op.insert.length > 250000)
            throw new Error('Only text content is supported in project documents.');
        length += op.insert.length;
        if (length > 512000)
            throw new Error('Document exceeds 512 KB.');
        const attrs = op.attributes || {};
        for (const ch of op.insert.split(/(\n)/)) {
            if (!ch)
                continue;
            if (ch === '\n') {
                const h = attrs.header, bullet = attrs.list, quote = attrs.blockquote, code = attrs['code-block'];
                let content = line;
                if (h && [1, 2, 3].includes(h))
                    content = '#'.repeat(h) + ' ' + content;
                else if (bullet === 'bullet')
                    content = '- ' + content;
                else if (bullet === 'ordered')
                    content = '1. ' + content;
                else if (quote)
                    content = '> ' + content;
                else if (code)
                    content = '    ' + content;
                chunks.push(content);
                line = '';
            }
            else {
                let value = cleanInline(ch);
                if (attrs.bold)
                    value = '**' + value + '**';
                if (attrs.italic)
                    value = '*' + value + '*';
                if (attrs.strike)
                    value = '~~' + value + '~~';
                if (attrs.code)
                    value = '`' + value + '`';
                if (typeof attrs.link === 'string' && /^https:\/\//i.test(attrs.link))
                    value = '[' + value + '](' + attrs.link.replace(/[()\s]/g, '') + ')';
                line += value;
            }
        }
    }
    if (line)
        chunks.push(line);
    return chunks.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
}
async function loadDocument(registry, projectId, roleId, taskId) {
    const task = await taskFor(registry, projectId, roleId, taskId);
    const file = await documentLocation(registry, projectId, roleId, taskId);
    const st = await fs.stat(file);
    if (!st.isFile() || st.size > 512000)
        throw new Error('Document is not a regular Markdown file under 512 KB.');
    const text = await fs.readFile(file, 'utf8');
    return { roleId, taskId, title: task.label, path: 'documents/' + task.document, markdown: text, revision: checksum(text) };
}
async function atomicSaveMarkdown(registry, projectId, roleId, taskId, next, baseRevision) {
    if (typeof next !== 'string' || Buffer.byteLength(next, 'utf8') > 512000 || next.includes('\0'))
        throw new Error('Invalid Markdown or document exceeds 512 KB.');
    if (typeof baseRevision !== 'string' || !/^[0-9a-f]{64}$/.test(baseRevision))
        throw new Error('Missing document revision. Reload the document.');
    const file = await documentLocation(registry, projectId, roleId, taskId);
    return withLock(file, async () => {
        const current = await fs.readFile(file, 'utf8');
        if (checksum(current) !== baseRevision)
            throw new Error('This document changed on disk. Reopen it to review the newer version before saving.');
        const temp = file + '.atgv-' + crypto.randomBytes(8).toString('hex') + '.tmp';
        try {
            await fs.writeFile(temp, next, { flag: 'wx', mode: 0o600 });
            if (checksum(await fs.readFile(file, 'utf8')) !== baseRevision)
                throw new Error('Document changed while saving. Reopen and retry.');
            await fs.rename(temp, file);
        }
        finally {
            await fs.rm(temp, { force: true });
        }
        return { revision: checksum(next), markdown: next };
    });
}
async function saveDocument(registry, projectId, roleId, taskId, delta, revision) {
    return atomicSaveMarkdown(registry, projectId, roleId, taskId, parseDelta(delta), revision);
}
async function saveDocumentMarkdown(registry, projectId, roleId, taskId, markdown, revision) {
    return atomicSaveMarkdown(registry, projectId, roleId, taskId, markdown, revision);
}
module.exports = { taskFor, documentLocation, loadDocument, saveDocument, saveDocumentMarkdown, parseDelta, checksum };
