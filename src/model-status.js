'use strict';
const { selectLatest, selectedModel } = require('./ai-models');
const { checkCodex } = require('./ai-provider-runtime');
const path = require('node:path');
function inactive(label = 'LLM') { return { name: label, state: 'inactive', message: 'Not active' }; }
function ready(name) { return { name: String(name || 'AI model').slice(0, 85), state: 'ready', message: 'Online / ready' }; }
function offline(name, message = 'Offline or unreachable') { return { name: String(name || 'LLM').slice(0, 85), state: 'error', message }; }
function permission(name) { return { name: String(name || 'LLM').slice(0, 85), state: 'inactive', message: 'Permission or access required' }; }
function checkEndpointUrl(raw, provider) {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol))
        throw Error('Unsupported model endpoint protocol.');
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        throw Error('Model health check requires HTTPS for non-local endpoints.');
    return url;
}
async function modelAvailability({ config, models, token, fetchImpl = global.fetch, runtimeRoot } = {}) {
    const provider = config?.provider || 'none', configuredName = String(config?.model || '').trim();
    if (provider === 'none')
        return inactive('Retrieval only');
    if (provider === 'codex') {
        const found = await checkCodex(runtimeRoot);
        return found.installed ? { name: 'Codex', state: 'inactive', message: 'Runtime found · run Test Connection to verify sign-in' } : permission('Codex runtime not installed');
    }
    if (provider === 'copilot-sdk') {
        const sdk = require('./copilot-repair-sdk');
        if (!sdk.compatibleNode()) return permission('Copilot SDK needs a newer VS Code runtime');
        const found = runtimeRoot && await sdk.installed(path.dirname(runtimeRoot));
        return found ? { name: 'Copilot SDK', state: 'inactive', message: 'Runtime found · run Test Connection to verify sign-in' } : permission('Copilot SDK not installed');
    }
    if (['openai', 'anthropic', 'azure-openai'].includes(provider))
        return token ? { name: config.model || provider, state: 'inactive', message: 'Credentials saved · run Test Connection' } : permission(config.model || provider);
    if (provider === 'auto') {
        if (!models)
            return inactive('LLM');
        try {
            const found = await models();
            const selected = config.selectedModel ? selectedModel(found, config.selectedModel) : selectLatest(found, { preferredVendor: config.preferredVendor || '' });
            if (selected)
                return ready(selected.name || selected.id || 'AI model');
            return permission(config.selectedModel ? 'Selected model unavailable' : 'No accessible AI model');
        }
        catch {
            return permission('AI model');
        }
    }
    const name = configuredName || (provider === 'ollama' ? 'Ollama' : 'Configured LLM');
    if (!configuredName && provider !== 'ollama' && provider !== 'openai-compatible')
        return inactive(name);
    if (provider === 'openai-compatible' && !token)
        return permission(name);
    try {
        const url = checkEndpointUrl(config.endpoint, provider);
        let target;
        if (provider === 'ollama')
            target = new URL('/api/tags', url);
        else {
            const prefix = url.pathname.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
            target = new URL(url.origin + prefix.replace(/\/models$/, '') + '/models');
        }
        const headers = provider === 'openai-compatible' ? { 'Authorization': 'Bearer ' + token } : {};
        const response = await fetchImpl(target.toString(), { method: 'GET', headers, signal: AbortSignal.timeout(3500) });
        if (response.status === 401 || response.status === 403)
            return permission(name);
        if (response.status === 404 || response.status === 405)
            return { name, state: 'inactive', message: 'Model health not supported' };
        if (!response.ok)
            return offline(name, 'HTTP ' + response.status);
        if (provider === 'ollama') {
            const data = await response.json();
            if (!Array.isArray(data.models))
                return offline(name, 'No model catalog');
            if (!configuredName || configuredName === 'auto') {
                const picked = selectLatest(data.models.map(m => ({ ...m, id: m.model || m.name, name: m.name || m.model })));
                return picked ? ready(picked.name) : offline('Ollama', 'No installed models');
            }
            if (!data.models.some(m => m.name === name || m.model === name || m.name?.startsWith(name + ':')))
                return offline(name, 'Model not installed');
        }
        else if (!configuredName || configuredName === 'auto') {
            const data = await response.json();
            const picked = selectLatest(data.data);
            return picked ? ready(picked.name || picked.id) : offline('Configured LLM', 'No models listed');
        }
        return ready(name);
    }
    catch (error) {
        return offline(name, error?.name === 'TimeoutError' ? 'Connection timed out' : 'Offline or unreachable');
    }
}
module.exports = { modelAvailability, inactive, ready, offline, permission, checkEndpointUrl };
