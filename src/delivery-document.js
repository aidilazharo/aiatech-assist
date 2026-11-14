'use strict';
const { loadDocument, saveDocumentMarkdown, checksum } = require('./document-editor');
const { open } = require('./delivery-work');
function boundary(id, kind) { if (!/^[0-9a-f]{40}$/.test(id))
    throw Error('Invalid delivery item identity.'); return `### ATGV Work ${kind} ${id}`; }
function region(text, id) { const begin = boundary(id, 'Start'), end = boundary(id, 'End'); const first = text.indexOf(begin + '\n'); const finish = text.indexOf(end + '\n'); if (first < 0 && finish < 0)
    return null; if (first < 0 || finish < 0 || finish <= first || text.indexOf(begin + '\n', first + begin.length) >= 0 || text.indexOf(end + '\n', finish + end.length) >= 0)
    throw Error('Managed delivery section markers are invalid or duplicated. Review the document manually.'); const stop = finish + end.length + 1; return { begin: first, stop, content: text.slice(first + begin.length + 1, finish).replace(/\n+$/, '') }; }
async function applyApproved(root, registry, projectId, id, actor, revision) {
    const memory = open(root);
    try {
        const item = memory.db.prepare('SELECT * FROM delivery_items WHERE id=?').get(id);
        if (!item || !actor || item.owner !== actor)
            throw Error('Assign to Me before applying an approved deliverable.');
        if (item.project_id !== projectId || !item.path)
            throw Error('This deliverable is not a project document.');
        if (!['approved', 'completed'].includes(item.status) || item.draft_revision !== revision)
            throw Error('Only the current approved revision may be applied.');
        const review = JSON.parse(item.review);
        if (review.action !== 'approve' || review.revision !== revision)
            throw Error('Independent approval is required before document application.');
        if (!item.content.trim())
            throw Error('Empty approved document cannot be applied.');
        if (item.content.includes(boundary(id, 'Start')) || item.content.includes(boundary(id, 'End')))
            throw Error('Draft contains reserved delivery markers.');
        memory.db.exec('CREATE TABLE IF NOT EXISTS delivery_document_links (item_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, section_digest TEXT NOT NULL, document_digest TEXT NOT NULL, updated TEXT NOT NULL)');
        const previous = memory.db.prepare('SELECT * FROM delivery_document_links WHERE item_id=?').get(id);
        const document = await loadDocument(registry, projectId, item.role_id, item.task_id);
        const old = region(document.markdown, id);
        if (previous && !old)
            throw Error('Previously applied section was removed. Restore or reconcile manually.');
        if (old && (!previous || checksum(old.content) !== previous.section_digest))
            throw Error('This approved section was edited manually. Review before overwriting it.');
        const content = item.content.trim();
        const digest = checksum(content);
        if (old && old.content === content && previous?.revision === revision)
            return { unchanged: true, path: document.path, revision: document.revision };
        const managed = boundary(id, 'Start') + '\n' + content + '\n' + boundary(id, 'End') + '\n';
        const next = old ? document.markdown.slice(0, old.begin) + managed + document.markdown.slice(old.stop) : document.markdown.replace(/\s*$/, '\n\n') + managed;
        const saved = await saveDocumentMarkdown(registry, projectId, item.role_id, item.task_id, next, document.revision);
        memory.db.prepare('INSERT INTO delivery_document_links VALUES(?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET revision=excluded.revision,section_digest=excluded.section_digest,document_digest=excluded.document_digest,updated=excluded.updated').run(id, revision, digest, saved.revision, new Date().toISOString());
        memory.document(item.role_id + '/' + item.task_id, item.role_id, item.task_id, saved.revision, { path: document.path, title: item.title, brRefs: [item.br_id] });
        memory.recordDecision('delivery-document-applied', { itemId: id, brId: item.br_id, brRevision: item.br_revision, roleId: item.role_id, taskId: item.task_id, revision, actor, documentDigest: saved.revision });
        memory.queueOperation('confluence-doc', { documentId: item.role_id + '/' + item.task_id, digest: saved.revision });
        return { unchanged: false, path: document.path, revision: saved.revision };
    }
    finally {
        memory.close();
    }
}
module.exports = { applyApproved, region, boundary };
