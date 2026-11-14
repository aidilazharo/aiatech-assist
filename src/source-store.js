'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { importDocumentText } = require('./discovery-import');
const DIGEST = /^[a-f0-9]{64}$/;
function sourceDirectory(registry, id) { return path.join(path.dirname(registry.fileFor(id)), 'documents', 'requirements', 'sources'); }
async function checkedDirectory(registry, id) {
    const root = path.dirname(registry.fileFor(id));
    const parts = [root, path.join(root, 'documents'), path.join(root, 'documents', 'requirements'), sourceDirectory(registry, id)];
    for (const loc of parts) {
        const st = await fs.lstat(loc).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (st && (!st.isDirectory() || st.isSymbolicLink()))
            throw Error('Invalid source document storage directory.');
        if (!st)
            await fs.mkdir(loc, { recursive: false });
    }
    return parts.at(-1);
}
async function store(registry, id, document, originalPath) {
    if (!DIGEST.test(document.digest))
        throw Error('Invalid source document digest.');
    const extension = path.extname(document.name).toLowerCase();
    if (!['.pdf', '.docx'].includes(extension))
        throw Error('Unsupported source document format.');
    const folder = await checkedDirectory(registry, id), storedName = document.digest + extension;
    const target = path.join(folder, storedName), st = await fs.lstat(target).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    const bytes = await fs.readFile(originalPath);
    const byteDigest = crypto.createHash('sha256').update(bytes).digest('hex');
    document.byteDigest = byteDigest;
    if (st && (!st.isFile() || st.isSymbolicLink()))
        throw Error('Unsafe stored source document.');
    if (st) {
        const existingDigest = crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
        if (existingDigest !== byteDigest)
            throw Error('Source document bytes differ from the stored document with identical extracted text. Archive the earlier version and investigate the difference before re-uploading.');
    }
    if (!st) {
        const tmp = path.join(folder, '.' + crypto.randomBytes(12).toString('hex') + '.tmp');
        try {
            await fs.writeFile(tmp, bytes, { flag: 'wx', mode: 0o600 });
            await fs.rename(tmp, target);
        }
        finally {
            await fs.rm(tmp, { force: true });
        }
    }
    return storedName;
}
async function read(registry, id, entry) {
    const ext = path.extname(String(entry.storedName || '')).toLowerCase();
    if (!DIGEST.test(String(entry.digest || '')) || !['.pdf', '.docx'].includes(ext) || entry.storedName !== entry.digest + ext)
        throw Error('Source document was uploaded before stored-source processing was supported. Re-upload the file to process it.');
    const folder = await checkedDirectory(registry, id), file = path.join(folder, entry.storedName);
    const st = await fs.lstat(file).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    if (!st || !st.isFile() || st.isSymbolicLink())
        throw Error('Stored source document is unavailable. Re-upload it.');
    if (!DIGEST.test(String(entry.byteDigest || '')))
        throw Error('Original file byte checksum is unavailable for this legacy source. Re-upload the document to establish a verified source baseline.');
    const actualBytes = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
    if (actualBytes !== entry.byteDigest)
        throw Error('Stored source document bytes changed: original file integrity check failed.');
    const doc = await importDocumentText(file);
    const digest = crypto.createHash('sha256').update(doc.text).digest('hex');
    if (digest !== entry.digest || doc.truncated)
        throw Error('Stored source document changed or exceeds text limit.');
    return { ...doc, name: entry.name, digest, byteDigest: entry.byteDigest };
}
// Verified, exact original bytes for an explicit download. Unlike read(),
// this does not re-extract text or mutate the approved Business Requirement.
async function originalBytes(registry, id, entry) {
    const ext = path.extname(String(entry.storedName || '')).toLowerCase();
    if (!DIGEST.test(String(entry.digest || '')) || !['.pdf', '.docx'].includes(ext) || entry.storedName !== entry.digest + ext)
        throw Error('Original uploaded source document is unavailable. Re-upload it to restore downloadable evidence.');
    if (!DIGEST.test(String(entry.byteDigest || '')))
        throw Error('Original source checksum is unavailable for this legacy upload. Re-upload the document to establish a verified original.');
    const folder = await checkedDirectory(registry, id), file = path.join(folder, entry.storedName);
    const st = await fs.lstat(file).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    if (!st || !st.isFile() || st.isSymbolicLink())
        throw Error('Original source document is not stored locally. Re-upload it to download.');
    const bytes = await fs.readFile(file);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.byteDigest)
        throw Error('Original source document integrity verification failed. Download blocked.');
    return bytes;
}
async function removeStored(registry, id, entry) {
    const extension = path.extname(String(entry.storedName || '')).toLowerCase();
    if (!DIGEST.test(String(entry.digest || '')) || !['.pdf', '.docx'].includes(extension) || entry.storedName !== entry.digest + extension)
        throw Error('Invalid stored source metadata.');
    const directory = await checkedDirectory(registry, id), file = path.join(directory, entry.storedName);
    const stat = await fs.lstat(file).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (!stat)
        return { deleted: false };
    if (!stat.isFile() || stat.isSymbolicLink())
        throw Error('Unsafe stored source document.');
    await fs.unlink(file);
    return { deleted: true };
}
module.exports = { sourceDirectory, store, read, originalBytes, removeStored };
