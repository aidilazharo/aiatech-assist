'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { overviewConnections } = require('../src/overview-connections');
const root = path.join(__dirname, '..');

test('Overview uses the active project Jira and Confluence mappings, not another project', () => {
  const extension = {
    jira: { projectKey: 'OTHER', baseUrl: 'https://corp.atlassian.net' },
    confluence: { spaceKey: 'OTHERSPACE', spaceName: 'Unrelated', spaceId: '42' }
  };
  const project = { id: 'one', settings: {
    jira: { projectKey: 'TC' },
    confluence: { spaceKey: 'TCC', spaceName: 'Tech Cockpit', spaceId: '10002' }
  }};
  const result = overviewConnections(project, extension);
  assert.deepEqual(result.jira, { key: 'TC', site: 'corp.atlassian.net', source: 'project' });
  assert.deepEqual(result.confluence, { key: 'TCC', name: 'Tech Cockpit', spaceId: '10002', site: 'corp.atlassian.net', source: 'project' });
});

test('Overview distinguishes inherited mapping from saved project mapping', () => {
  const result = overviewConnections({ id: 'new', settings: {} }, {
    jira: { projectKey: 'OPS', baseUrl: 'https://company.atlassian.net' },
    confluence: { spaceKey: 'DOCS', spaceName: 'Documents', spaceId: '300' }
  });
  assert.equal(result.jira.source, 'extension');
  assert.equal(result.confluence.source, 'extension');
  assert.equal(result.confluence.spaceId, '300');
});

test('Overview does not inherit a different space name or ID for an overridden space key', () => {
  const result = overviewConnections({ id: 'one', settings: { confluence: { spaceKey: 'PRIVATE' } } }, {
    confluence: { spaceKey: 'GLOBAL', spaceName: 'Global Space', spaceId: '55' }
  });
  assert.equal(result.confluence.key, 'PRIVATE');
  assert.equal(result.confluence.name, '');
  assert.equal(result.confluence.spaceId, '');
});

test('Overview without a selected project cannot show stale Jira/Confluence destinations', () => {
  const result = overviewConnections(null, { jira: { projectKey: 'TC' }, confluence: { spaceKey: 'TCC' } });
  assert.equal(result.jira.key, '');
  assert.equal(result.confluence.key, '');
  assert.equal(result.jira.source, 'none');
});

test('Startup connections render selected-project mappings from refreshed state via editable input values', () => {
  const extension = fs.readFileSync(path.join(root, 'test/generated/extension-source.txt'), 'utf8');
  const webview = fs.readFileSync(path.join(root, 'media/start.js'), 'utf8');
  assert.match(extension, /mappingView\(openingFlow\.phase==='open'\?activeProject:null/);
  assert.match(extension, /startupProjectMappings=Object\.fromEntries\(projects\.map\(project=>\[project\.id,mappingView\(project,extensionSettings,cfg\(\)\)\]\)\)/);
  assert.match(webview, /startupProjectMappings=msg\.startupProjectMappings\|\|\{\}/);
  const form=extension.indexOf('id="startupConnectionForm"');
  const end=extension.indexOf('</form>',form);
  for(const id of ['overviewJiraProjectKey','overviewConfluenceSpaceKey']){
    const offset=extension.indexOf('id="'+id+'"');
    assert.ok(form>=0&&offset>form&&offset<end,id+' belongs to startup connections');
  }
  assert.match(extension, /id="overviewJiraProjectKey"/);
  assert.match(extension, /id="overviewConfluenceSpaceKey"/);
  assert.match(webview, /renderOverviewConnections\(msg\.projectConnections\)/);
  assert.match(webview, /renderKey\('overviewJiraProjectKey',jira\)/);
  assert.match(webview, /renderKey\('overviewConfluenceSpaceKey',space\)/);
  assert.match(webview,/input\.value=saved/);
});
