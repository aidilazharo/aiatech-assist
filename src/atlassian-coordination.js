'use strict';
const { requestJson, baseAtlassian, baseConfluence, getConfluenceSpace } = require('./clients');
const { identifier, accountIdentifier, transitionOwnership } = require('./ownership');
const STATE_MARKER = 'ATGV_OWNERSHIP_V1:';
const MAX_REGISTRY_BYTES = 768 * 1024;
function pageTitle(project) { return `ATGV Ownership Registry [${identifier(project)}]`; }
function auth(config, token) { if (!token)
    throw new Error('Atlassian token required for shared coordination.'); return { token, basicEmail: String(config.get('jira.email') || '').trim() }; }
function encodeState(documents) {
    const text = JSON.stringify({ schema: 1, documents });
    if (Buffer.byteLength(text) > MAX_REGISTRY_BYTES)
        throw new Error('Coordination registry is too large. Split documents into separate projects.');
    return '<p>ATGV ownership and approvals. Managed by ATGV; do not edit manually.</p><p>' + STATE_MARKER + Buffer.from(text).toString('base64') + '</p>';
}
function decodeState(body) {
    const match = new RegExp(STATE_MARKER + '([a-zA-Z0-9+/=]+)').exec(String(body || ''));
    if (!match)
        throw new Error('The Confluence coordination page does not contain an ATGV registry. Refusing to overwrite it.');
    let data;
    try {
        data = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    }
    catch {
        throw new Error('Invalid ATGV coordination registry encoding.');
    }
    if (data.schema !== 1 || !data.documents || typeof data.documents !== 'object' || Array.isArray(data.documents))
        throw new Error('Unsupported ATGV coordination registry format.');
    return data.documents;
}
function isConflict(e) { return /HTTP (409|412)\b/.test(String(e?.message || '')); }
function actionableConfluenceError(error, space) {
    const message = String(error?.message || error || '');
    if (/HTTP (401|403)\b/.test(message))
        return new Error(`Confluence ownership access denied for space ${space.key}. Verify your Atlassian token and permission to view, create, and edit pages. ${message}`);
    if (/HTTP 404\b/.test(message))
        return new Error(`Confluence ownership registry endpoint or space ${space.key} was not found (HTTP 404). Verify the selected Confluence space in Project Settings, the Atlassian site URL, and permission to create and edit pages. The ownership request was not saved. ${message}`);
    return error;
}
class JiraConfluenceCoordination {
    constructor({ config, token, project }) { this.config = config; this.token = token; this.project = identifier(project); this.site = baseConfluence(config); this.credentials = auth(config, token); }
    async identity() {
        const user = await requestJson(`${baseAtlassian(this.config)}/rest/api/3/myself`, this.credentials);
        if (!user || typeof user.accountId !== 'string' || !user.accountId.trim())
            throw new Error('Jira did not provide a verified account ID.');
        return { id: accountIdentifier(user.accountId), name: user.displayName || user.accountId };
    }
    async locate() {
        let space;
        try {
            space = await getConfluenceSpace(this.config, this.token);
        }
        catch (error) {
            throw actionableConfluenceError(error, { key: String(this.config.get('confluence.spaceKey') || '').trim() });
        }
        const title = pageTitle(this.project);
        const pages = [];
        let url = `${this.site}/api/v2/spaces/${encodeURIComponent(space.id)}/pages?limit=100`;
        let fallback = false;
        try {
            for (let index = 0; url && index < 25; index++) {
                const page = await requestJson(url, this.credentials);
                pages.push(...(page.results || []).filter(p => p.title === title && (!p.type || p.type === 'page')));
                const next = page._links?.next;
                if (!next) {
                    url = null;
                    break;
                }
                const resolved = new URL(next, this.site);
                if (resolved.origin !== new URL(this.site).origin || !resolved.pathname.startsWith('/wiki/api/v2/spaces/'))
                    throw new Error('Untrusted Confluence ownership registry pagination URL.');
                url = resolved.toString();
                if (index === 24)
                    throw new Error('Confluence page listing is incomplete. Cannot safely create an ownership registry.');
            }
        }
        catch (error) {
            if (!/HTTP (404|405)\b/.test(String(error?.message || '')))
                throw error;
            fallback = true;
        }
        if (fallback) {
            const lookup = new URL(this.site + '/rest/api/content');
            lookup.searchParams.set('spaceKey', space.key);
            lookup.searchParams.set('title', title);
            lookup.searchParams.set('limit', '10');
            try {
                const response = await requestJson(lookup.toString(), this.credentials);
                pages.push(...(response.results || []).filter(p => p.title === title && p.type === 'page'));
            }
            catch (error) {
                throw actionableConfluenceError(error, space);
            }
        }
        if (pages.length > 1)
            throw new Error('Multiple Confluence registry pages found. Ask a space administrator to resolve duplicates.');
        return { space, page: pages[0] || null };
    }
    async snapshot() {
        const { space, page } = await this.locate();
        if (!page)
            return { space, page: null, documents: {} };
        let full;
        try {
            full = await requestJson(`${this.site}/api/v2/pages/${encodeURIComponent(page.id)}?body-format=storage`, this.credentials);
        }
        catch (error) {
            throw actionableConfluenceError(error, space);
        }
        if (full.title !== pageTitle(this.project) || String(full.spaceId) !== String(space.id))
            throw new Error('Confluence coordination page identity changed.');
        const version = Number(full.version?.number);
        if (!Number.isSafeInteger(version) || version < 1)
            throw new Error('Missing Confluence registry version.');
        return { space, page: { id: String(full.id), version }, documents: decodeState(full.body?.storage?.value) };
    }
    async list() {
        const [state, me] = await Promise.all([this.snapshot(), this.identity()]);
        return { scope: 'jira-confluence', me: me.id, meName: me.name, documents: Object.entries(state.documents).map(([documentId, record]) => ({ documentId, ...record })) };
    }
    async act({ document, action, expectedRevision }) {
        identifier(document);
        const [actor, state] = await Promise.all([this.identity(), this.snapshot()]);
        const before = state.documents[document] || { ownerId: null, pending: null, revision: 0 };
        const record = transitionOwnership(before, { actor: actor.id, actorName: actor.name, action, expectedRevision });
        const documents = { ...state.documents, [document]: record };
        const body = encodeState(documents);
        try {
            if (!state.page) {
                const created = await requestJson(this.site + '/api/v2/pages', { ...this.credentials, method: 'POST', data: { spaceId: String(state.space.id), status: 'current', title: pageTitle(this.project), body: { representation: 'storage', value: body } } });
                if (!created?.id)
                    throw new Error('Confluence registry creation response did not include a page ID. Refresh ownership before retrying.');
            }
            else {
                await requestJson(`${this.site}/api/v2/pages/${encodeURIComponent(state.page.id)}`, { ...this.credentials, method: 'PUT', data: { id: state.page.id, status: 'current', title: pageTitle(this.project), body: { representation: 'storage', value: body }, version: { number: state.page.version + 1, message: `ATGV ownership ${action}` } } });
            }
        }
        catch (err) {
            if (isConflict(err))
                throw new Error('Shared ownership changed on Confluence. Refresh ownership before retrying (version conflict).');
            throw actionableConfluenceError(err, state.space);
        }
        return { document: record, scope: 'jira-confluence', me: actor.id };
    }
}
module.exports = { JiraConfluenceCoordination, pageTitle, encodeState, decodeState };
