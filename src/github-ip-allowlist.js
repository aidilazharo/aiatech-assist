'use strict';

/** Give an actionable message only for explicit GitHub organization IP blocks. */
function githubIpAllowlistHint(status, message) {
    const body = String(message || '');
    const githubPolicy = /\bIP\s*(?:allow[\s-]*list|allowlist)\b/i.test(body);
    const denied = /\b(?:not permitted|blocked|denied|not allowed|enabled)\b/i.test(body);
    if (Number(status) !== 403 || !githubPolicy || !denied) return '';
    return 'GitHub organization IP allowlist denied this network (HTTP 403). '
        + 'An organization administrator must authorize the outbound IP, or this '
        + 'job must run on an approved self-hosted runner. Changing the PAT, '
        + 'repeated retries, or changing the library code cannot bypass this policy.';
}

module.exports = { githubIpAllowlistHint };
