'use strict';
const { words } = require('./evidence-link');
const crypto = require('node:crypto');
const negations = /\b(no|not|never|prohibited|forbidden|disallowed|cannot|mustn't|without|disabled|reject|denied)\b/i;
const positive = /\b(required|mandatory|must|enabled|allow|allowed|accept|permitted|shall)\b/i;
const common = new Set(['that', 'this', 'with', 'from', 'into', 'about', 'there', 'their', 'should', 'would', 'could', 'which', 'when', 'than', 'will', 'must', 'shall', 'only', 'user', 'users', 'system', 'requirement']);
function detectCrossSourceConflicts(brs) {
    const warnings = [];
    for (const br of brs || []) {
        const snippets = (br.evidence || []).filter(x => x.verified && x.digest && x.passage);
        for (let i = 0; i < snippets.length; i++)
            for (let j = i + 1; j < snippets.length; j++) {
                const a = snippets[i], b = snippets[j];
                if (a.digest === b.digest)
                    continue;
                const left = negations.test(a.passage), right = negations.test(b.passage);
                const posLeft = positive.test(a.passage), posRight = positive.test(b.passage);
                if (left === right || !(posLeft || posRight))
                    continue;
                const aWords = [...words(a.passage)].filter(x => !common.has(x));
                const bWords = words(b.passage);
                const shared = aWords.filter(x => bWords.has(x));
                if (shared.length < 3 || shared.length / Math.max(aWords.length, 1) < .23)
                    continue;
                const id = crypto.createHash('sha256').update([br.id, a.digest, b.digest, a.passage, b.passage].join('\0')).digest('hex');
                warnings.push({ id, brId: br.id, sourceA: a.digest, sourceB: b.digest, excerptA: a.passage.slice(0, 500), excerptB: b.passage.slice(0, 500), sharedTerms: shared.slice(0, 12), status: 'review-required' });
            }
    }
    return warnings.slice(0, 100);
}
module.exports = { detectCrossSourceConflicts };
