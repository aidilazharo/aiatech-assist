'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { withLock } = require('./file-lock');
const { checksum } = require('./document-editor');
const MAX_ANSWER_LENGTH = 5000;
const QUESTIONS = Object.freeze([
    ['problem', 'Business problem and expected outcome'],
    ['stakeholders', 'Users, stakeholders and decision makers'],
    ['currentProcess', 'Current process'],
    ['targetProcess', 'Target process'],
    ['scope', 'In scope and out of scope'],
    ['businessRules', 'Business rules and policies'],
    ['acceptance', 'Acceptance criteria'],
    ['data', 'Data classification and sensitivity'],
    ['dependencies', 'Systems, teams, vendors and dependencies'],
    ['constraints', 'Constraints and non-functional requirements'],
    ['measures', 'Measurable success criteria'],
    ['questions', 'Open decisions and unresolved questions (NONE if none)']
]);
function folder(registry, id) { return path.join(path.dirname(registry.fileFor(id)), 'documents', 'requirements'); }
async function safeLocation(registry, id) {
    const root = path.dirname(registry.fileFor(id)), dir = folder(registry, id);
    for (const target of [root, path.join(root, 'documents'), dir]) {
        const st = await fs.lstat(target).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (st?.isSymbolicLink())
            throw new Error('Refusing to follow discovery folder symlink.');
        if (st && !st.isDirectory())
            throw new Error('Discovery path must be a directory.');
    }
    const file = path.join(dir, 'discovery-12.json'), markdown = path.join(dir, 'discovery-12.md');
    for (const candidate of [file, markdown]) {
        const st = await fs.lstat(candidate).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (st?.isSymbolicLink())
            throw new Error('Refusing to follow discovery file symlink.');
        if (st && !st.isFile())
            throw new Error('Discovery path must be a file.');
    }
    return file;
}
function normalize(answers = {}, options = {}) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers))
        throw new Error('Invalid answers.');
    const result = {};
    for (const [key] of QUESTIONS) {
        const v = answers[key] ?? '';
        if (typeof v !== 'string' || v.length > (options.allowLegacy ? 8000 : MAX_ANSWER_LENGTH))
            throw new Error('Invalid answer: ' + key + ' (5,000 characters maximum for new edits)');
        result[key] = v.trim();
    }
    return result;
}
function assess(answers) {
    const filled = QUESTIONS.filter(([k]) => answers[k]?.trim()).length;
    const unresolved = String(answers.questions || '').trim();
    const canReview = filled === QUESTIONS.length && /^none[.!]?$/i.test(unresolved);
    return { filled, total: QUESTIONS.length, canReview, missing: QUESTIONS.filter(([k]) => !answers[k]?.trim()).map(([key, label]) => ({ key, label })), needsDecision: !!unresolved && !/^none[.!]?$/i.test(unresolved) };
}
async function load(registry, id) {
    const file = await safeLocation(registry, id);
    const text = await fs.readFile(file, 'utf8').catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    const parsed = text ? JSON.parse(text) : {};
    const answers = normalize(parsed.answers || {}, { allowLegacy: true });
    return { answers, revision: checksum(text || ''), readiness: assess(answers), updatedAt: parsed.updatedAt || null };
}
function asMarkdown(answers, updatedAt) {
    const lines = ['# Business Requirement', '', `Updated: ${updatedAt || 'Not saved'}`, '', '## 12 discovery questions', ''];
    QUESTIONS.forEach(([key, label], index) => { lines.push(`### ${index + 1}. ${label}`, '', answers[key] || '', ''); });
    return lines.join('\n').trimEnd() + '\n';
}
async function save(registry, id, answers, baseRevision) {
    const file = await safeLocation(registry, id);
    await fs.mkdir(path.dirname(file), { recursive: true });
    return withLock(file, async () => {
        const existing = await load(registry, id);
        if (typeof baseRevision !== 'string' || baseRevision !== existing.revision)
            throw new Error('Discovery changed on disk. Reload before saving.');
        const clean = normalize(answers), updatedAt = new Date().toISOString();
        const next = JSON.stringify({ schemaVersion: 1, answers: clean, updatedAt }, null, 2) + '\n';
        const tmp = file + '.atgv-' + crypto.randomBytes(8).toString('hex') + '.tmp', md = path.join(path.dirname(file), 'discovery-12.md'), mdTmp = md + '.atgv-' + crypto.randomBytes(8).toString('hex') + '.tmp';
        try {
            await fs.writeFile(tmp, next, { flag: 'wx', mode: 0o600 });
            await fs.writeFile(mdTmp, asMarkdown(clean, updatedAt), { flag: 'wx', mode: 0o600 });
            if ((await load(registry, id)).revision !== baseRevision)
                throw new Error('Discovery changed during save. Reload and retry.');
            await fs.rename(tmp, file);
            await fs.rename(mdTmp, md);
        }
        finally {
            await fs.rm(tmp, { force: true });
            await fs.rm(mdTmp, { force: true });
        }
        return load(registry, id);
    });
}
module.exports = { QUESTIONS, MAX_ANSWER_LENGTH, assess, load, save, asMarkdown };
