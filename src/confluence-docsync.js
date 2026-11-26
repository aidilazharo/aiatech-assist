'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { markdownToStorage, htmlToText, sha } = require('./utils');
const { getConfluencePage, writeConfluence, getConfluenceSpace, requestJson, baseConfluence } = require('./clients');
function supportedStorage(html) {
    const t = String(html || '');
    if (/<\/?(?:ac:|ri:|table|iframe|img|script|style|svg|video|audio|div|span|a\b)/i.test(t))
        return false;
    return !/<\/?(?!p\b|h[1-6]\b|ul\b|li\b|pre\b|br\b|strong\b|em\b|code\b)[A-Za-z]/i.test(t);
}
function toMarkdown(html) {
    if (!supportedStorage(html))
        throw new Error('Confluence page contains formatting that cannot be safely edited in Markdown.');
    const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, x) => x[0] === '#' ? String.fromCodePoint(x[1]?.toLowerCase() === 'x' ? parseInt(x.slice(2), 16) : Number(x.slice(1))) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[x.toLowerCase()]));
    let t = String(html).replace(/<h([1-6])[^>]*>/gi, (_, n) => '\n' + '#'.repeat(Number(n)) + ' ')
        .replace(/<\/h[1-6]>/gi, '\n\n').replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '\n')
        .replace(/<pre[^>]*>/gi, '\n```\n').replace(/<\/pre>/gi, '\n```\n')
        .replace(/<(strong|b)>/gi, '**').replace(/<\/(strong|b)>/gi, '**')
        .replace(/<(em|i)>/gi, '*').replace(/<\/(em|i)>/gi, '*')
        .replace(/<code>/gi, '`').replace(/<\/code>/gi, '`')
        .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]*>/g, '');
    return decode(t).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function contentReady(md) { const clean = String(md).replace(/<!--[\s\S]*?-->/g, '').trim(); if (clean.length < 80)
    return false; const body = clean.split('\n').filter(s => !/^#{1,6}\s/.test(s)).join(' ').trim(); return body.length > 45 && !/^(?:TODO|TBD|PLACEHOLDER|\[enter|\[describe)/i.test(body) && !/TODO|\[Describe|\[Insert/i.test(body); }
const fileHash = s => sha(String(s).replace(/\r\n/g, '\n'));
class DocumentSync {
    constructor({ folder, config, token }) { this.folder = folder; this.config = config; this.token = token; this.mapping = path.join(folder, 'knowledge', 'confluence-links.json'); }
    async read() { try {
        const d = JSON.parse(await fs.readFile(this.mapping, 'utf8'));
        return d;
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return { schema: 1, entries: {} };
        throw e;
    } }
    async write(state) { await fs.mkdir(path.dirname(this.mapping), { recursive: true }); const tmp = this.mapping + '.' + crypto.randomUUID() + '.tmp'; try {
        await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
        await fs.rename(tmp, this.mapping);
    }
    finally {
        await fs.rm(tmp, { force: true });
    } }
    async sync({ max = 80, only = null, immutable = false, additional = [] } = {}) {
        if (!Number.isInteger(max) || max < 1 || max > 200)
            throw new Error('Invalid sync document limit.');
        const space = await getConfluenceSpace(this.config, this.token), state = await this.read();
        const dir = path.join(this.folder, 'documents');
        const result = { created: [], pushed: [], pulled: [], conflicts: [], skipped: [] };
        const docs = [];
        async function enumerate(folder) {
            for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(e => e.code === 'ENOENT' ? [] : Promise.reject(e))) {
                if (entry.isSymbolicLink())
                    continue;
                const target = path.join(folder, entry.name);
                if (entry.isDirectory())
                    await enumerate(target);
                else if (entry.isFile() && /\.md$/i.test(entry.name))
                    docs.push(target);
            }
        }
        await enumerate(dir);
        if (only !== null && (!Array.isArray(only) || only.length > 200 || only.some(x => typeof x !== 'string' || x.includes('..') || path.isAbsolute(x) || !x.endsWith('.md'))))
            throw Error('Invalid Confluence document filter.');
        if (!Array.isArray(additional) || additional.length > 100)
            throw Error('Invalid approved snapshot list.');
        const selected = (only === null ? docs : docs.filter(file => only.includes(path.relative(dir, file).split(path.sep).join('/')))).map(file => ({ file, relative: path.relative(dir, file).split(path.sep).join('/') }));
        for (const source of additional) {
            if (!source || typeof source.path !== 'string' || typeof source.key !== 'string' || !/^approved-brs\/BR-[0-9]+-revision-[1-9][0-9]*\.md$/.test(source.path) || !/^approved-brs\/BR-[0-9]+\.md$/.test(source.key))
                throw Error('Invalid approved BR snapshot path.');
            const file = path.join(this.folder, source.path), st = await fs.lstat(file).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
            if (!st?.isFile() || st.isSymbolicLink() || st.size > 512000)
                throw Error('Approved BR snapshot is missing or unsafe.');
            selected.push({ file, relative: source.key });
        }
        for (const { file, relative } of selected.slice(0, max)) {
            const text = await fs.readFile(file, 'utf8');
            const hash = fileHash(text);
            const prev = state.entries[relative];
            if (!prev) {
                if (!contentReady(text)) {
                    result.skipped.push(relative);
                    continue;
                }
                const title = `ATGV · ${relative.replace(/\.md$/i, '').replace(/[\/._-]/g, ' ')}`;
                const existing = await requestJson(`${baseConfluence(this.config)}/api/v2/pages?space-id=${encodeURIComponent(String(space.id))}&title=${encodeURIComponent(title)}&limit=10`, { token: this.token, basicEmail: String(this.config.get('jira.email') || '').trim() });
                if ((existing.results || []).some(p => p.title === title)) {
                    result.conflicts.push({ file: relative, reason: 'Existing Confluence page needs explicit link/reconciliation' });
                    continue;
                }
                const created = await writeConfluence(this.config, this.token, { spaceId: space.id, title, bodyHtml: markdownToStorage(text), version: 0 });
                if (!created?.id)
                    throw new Error('Confluence create response lacked page id; reconcile remotely before retrying.');
                state.entries[relative] = { pageId: String(created.id), spaceId: String(space.id), title, version: Number(created.version?.number || 1), localHash: hash, remoteHash: fileHash(created.body?.storage?.value || markdownToStorage(text)), lastSynced: new Date().toISOString() };
                result.created.push(relative);
                await this.write(state);
                continue;
            }
            if (prev.spaceId !== String(space.id)) {
                result.conflicts.push({ file: relative, reason: 'Space changed' });
                continue;
            }
            let remote = await getConfluencePage(this.config, this.token, prev.pageId);
            const rVersion = Number(remote.version?.number || 0), rHtml = remote.body?.storage?.value || '';
            const localChanged = hash !== prev.localHash, remoteChanged = rVersion !== prev.version;
            if (localChanged && remoteChanged) {
                result.conflicts.push({ file: relative, reason: 'Both local and Confluence versions changed' });
                continue;
            }
            if (remoteChanged) {
                if (immutable) {
                    result.conflicts.push({ file: relative, reason: 'Remote edit to approved snapshot requires human reconciliation' });
                    continue;
                }
                if (!supportedStorage(rHtml)) {
                    result.conflicts.push({ file: relative, reason: 'Remote rich formatting requires manual review' });
                    continue;
                }
                const next = toMarkdown(rHtml);
                const stat = await fs.lstat(file);
                if (!stat.isFile() || stat.isSymbolicLink())
                    throw new Error('Unsafe local document.');
                const latest = await fs.readFile(file, 'utf8');
                if (fileHash(latest) !== hash) {
                    result.conflicts.push({ file: relative, reason: 'Local file changed during pull' });
                    continue;
                }
                await fs.writeFile(file, next);
                prev.version = rVersion;
                prev.localHash = fileHash(next);
                prev.remoteHash = fileHash(rHtml);
                prev.lastSynced = new Date().toISOString();
                result.pulled.push(relative);
            }
            else if (localChanged) {
                const check = await getConfluencePage(this.config, this.token, prev.pageId);
                if (Number(check.version?.number) !== rVersion) {
                    result.conflicts.push({ file: relative, reason: 'Remote changed during push' });
                    continue;
                }
                const written = await writeConfluence(this.config, this.token, { pageId: prev.pageId, spaceId: space.id, title: prev.title, bodyHtml: markdownToStorage(text), version: rVersion });
                prev.version = Number(written.version?.number || rVersion + 1);
                prev.localHash = hash;
                prev.remoteHash = fileHash(markdownToStorage(text));
                prev.lastSynced = new Date().toISOString();
                result.pushed.push(relative);
            }
            else {
                result.skipped.push(relative);
                continue; // No mapping changed; avoid rewriting state on every unchanged page.
            }
            await this.write(state);
        }
        return result;
    }
}
module.exports = { DocumentSync, toMarkdown, supportedStorage, contentReady };
