'use strict';
const path = require('node:path');
const { validateUrl } = require('./utils');
const { requestJson } = require('./clients');
const { executeCodex } = require('./ai-provider-runtime');
function modelLabel(model) { return String(model?.name || model?.id || model?.model || 'AI model'); }
function modelVendor(model) { return String(model?.vendor || model?.provider || 'VS Code'); }
function modelIdentity(model) { return JSON.stringify({ vendor: modelVendor(model), id: String(model?.id || model?.model || model?.name || '') }); }
function selectedModel(models, choice) { return (Array.isArray(models) ? models : []).find(model => modelIdentity(model) === choice) || null; }
function rankModel(model) {
    const raw = [model?.version, model?.id, model?.name, model?.family].filter(Boolean).join(' ').toLowerCase();
    const dates = [...raw.matchAll(/(?:^|[^0-9])(20\d{2})[-_.]?([01]\d)[-_.]?([0-3]\d)(?!\d)/g)]
        .map(m => +m[1] * 10000 + +m[2] * 100 + +m[3]).filter(x => x % 100 >= 1 && Math.floor(x / 100) % 100 <= 12);
    const date = dates.length ? Math.max(...dates) : 0;
    const generationText = String(model?.family || model?.id || model?.name || '').toLowerCase();
    const generational = generationText.match(/(?:gpt|claude|gemini|llama|qwen|deepseek|mistral|phi|grok|o)[-_\s]*([0-9]+)(?:[.\-]([0-9]+))?/);
    const generation = generational ? (+generational[1] * 100 + (+generational[2] || 0)) : 0;
    const modelVersion = String(model?.version || '').match(/^(\d+)(?:[.\-](\d+))?(?:[.\-](\d+))?/);
    const version = modelVersion && +modelVersion[1] < 100 ? (+modelVersion[1] * 10000 + (+modelVersion[2] || 0) * 100 + (+modelVersion[3] || 0)) : 0;
    const experimental = /\b(preview|experimental|deprecated|legacy)\b/i.test(raw) ? -1 : 0;
    const economy = /\b(mini|nano|lite|flash|small|tiny|haiku)\b/i.test(raw) ? -1 : 0;
    return [economy, experimental, date, version, generation, Number(model?.maxInputTokens) || 0];
}
function compareModels(a, b) {
    const ar = rankModel(a), br = rankModel(b);
    for (let i = 0; i < ar.length; i++)
        if (ar[i] !== br[i])
            return br[i] - ar[i];
    return (modelVendor(a) + ':' + modelLabel(a)).localeCompare(modelVendor(b) + ':' + modelLabel(b));
}
function selectLatest(models, { preferredVendor = '' } = {}) {
    const supported = (Array.isArray(models) ? models : []).filter(m => m && (m.id || m.name || m.model));
    const subset = preferredVendor ? supported.filter(m => modelVendor(m).toLowerCase() === String(preferredVendor).trim().toLowerCase()) : supported;
    return [...subset].sort(compareModels)[0] || null;
}
function modelsEndpoint(endpoint) {
    const url = new URL(validateUrl(endpoint, { local: true }));
    const path = url.pathname.replace(/\/(chat\/completions|responses|models)\/?$/, '').replace(/\/$/, '');
    url.pathname = path + '/models';
    url.search = '';
    url.hash = '';
    return url.toString();
}
async function resolveAiTarget({ vscodeApi, config = {}, secret = '', request = requestJson, runtimeRoot = '', projectDirectory = '' } = {}) {
    const provider = String(config.provider || 'auto');
    if (provider === 'none')
        throw Error('AI generation is disabled (retrieval-only mode). Change the model provider to Auto in ATGV settings.');
    if (provider === 'auto') {
        if (!vscodeApi?.lm?.selectChatModels)
            throw Error('This version of VS Code does not support the Language Model API. Update VS Code or configure an approved model endpoint.');
        const all = await vscodeApi.lm.selectChatModels();
        const selected = String(config.selectedModel || '').trim();
        const chosen = selected ? selectedModel(all, selected) : selectLatest(all, { preferredVendor: config.preferredVendor || '' });
        if (!chosen && selected)
            throw Error('The manually selected AI model is not currently accessible. Click the model name in the header to select another model or switch to Auto.');
        if (!chosen)
            throw Error(config.preferredVendor ? `No accessible models for provider "${config.preferredVendor}". Clear the preferred vendor or enable an approved model in VS Code.` : 'No accessible AI models. Open Chat: Manage Language Models, connect an approved provider, or configure Ollama / an OpenAI-compatible endpoint.');
        return { kind: 'vscode', name: modelLabel(chosen), vendor: modelVendor(chosen), model: chosen, label: `${modelLabel(chosen)} (${modelVendor(chosen)})` };
    }
    if (provider === 'codex')
        return { kind: 'codex', name: 'Codex agent', vendor: 'OpenAI', runtimeRoot, projectDirectory, transport: config.codexTransport || 'https', modelId: String(config.model || '').trim(), label: 'OpenAI Codex (local agent)' };
    if (provider === 'copilot-sdk')
        return { kind: 'copilot-sdk', name: 'Copilot SDK', vendor: 'GitHub', runtimeRoot, projectDirectory, modelId: String(config.model || '').trim(), label: 'Microsoft Copilot SDK' };
    if (['openai', 'anthropic', 'azure-openai'].includes(provider)) {
        if (!secret)
            throw Error(`${provider} credentials are missing. Open Settings → AI Providers and save your API key.`);
        const modelId = String(config.model || '').trim();
        if (!modelId || modelId === 'auto')
            throw Error(`Enter the approved ${provider} model or deployment in AI Providers settings.`);
        const defaults = { openai: 'https://api.openai.com/v1/responses', anthropic: 'https://api.anthropic.com/v1/messages' };
        const endpoint = provider === 'azure-openai' ? String(config.endpoint || '').trim() : defaults[provider];
        if (!endpoint)
            throw Error('Enter the Azure OpenAI endpoint in AI Providers settings.');
        const url = new URL(endpoint);
        if (url.protocol !== 'https:')
            throw Error('Cloud AI endpoints require HTTPS.');
        if (url.username || url.password || url.hash)
            throw Error('Invalid AI endpoint.');
        if (provider === 'openai' && url.hostname !== 'api.openai.com')
            throw Error('OpenAI API endpoint must be api.openai.com. Use OpenAI-compatible for custom hosts.');
        if (provider === 'anthropic' && url.hostname !== 'api.anthropic.com')
            throw Error('Claude API endpoint must be api.anthropic.com.');
        return { kind: provider, name: modelId, vendor: provider, modelId, endpoint: url.toString(), secret, label: `${modelId} (${provider})` };
    }
    if (!['ollama', 'openai-compatible'].includes(provider))
        throw Error('Unsupported AI provider: ' + provider);
    const endpoint = String(config.endpoint || '').trim();
    if (!endpoint)
        throw Error('Configure an approved AI model endpoint in ATGV settings.');
    validateUrl(endpoint, { local: true });
    if (provider === 'openai-compatible' && !secret)
        throw Error('Set the approved model API key in Knowledge & RAG Settings.');
    let id = String(config.model || '').trim();
    if (!id || id === 'auto') {
        const url = provider === 'ollama' ? validateUrl(endpoint, { local: true }).replace(/\/$/, '') + '/api/tags' : modelsEndpoint(endpoint);
        const found = await request(url, provider === 'openai-compatible' ? { token: secret } : {});
        const available = provider === 'ollama' ? found.models : found.data;
        const candidates = (Array.isArray(available) ? available : []).map(m => ({ id: String(m?.id || m?.name || m?.model || ''), name: String(m?.name || m?.id || m?.model || ''), version: m?.version || '' }))
            .filter(m => m.id && !/(embedding|rerank|whisper|moderation|text-to-speech|\btts\b|dall-e)/i.test(m.id));
        const chosen = selectLatest(candidates);
        if (!chosen)
            throw Error('No usable generation models were returned by the configured ' + provider + ' endpoint.');
        id = chosen.id;
    }
    return { kind: provider, name: id, vendor: provider, modelId: id, endpoint, secret, label: `${id} (${provider})` };
}
async function sendAiText({ vscodeApi, target, prompt, system = '', maxChars = 60000, json = false, request = requestJson, signal } = {}) {
    if (!target)
        throw Error('An AI model must be selected first.');
    if (signal?.aborted)
        throw Object.assign(new Error('AI request stopped.'), { name: 'AbortError' });
    let text = '';
    if (target.kind === 'vscode') {
        const cancellation = new vscodeApi.CancellationTokenSource();
        const cancel = () => cancellation.cancel();
        signal?.addEventListener('abort', cancel, { once: true });
        try {
            if (signal?.aborted)
                cancel();
            const content = system ? `${system}\n\nUSER REQUEST:\n${prompt}` : prompt;
            const result = await target.model.sendRequest([vscodeApi.LanguageModelChatMessage.User(content)], {}, cancellation.token);
            for await (const part of result.text) {
                text += part;
                if (text.length > maxChars)
                    throw Error('AI response exceeds the allowed size.');
            }
        }
        finally {
            signal?.removeEventListener('abort', cancel);
            cancellation.dispose();
        }
    }
    else {
        const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
        if (target.kind === 'copilot-sdk') {
            const copilot = require('./copilot-repair-sdk');
            text = await copilot.analyze(path.dirname(target.runtimeRoot), {cwd: target.projectDirectory || target.runtimeRoot, prompt: system ? `${system}\n\nUSER REQUEST:\n${prompt}` : prompt, signal, model: target.modelId});
            if (text.length > maxChars) throw Error('AI response exceeds the allowed size.');
        }
        else if (target.kind === 'codex') {
            text = await executeCodex({ runtimeRoot: target.runtimeRoot, cwd: target.projectDirectory, prompt, system, signal, maxChars, transport: target.transport, model: target.modelId });
        }
        else if (target.kind === 'openai') {
            const result = await request(target.endpoint, { method: 'POST', token: target.secret, data: { model: target.modelId, input: messages }, signal });
            text = String(result.output_text || '') || ((result.output || []).flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text || '').join(''));
        }
        else if (target.kind === 'anthropic') {
            const result = await request(target.endpoint, { method: 'POST', headers: { 'x-api-key': target.secret, 'anthropic-version': '2023-06-01' }, data: { model: target.modelId, max_tokens: 4096, messages: [{ role: 'user', content: [system, prompt].filter(Boolean).join('\n\n') }] }, signal });
            text = (result.content || []).filter(x => x.type === 'text').map(x => x.text || '').join('');
        }
        else if (target.kind === 'azure-openai') {
            const url = new URL(target.endpoint);
            if (!url.searchParams.has('api-version'))
                url.searchParams.set('api-version', '2024-10-21');
            const result = await request(url.toString(), { method: 'POST', headers: { 'api-key': target.secret }, data: { messages, temperature: 0.1 }, signal });
            text = String(result.choices?.[0]?.message?.content || '');
        }
        else if (target.kind === 'ollama') {
            const endpoint = validateUrl(target.endpoint, { local: true }).replace(/\/$/, '') + '/api/chat';
            const result = await request(endpoint, { method: 'POST', data: { model: target.modelId, stream: false, ...(json ? { format: 'json' } : {}), messages }, signal });
            text = String(result.message?.content || '');
        }
        else if (target.kind === 'openai-compatible') {
            const endpoint = validateUrl(target.endpoint, { local: true });
            const result = await request(endpoint, { method: 'POST', token: target.secret, data: { model: target.modelId, messages, temperature: 0.1 }, signal });
            const content = result.choices?.[0]?.message?.content;
            text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(x => x.type === 'text').map(x => x.text || '').join('') : '';
        }
        else
            throw Error('Unsupported AI target.');
        if (text.length > maxChars)
            throw Error('AI response exceeds the allowed size.');
    }
    if (signal?.aborted)
        throw Object.assign(new Error('AI request stopped.'), { name: 'AbortError' });
    if (!text.trim())
        throw Error(`AI provider ${target.label || target.kind} returned an empty text response. Check authentication, model access, response format, and provider diagnostics in Settings → AI Providers.`);
    return text;
}
module.exports = { selectLatest, selectedModel, modelIdentity, rankModel, modelsEndpoint, resolveAiTarget, sendAiText, modelLabel, modelVendor };
