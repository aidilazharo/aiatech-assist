'use strict';
const KINDS = ['design', 'ux', 'mockup', 'architecture', 'api', 'database'];
function plan(register, designRegister, { brIds } = {}) {
    const revisions = new Map((register?.brs || []).filter(b => b.status === 'approved' && !b.needsRefresh && Number.isSafeInteger(Number(b.approvedRevision)) && Number(b.approvedRevision) > 0).map(b => [String(b.id), Number(b.approvedRevision)]));
    const filter = brIds == null ? null : new Set(brIds.map(String));
    const candidates = [];
    const skipped = [];
    for (const kind of KINDS) {
        const latest = designRegister?.designs?.[kind]?.at(-1);
        if (!latest) {
            skipped.push({ kind, reason: 'No existing design; initial generation is a separate action' });
            continue;
        }
        const refs = Array.isArray(latest.sourceBusinessRequirements) ? latest.sourceBusinessRequirements : [];
        if (!refs.length) {
            skipped.push({ kind, reason: 'Missing provenance; manual review required' });
            continue;
        }
        const unknown = refs.filter(ref => !ref || typeof ref !== 'object' || !String(ref.id || '').trim() ||
            !revisions.has(String(ref.id)) || !Number.isSafeInteger(Number(ref.revision)) || Number(ref.revision) < 1);
        if (unknown.length) {
            skipped.push({ kind, reason: 'Unverified approved requirement provenance; manual review required',
                brIds: [...new Set(unknown.map(ref => String(ref?.id || 'unknown')))] });
            continue;
        }
        const mismatched = refs.filter(ref => {
            const id = String(ref.id);
            return (!filter || filter.has(id)) && revisions.get(id) !== Number(ref.revision);
        }).map(ref => String(ref.id));
        if (!mismatched.length) {
            skipped.push({ kind, reason: 'Source requirements unchanged' });
            continue;
        }
        if (latest.status === 'draft' && latest.manuallyEdited) {
            skipped.push({ kind, reason: 'Manually edited draft; review before regenerating', brIds: mismatched });
            continue;
        }
        candidates.push({ kind, brIds: mismatched, previousRevision: latest.number, requiresReview: true });
    }
    return { candidates, skipped, requiresApproval: true };
}
function assertSelection(assessment, kinds) {
    if (!Array.isArray(kinds) || !kinds.length || kinds.length > 6 || new Set(kinds).size !== kinds.length)
        throw Error('Select 1–6 unique impacted designs.');
    const allowed = new Set(assessment.candidates.map(x => x.kind));
    if (kinds.some(kind => !allowed.has(kind)))
        throw Error('Design selection changed. Refresh the impact plan.');
    return kinds;
}
module.exports = { KINDS, plan, assertSelection };
