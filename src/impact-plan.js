'use strict';
const DESIGN_KINDS = new Set(['design', 'ux', 'mockup', 'architecture', 'api', 'database']);
function rootOf(path) { return String(path || '').split('/')[0]; }
function unique(items) { return [...new Set(items.filter(Boolean))].sort(); }
function buildImpactPlan(register = {}, designs = {}, paths = []) {
    const roots = unique((paths || []).map(rootOf));
    if (roots.length > 100)
        throw Error('Too many affected requirement roots.');
    const selected = new Set(roots);
    const requirements = (register.brs || []).filter(br => selected.has(String(br.id))).map(br => ({ id: String(br.id), status: br.status, revision: Number(br.approvedRevision || 0), requiresReview: !!br.needsRefresh }));
    const jira = Object.entries(register.synced || {}).filter(([path]) => selected.has(rootOf(path))).map(([path, record]) => ({ path, key: String(record?.key || ''), kind: String(record?.kind || ''), workHistory: record?.key ? (register.jiraWorkHistory || {})[record.key] || null : null }));
    const affectedDesigns = [];
    for (const [kind, history] of Object.entries(designs.designs || {})) {
        if (!DESIGN_KINDS.has(kind) || !Array.isArray(history) || !history.length)
            continue;
        const latest = history[history.length - 1];
        const refs = latest?.sourceBusinessRequirements || [];
        if (!refs.some(ref => selected.has(String(ref.id))))
            continue;
        const edited = !!latest.manuallyEdited;
        affectedDesigns.push({ kind, id: String(latest.id || ''), status: String(latest.status || 'draft'), manuallyEdited: edited, linkedRequirements: unique(refs.map(ref => String(ref.id))), action: edited ? 'human-reconcile' : 'propose-new-draft' });
    }
    const missing = roots.filter(id => !requirements.some(br => br.id === id));
    const hasBackendImpact = affectedDesigns.some(d => d.kind === 'api' || d.kind === 'database' || d.kind === 'architecture');
    return {
        affectedRoots: roots, requirements, jira, designs: affectedDesigns,
        missingRequirements: missing,
        proposedDownstreamReviews: [
            ...(hasBackendImpact ? ['Review API consumers and server implementations', 'Review database migration and backward compatibility'] : []),
            'Review automated test coverage and acceptance criteria', 'Review release and deployment compatibility'
        ],
        requiresHumanReview: true,
        automatedWritesAllowed: false
    };
}
module.exports = { buildImpactPlan };
