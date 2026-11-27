'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const extensions = new Set(['.md', '.mdx', '.txt', '.rst']);
const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.venv', '.next']);
async function collectProjectKnowledge(projectRoot, { limit = 100, maxBytes = 262144, includeDiagnostics = false } = {}) {
    const root = path.resolve(projectRoot);
    const docs = [];
    let canonical = null;
    try {
        canonical = JSON.parse(await fs.readFile(path.join(root, 'sdlc', 'unified-documents.json'), 'utf8'));
        if (canonical.schema !== 1 || !canonical.documents)
            throw Error('Invalid canonical index');
    }
    catch (e) {
        if (e.code !== 'ENOENT')
            throw e;
    }
    // Refresh from canonical state, not from stale recovery copies.
    const projectArtifacts=require('./project-artifacts');
    if(canonical)await projectArtifacts.indexCanonical(root,canonical).catch(()=>{});
    const approvedPaths = new Map();
    if (canonical)
        for (const doc of Object.values(canonical.documents)) {
            if (doc.kind === 'role' && doc.status === 'approved' && doc.approval?.digest === doc.digest && doc.path)
                approvedPaths.set(doc.path, doc);
        }
    const seenLogical = new Set();
    const visited = new Set();
    for (const section of ['documents', 'knowledge']) {
        const folder = path.join(root, section);
        try {
            const stat = await fs.lstat(folder);
            if (!stat.isDirectory() || stat.isSymbolicLink())
                continue;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                continue;
            throw error;
        }
        const stack = [folder];
        while (stack.length && docs.length < limit) {
            const dir = stack.pop();
            const real = await fs.realpath(dir);
            if (visited.has(real))
                continue;
            visited.add(real);
            const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
            for (const entry of entries) {
                if (entry.name.startsWith('.') || ignored.has(entry.name) || entry.isSymbolicLink())
                    continue;
                const file = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    stack.push(file);
                    continue;
                }
                if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase()))
                    continue;
                if ((await fs.stat(file)).size > maxBytes)
                    continue;
                const text = await fs.readFile(file, 'utf8');
                const relative = path.relative(root, file).replaceAll(path.sep, '/');
                const record = canonical && section === 'documents' ? approvedPaths.get(relative) : null;
                if (canonical && section === 'documents' && !record)
                    continue;
                if (record && crypto.createHash('sha256').update(text).digest('hex') !== record.digest)
                    continue;
                const id = record?.id || 'workspace:' + relative;
                if (seenLogical.has(id))
                    continue;
                seenLogical.add(id);
                docs.push({ id, provider: 'Workspace', title: record?.title || relative, url: 'file://' + file, text, revision: record?.contentRevision || null, approval: record?.approval?.at || null, sourceRefs: record?.sourceRefs || [], canonicalId: record?.id || null });
                if (docs.length >= limit)
                    break;
            }
        }
    }
    if (canonical) {
        for (const doc of Object.values(canonical.documents)) {
            if (docs.length >= limit)
                break;
            if (doc.kind === 'br' && doc.status === 'approved' && /^BR-[0-9]+$/.test(doc.id.split(':').at(-1))) {
                const br = doc.id.split(':').at(-1), relative = `approved-brs/${br}-revision-${doc.contentRevision}.md`;
                const file = path.resolve(root, relative);
                const st = await fs.lstat(file).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
                if (!st?.isFile() || st.isSymbolicLink() || st.size > maxBytes)
                    continue;
                const text = await fs.readFile(file, 'utf8');
                if (seenLogical.has(doc.id))
                    continue;
                seenLogical.add(doc.id);
                docs.push({ id: doc.id, provider: 'ApprovedBR', title: doc.title, url: 'file://' + file, text, revision: doc.contentRevision, sourceRefs: doc.sourceRefs, canonicalId: doc.id });
            }
        }
        const file = path.join(root, 'documents', 'designs', 'ai-design-drafts.json');
        try {
            const st = await fs.lstat(file);
            if (st.isFile() && !st.isSymbolicLink() && st.size <= 2048000) {
                const data = JSON.parse(await fs.readFile(file, 'utf8'));
                for (const [kind, revisions] of Object.entries(data.designs || {})) {
                    const record = canonical.documents[`${path.basename(root)}:design:${kind}`];
                    if (!record || record.status !== 'approved' || docs.length >= limit || !Array.isArray(revisions))
                        continue;
                    const approved = revisions.find(x => x.number === record.contentRevision && x.status === 'approved');
                    if (!approved)
                        continue;
                    const text = String(approved.content || '');
                    if (!text || Buffer.byteLength(text) > maxBytes || seenLogical.has(record.id))
                        continue;
                    seenLogical.add(record.id);
                    docs.push({ id: record.id, provider: 'ApprovedDesign', title: record.title, url: 'file://' + file, text, revision: record.contentRevision, sourceRefs: record.sourceRefs, canonicalId: record.id });
                }
            }
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
    }
    // Explicit opt-in only: do not mix draft/diagnostic metadata into the
    // default approved-document index or displace verified documents.
    if(includeDiagnostics&&docs.length<limit){
        const context=await projectArtifacts.contextDocument(root).catch(()=>null);
        if(context&&Buffer.byteLength(context.text)<=maxBytes)docs.push({...context,diagnostic:true,approval:null});
    }
    return docs;
}
module.exports = { collectProjectKnowledge };
