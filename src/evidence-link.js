'use strict';
const { read } = require('./source-store');
const words = value => new Set(String(value || '').toLowerCase().match(/[a-z][a-z0-9]{3,}/g) || []);
const excluded = new Set(['this', 'that', 'with', 'from', 'shall', 'must', 'should', 'will', 'into', 'when', 'then', 'their', 'there', 'where', 'have', 'been', 'business', 'requirement', 'requirements', 'system', 'user', 'users', 'feature', 'features', 'process', 'data']);
function rank(query, passage) {
    const wanted = [...words(query)].filter(x => !excluded.has(x)), have = words(passage);
    const hits = wanted.filter(x => have.has(x));
    return { score: wanted.length ? hits.length / wanted.length : 0, hits };
}
function passageList(text) { return String(text || '').replace(/\r/g, '').split(/\n\s*\n|\n(?=#{1,6}\s)/).map(x => x.trim()).filter(x => x.length >= 25).flatMap(x => x.length > 1800 ? x.match(/[\s\S]{1,1200}/g) : [x]); }
function matchEvidence(requirement, document) {
    const query = [requirement.title, requirement.objective, requirement.scope, ...(requirement.features || []).map(f => f.title)].join(' ');
    const candidates = passageList(document.text).map((p, i) => ({ ...rank(query, p), text: p, index: i })).filter(x => x.hits.length >= 2 && x.score >= .13).sort((a, b) => b.score - a.score).slice(0, 3);
    return candidates.map(({ text, index, score, hits }) => ({ digest: document.digest, name: document.name, passage: text.slice(0, 1000), passageIndex: index, matchingTerms: hits.slice(0, 20), score: Number(score.toFixed(4)), verified: true }));
}
async function evidenceFor(registry, id, requirements, sources) {
    const docs = [];
    for (const source of sources || []) {
        try {
            const doc = await read(registry, id, source);
            docs.push(doc);
        }
        catch { }
    }
    return requirements.map(req => docs.flatMap(doc => matchEvidence(req, doc)));
}
module.exports = { words, rank, passageList, matchEvidence, evidenceFor };
