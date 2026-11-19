'use strict';
const { textFromAdf, htmlToText, validateUrl } = require('./utils');
const { githubIpAllowlistHint } = require('./github-ip-allowlist');
// Produce actionable, non-secret HTTP diagnostics. Jira often returns an
// empty body, JSON null, or {errorMessages:[],errors:{}} for 404 responses.
// Never echo request query strings (which can contain JQL and other private data).
function responseErrorDetail(body) {
    const raw = String(body || '').slice(0, 2000).trim();
    if (!raw || raw === 'null') return '';
    try {
        const data = JSON.parse(raw);
        if (typeof data === 'string') return data === 'null' ? '' : data.slice(0, 260);
        if (!data || typeof data !== 'object') return '';
        const messages = [
            ...(Array.isArray(data.errorMessages) ? data.errorMessages : []),
            ...(data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors) ? Object.values(data.errors) : []),
            data.message, data.error_description
        ].filter(x => typeof x === 'string' && x.trim() && x.trim().toLowerCase() !== 'null');
        return [...new Set(messages)].join('; ').slice(0, 260);
    } catch {
        return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260);
    }
}
function jira404Hint(url) {
    if (!url.hostname.endsWith('.atlassian.net')) return '';
    const route = url.pathname;
    if (/^\/wiki\/api\//.test(route))
        return 'Confluence API endpoint not found or not accessible. Check the Confluence URL, product access, API-token scopes and permissions.';
    if (/^\/rest\/api\/3\/issue\/[^/]+/.test(route))
        return 'Jira issue not found or not visible. Check its issue key, Browse Projects permission and issue-security rules. A 404 does not prove deletion.';
    if (/^\/rest\/api\/3\/project\/[^/]+/.test(route))
        return 'Jira project not found or not accessible. Verify the Project Key and Browse Projects permission.';
    if (route === '/rest/api/3/myself')
        return 'Jira account endpoint not found. Verify that Jira Base URL is the correct Atlassian Cloud site (no /jira or /wiki suffix) and that the API token matches the account email.';
    return 'Verify the configured Jira Base URL and the REST endpoint. For project-specific requests also check Browse Projects and API-token access.';
}
async function requestJson(url, options = {}) {
    const { token, basicEmail, method = 'GET', data, headers = {}, signal, timeoutMs = 25000 } = options;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000)
        throw Error('Invalid request timeout.');
    const auth = token ? (basicEmail ? 'Basic ' + Buffer.from(`${basicEmail}:${token}`).toString('base64') : 'Bearer ' + token) : undefined;
    const response = await fetch(url, { method, headers: {
            'Accept': 'application/json', 'Content-Type': 'application/json',
            ...(auth ? { 'Authorization': auth } : {}), ...headers
        }, body: data === undefined ? undefined : JSON.stringify(data), redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
        let body = '';
        try { body = (await response.text()).slice(0, 2000); } catch { /* Body may be absent. */ }
        const destination = new URL(url);
        const detail = responseErrorDetail(body);
        const hint = destination.hostname === 'api.github.com'
            ? githubIpAllowlistHint(response.status, detail)
            : response.status === 404 ? jira404Hint(destination) : '';
        // Do not include URL query parameters, Authorization headers or token values.
        const context = `${String(method).toUpperCase()} ${destination.pathname}`;
        const explanation = detail || (response.status === 404 ? 'No error details returned by the server.' : 'No response error details.');
        throw new Error(`HTTP ${response.status} from ${destination.host} ${context}: ${explanation}${hint ? ' ' + hint : ''}`);
    }
    return response.status === 204 ? {} : response.json();
}
function baseAtlassian(config) { return validateUrl(config.get('jira.baseUrl').trim()).replace(/\/wiki\/?$/, ''); }
function baseConfluence(config) {
    const jira = baseAtlassian(config), raw = config.get('confluence.baseUrl') || `${jira}/wiki`;
    const conf = validateUrl(raw).replace(/\/$/, '');
    if (new URL(conf).origin !== new URL(jira).origin &&
        (!new URL(conf).hostname.endsWith('.atlassian.net') || !new URL(jira).hostname.endsWith('.atlassian.net')))
        throw new Error('Separate Jira and Confluence sites must use trusted Atlassian Cloud domains.');
    return conf.endsWith('/wiki') ? conf : conf + '/wiki';
}
function atlassianAuth(config, token) { return { token, basicEmail: config.get('jira.email').trim() }; }
async function getConfluenceSpace(config, token) {
    const key = config.get('confluence.spaceKey').trim();
    if (!key)
        throw new Error('Set atgvAssist.confluence.spaceKey.');
    const confluence = baseConfluence(config);
    const id = config.get('confluence.spaceId').trim();
    if (id) {
        if (!/^\d+$/.test(id))
            throw new Error('Invalid Confluence space ID.');
        const space = await requestJson(`${confluence}/api/v2/spaces/${id}`, atlassianAuth(config, token));
        if (space.key !== key)
            throw new Error('Confluence space ID and key do not match. Check project settings.');
        return space;
    }
    const url = `${confluence}/api/v2/spaces?keys=${encodeURIComponent(key)}&limit=5`;
    const res = await requestJson(url, atlassianAuth(config, token));
    const sp = (res.results || []).find(x => x.key === key);
    if (!sp)
        throw new Error(`Confluence space "${key}" not found or not accessible.`);
    return sp;
}
async function listConfluence(config, token, limit) {
    const confluence = baseConfluence(config), site = new URL(confluence).origin, sp = await getConfluenceSpace(config, token);
    let next = `${confluence}/api/v2/spaces/${encodeURIComponent(sp.id)}/pages?limit=${Math.min(100, limit)}`, docs = [];
    const auth = atlassianAuth(config, token);
    while (next && docs.length < limit) {
        const page = await requestJson(next, auth);
        for (const item of page.results || []) {
            if (docs.length >= limit)
                break;
            const p = await getConfluencePage(config, token, item.id);
            if (p.status && p.status !== 'current')
                continue;
            const webPath = p._links?.webui;
            const url = webPath ? new URL(/^https?:\/\//.test(webPath) || webPath.startsWith('/wiki/') ? webPath : '/wiki/' + webPath.replace(/^\/+/, ''), site).toString() : `${site}/wiki/spaces/${encodeURIComponent(sp.key)}/pages/${p.id}`;
            docs.push({ id: `confluence:${site}:${p.id}`, provider: 'Confluence', remoteId: String(p.id), spaceId: String(sp.id), title: p.title || item.title,
                url, version: Number(p.version?.number || 1), rawHtml: p.body?.storage?.value || '', text: htmlToText(p.body?.storage?.value || ''), updated: p.version?.createdAt || '' });
        }
        const link = page._links?.next;
        if (!link) {
            next = null;
            continue;
        }
        const u = new URL(link, site);
        if (u.origin !== new URL(site).origin || !u.pathname.startsWith('/wiki/api/v2/'))
            throw new Error('Untrusted Confluence pagination URL.');
        next = u.toString();
    }
    return docs;
}
async function getConfluencePage(config, token, pageId) {
    if (!/^\d+$/.test(String(pageId)))
        throw new Error('Invalid Confluence page ID.');
    return requestJson(`${baseConfluence(config)}/api/v2/pages/${pageId}?body-format=storage`, atlassianAuth(config, token));
}
async function writeConfluence(config, token, { pageId, spaceId, title, bodyHtml, version }) {
    if (pageId && !/^\d+$/.test(String(pageId)))
        throw Error('Invalid Confluence page ID.');
    if (!pageId && !/^\d+$/.test(String(spaceId)))
        throw Error('Invalid Confluence space ID.');
    if (!String(title || '').trim() || String(title).length > 255)
        throw Error('Confluence title must contain 1–255 characters.');
    if (pageId && (!Number.isSafeInteger(version) || version < 1))
        throw Error('Missing trusted Confluence page version; refresh before updating.');
    const parentId = String(config.get('confluence.parentPageId') || '').trim();
    if (!pageId && parentId && !/^\d+$/.test(parentId))
        throw Error('Invalid Confluence parent page ID. Use a numeric page ID or leave it blank for the space root.');
    const site = baseConfluence(config);
    const data = pageId ? { id: String(pageId), status: 'current', title, body: { representation: 'storage', value: bodyHtml }, version: { number: version + 1, message: 'ATGV AIATECH Assist manual update' } } :
        { spaceId: String(spaceId), status: 'current', title, body: { representation: 'storage', value: bodyHtml }, ...(parentId ? { parentId } : {}) };
    try {
        return await requestJson(`${site}/api/v2/pages${pageId ? '/' + encodeURIComponent(pageId) : ''}`, {
            ...atlassianAuth(config, token), method: pageId ? 'PUT' : 'POST', data
        });
    }
    catch (error) {
        if (/HTTP (409|412)\b/.test(String(error.message)))
            throw new Error('Confluence version conflict: the remote page changed. Refresh, compare and retry; no automatic overwrite.', { cause: error });
        if (/HTTP 403\b/.test(String(error.message)))
            throw new Error('Confluence cannot write to this space or parent. On Confluence Free, use an ordinary page with create/edit access; do not request private restrictions.', { cause: error });
        throw error;
    }
}
async function listJira(config, token, limit) {
    const jql = config.get('jira.jql').trim();
    if (!jql)
        throw new Error('Set atgvAssist.jira.jql to a scoped Jira query.');
    const site = baseAtlassian(config);
    let nextPageToken, docs = [];
    do {
        const args = { jql, maxResults: Math.min(100, limit - docs.length), fields: ['summary', 'description', 'status', 'issuetype', 'updated'] };
        if (nextPageToken)
            args.nextPageToken = nextPageToken;
        const res = await requestJson(`${site}/rest/api/3/search/jql`, { ...atlassianAuth(config, token), method: 'POST', data: args });
        for (const issue of res.issues || []) {
            const f = issue.fields || {};
            docs.push({ id: `jira:${site}:${issue.key}`, provider: 'Jira', title: `${issue.key} — ${f.summary || ''}`,
                url: `${site}/browse/${encodeURIComponent(issue.key)}`, text: `${issue.key} ${f.summary || ''}\nStatus: ${f.status?.name || ''}\nType: ${f.issuetype?.name || ''}\n${textFromAdf(f.description)}`,
                updated: f.updated || '' });
        }
        if (res.isLast === true || !res.nextPageToken || !(res.issues || []).length)
            break;
        nextPageToken = res.nextPageToken;
    } while (docs.length < limit);
    return docs.slice(0, limit);
}
function githubRepoInfo(config) {
    const owner = config.get('github.owner').trim(), repo = config.get('github.repo').trim();
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo))
        throw new Error('Configure GitHub owner and repository.');
    const api = validateUrl(config.get('github.apiUrl').trim());
    return { owner, repo, api, route: `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` };
}
async function githubGet(config, token, route) { return requestJson(route, { token, headers: { 'X-GitHub-Api-Version': '2022-11-28', 'Accept': 'application/vnd.github+json' } }); }
async function listGithubRepositories(config, token, { owner = '', limit = 100 } = {}) {
    const api = validateUrl(config.get('github.apiUrl').trim());
    const account = String(owner || '').trim();
    if (account && !/^[A-Za-z0-9-]{1,39}$/.test(account))
        throw new Error('Enter a valid GitHub account or organization name.');
    if (!token && !account)
        throw new Error('Enter a GitHub account name, or provide a token to list repositories.');
    const size = Math.max(1, Math.min(100, Number.isSafeInteger(limit) ? limit : 100));
    const endpoint = token ? `${api}/user/repos?per_page=${size}&page=1&sort=updated&affiliation=owner%2Ccollaborator%2Corganization_member` :
        `${api}/users/${encodeURIComponent(account)}/repos?per_page=${size}&page=1&type=owner&sort=updated`;
    const response = await githubGet(config, token, endpoint);
    if (!Array.isArray(response))
        throw new Error('GitHub returned an invalid repository list.');
    const seen = new Set(), repositories = [];
    for (const repo of response) {
        const fullName = String(repo?.full_name || '');
        const parts = fullName.split('/');
        if (parts.length !== 2 || !parts.every(x => /^[\w.-]+$/.test(x)))
            continue;
        if (account && parts[0].toLowerCase() !== account.toLowerCase())
            continue;
        if (seen.has(fullName.toLowerCase()))
            continue;
        seen.add(fullName.toLowerCase());
        repositories.push({ fullName, owner: parts[0], name: parts[1], private: !!repo.private, defaultBranch: String(repo.default_branch || 'main').slice(0, 180), archived: !!repo.archived });
    }
    return { repositories, truncated: response.length >= size, authenticated: !!token };
}
async function listGithubBranches(config, token, {limit=200}={}) {
    const {route}=githubRepoInfo(config);
    const maximum=Math.max(1,Math.min(300,Number.isSafeInteger(limit)?limit:200));
    const repo=await githubGet(config,token,route);
    const defaultBranch=String(repo?.default_branch||'');
    const branches=[];const seen=new Set();let truncated=false;
    for(let page=1;page<=3&&branches.length<maximum;page++){
        const response=await githubGet(config,token,`${route}/branches?per_page=100&page=${page}`);
        if(!Array.isArray(response))throw Error('GitHub returned an invalid branches list.');
        for(const item of response){
            const name=String(item?.name||'');
            if(!name||name.length>180||!/^[A-Za-z0-9_][A-Za-z0-9_.\/-]*$/.test(name)||name.includes('..')||name.includes('//')||name.endsWith('/')||name.endsWith('.lock')||seen.has(name))continue;
            seen.add(name);branches.push({name,default:name===defaultBranch,protected:!!item.protected});
            if(branches.length>=maximum){truncated=true;break;}
        }
        if(response.length<100)break;
        if(page===3)truncated=true;
    }
    return {branches,defaultBranch,truncated};
}
async function listGithub(config, token, limit, maxFileBytes) {
    const { owner, repo, route, api } = githubRepoInfo(config);
    let branch = config.get('github.branch').trim();
    if (!branch) {
        const meta = await githubGet(config, token, route);
        branch = meta.default_branch;
    }
    const prefix = config.get('github.pathPrefix').trim().replace(/^\/+/, '').replace(/\/$/, '');
    const tree = await githubGet(config, token, `${route}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const items = (tree.tree || []).filter(f => f.type === 'blob' && /\.(md|mdx|txt|rst)$/i.test(f.path) && (!prefix || f.path.startsWith(prefix + '/') || f.path === prefix)).slice(0, limit);
    const docs = [];
    for (const file of items) {
        if (file.size > maxFileBytes)
            continue;
        const obj = await githubGet(config, token, `${route}/git/blobs/${encodeURIComponent(file.sha)}`);
        if (obj.encoding !== 'base64')
            continue;
        const text = Buffer.from((obj.content || '').replace(/\s/g, ''), 'base64').toString('utf8');
        if (Buffer.byteLength(text) > maxFileBytes)
            continue;
        docs.push({ id: `github:${api}:${owner}/${repo}:${file.path}`, provider: 'GitHub', title: file.path,
            url: `https://${new URL(api).hostname === 'api.github.com' ? 'github.com' : new URL(api).hostname}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${branch.split('/').map(encodeURIComponent).join('/')}/${file.path.split('/').map(encodeURIComponent).join('/')}`,
            text, updated: '' });
    }
    return { docs, truncated: !!tree.truncated };
}
async function testJiraConnection(config, token) {
    if (!token)
        throw new Error('Enter jiraToken or reuse a saved token for this Atlassian account.');
    const site = baseAtlassian(config);
    const user = await requestJson(`${site}/rest/api/3/myself`, atlassianAuth(config, token));
    if (!user || (!user.accountId && !user.displayName && !user.emailAddress))
        throw new Error('Jira returned an unexpected account response.');
    return { displayName: user.displayName || user.emailAddress || user.accountId, accountId: user.accountId || '' };
}
async function testGithubConnection(config, token) {
    const { owner, repo, route } = githubRepoInfo(config);
    const data = await githubGet(config, token, route);
    if (!data || typeof data.full_name !== 'string' || data.full_name.toLowerCase() !== `${owner}/${repo}`.toLowerCase())
        throw new Error('GitHub returned a repository that does not match the requested owner/repository.');
    return { fullName: data.full_name, private: !!data.private, defaultBranch: data.default_branch || '' };
}
async function discoverJiraProjects(config, token, query = '') {
    const site = baseAtlassian(config), found = [];
    for (let startAt = 0, i = 0; i < 10 && found.length < 1000; i++) {
        const url = new URL(site + '/rest/api/3/project/search');
        url.searchParams.set('maxResults', '100');
        url.searchParams.set('startAt', String(startAt));
        if (query.trim())
            url.searchParams.set('query', query.trim().slice(0, 120));
        const page = await requestJson(url.toString(), atlassianAuth(config, token));
        const values = page.values || [];
        found.push(...values.map(p => ({ key: String(p.key || ''), name: String(p.name || ''), id: String(p.id || '') })).filter(p => p.key && p.name));
        if (page.isLast === true || !values.length || values.length < 100)
            break;
        const next = Number(page.startAt ?? startAt) + values.length;
        if (!Number.isFinite(next) || next <= startAt)
            break;
        startAt = next;
    }
    return found.slice(0, 1000);
}
const MAX_SPACE_RESULTS = 10;
const MAX_SPACE_PAGES = 500;
function normalizeSpaceQuery(query) { return String(query || '').normalize('NFKC').trim().replace(/\s+/g, ' '); }
function spaceScore(sp, query) {
    const q = normalizeSpaceQuery(query).toLocaleLowerCase();
    const name = normalizeSpaceQuery(sp.name).toLocaleLowerCase();
    const key = normalizeSpaceQuery(sp.key).toLocaleLowerCase();
    if (key === q)
        return 1000;
    if (name === q)
        return 950;
    if (key.startsWith(q))
        return 850;
    if (name.startsWith(q))
        return 800;
    if (name.includes(q))
        return 650;
    if (key.includes(q))
        return 600;
    const terms = q.split(' ').filter(Boolean);
    if (terms.length && terms.every(t => name.includes(t)))
        return 450;
    if (terms.length && terms.every(t => key.includes(t)))
        return 400;
    return 0;
}
function isPersonalSpace(raw) {
    const sp = raw?.space || raw?.content?.space || raw;
    return String(sp?.type || '').toLowerCase() === 'personal' || String(sp?.key || '').startsWith('~');
}
function normalizeSearchSpace(raw, site) {
    const sp = raw?.space || raw?.content?.space || raw;
    const id = sp?.id, key = sp?.key;
    const name = sp?.name || sp?.title || key;
    if (id == null || !key || isPersonalSpace(raw))
        return null;
    return { id: String(id), key: String(key), name: String(name), baseUrl: site };
}
function sortSpaceResults(results, query, limit = MAX_SPACE_RESULTS) {
    const found = new Map();
    for (const sp of results) {
        if (!sp || !spaceScore(sp, query))
            continue;
        const id = sp.baseUrl + ':' + sp.id;
        if (!found.has(id))
            found.set(id, sp);
    }
    return [...found.values()].sort((a, b) => spaceScore(b, query) - spaceScore(a, query) || a.name.localeCompare(b.name))
        .slice(0, Math.min(MAX_SPACE_RESULTS, Math.max(1, Number(limit) || MAX_SPACE_RESULTS)));
}
function emitSpaceDiagnostic(options, phase, metrics) {
    if (typeof options?.onDiagnostic !== 'function')
        return;
    try {
        options.onDiagnostic({ phase, pages: metrics.pages, scanned: metrics.scanned, personalExcluded: metrics.personalExcluded, matches: metrics.matches, ...(metrics.httpStatus ? { httpStatus: metrics.httpStatus } : {}) });
    }
    catch { }
}
async function discoverConfluenceSpaces(config, token, query, limit = MAX_SPACE_RESULTS, options = {}) {
    const term = normalizeSpaceQuery(query);
    if (term.length < 2 || term.length > 120)
        throw new Error('Enter at least 2 characters to search Confluence spaces.');
    const site = baseConfluence(config), auth = atlassianAuth(config, token);
    const results = [], metrics = { pages: 0, scanned: 0, personalExcluded: 0, matches: 0 };
    function record(raw) {
        metrics.scanned++;
        if (isPersonalSpace(raw)) {
            metrics.personalExcluded++;
            return;
        }
        const space = normalizeSearchSpace(raw, site);
        if (space && spaceScore(space, term)) {
            results.push(space);
            metrics.matches++;
        }
    }
    if (/^[\w-]{2,120}$/.test(term)) {
        const directUrl = new URL(site + '/api/v2/spaces');
        directUrl.searchParams.set('keys', term.toUpperCase());
        directUrl.searchParams.set('limit', '10');
        emitSpaceDiagnostic(options, 'key-start', metrics);
        try {
            const direct = await requestJson(directUrl.toString(), auth);
            for (const raw of direct.results || [])
                record(raw);
            if (results.some(s => s.key.toLowerCase() === term.toLowerCase())) {
                const found = sortSpaceResults(results, term, limit);
                emitSpaceDiagnostic(options, 'key-match', metrics);
                return found;
            }
        }
        catch (err) {
            const match = /HTTP (\d{3})\b/.exec(String(err?.message || ''));
            if (!match || !['400', '404', '422'].includes(match[1]))
                throw err;
            metrics.httpStatus = Number(match[1]);
            emitSpaceDiagnostic(options, 'key-fallback', metrics);
            delete metrics.httpStatus;
        }
    }
    let next = site + '/api/v2/spaces?limit=100';
    const seen = new Set();
    let finished = false;
    for (let i = 0; i < MAX_SPACE_PAGES && next; i++) {
        if (seen.has(next))
            throw new Error('Repeated Confluence pagination cursor.');
        seen.add(next);
        let page;
        try {
            page = await requestJson(next, auth);
        }
        catch (err) {
            emitSpaceDiagnostic(options, 'page-error', metrics);
            throw err;
        }
        metrics.pages++;
        for (const raw of page.results || [])
            record(raw);
        if (!page._links?.next) {
            finished = true;
            break;
        }
        const url = new URL(page._links.next, site);
        if (url.origin !== new URL(site).origin || url.pathname !== '/wiki/api/v2/spaces')
            throw new Error('Untrusted Confluence pagination URL.');
        next = url.toString();
    }
    if (!finished) {
        emitSpaceDiagnostic(options, 'page-limit', metrics);
        throw new Error('Confluence space directory scan did not finish. Search by an exact space key or contact an administrator.');
    }
    const found = sortSpaceResults(results, term, limit);
    emitSpaceDiagnostic(options, 'completed', metrics);
    return found;
}
module.exports = { testJiraConnection, testGithubConnection, discoverJiraProjects, discoverConfluenceSpaces, requestJson, baseAtlassian, baseConfluence, getConfluenceSpace, listConfluence, getConfluencePage, writeConfluence, listJira, githubRepoInfo, listGithub, listGithubRepositories, listGithubBranches };
