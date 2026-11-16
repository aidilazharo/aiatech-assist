'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { githubIpAllowlistHint } = require('../src/github-ip-allowlist');
const { requestJson } = require('../src/clients');

test('identifies the exact enterprise IP allowlist failure', () => {
    const error = 'The repository owner has an IP allow list enabled, and 52.161.60.160 is not permitted to access this repository.';
    assert.match(githubIpAllowlistHint(403, error), /self-hosted runner/i);
    assert.match(githubIpAllowlistHint(403, error), /administrator/i);
});

test('does not call unrelated 403, 404 or authentication failures an IP issue', () => {
    assert.equal(githubIpAllowlistHint(403, 'Bad credentials'), '');
    assert.equal(githubIpAllowlistHint(404, 'IP allow list enabled; blocked'), '');
    assert.equal(githubIpAllowlistHint(403, 'Access denied to unrelated resource'), '');
});

test('GitHub API error surfaces the action instead of suggesting token retries', async () => {
    const before = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 403,
        text: async () => 'The repository owner has an IP allow list enabled, and 20.120.166.18 is not permitted to access this repository.'
    });
    try {
        await assert.rejects(
            requestJson('https://api.github.com/repos/aiamalaysia/restricted'),
            error => /HTTP 403/.test(error.message) && /approved self-hosted runner/.test(error.message)
        );
    } finally {
        global.fetch = before;
    }
});
