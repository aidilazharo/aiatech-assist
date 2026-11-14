'use strict';

const { projectConfig } = require('./projects');

function hostname(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.host : '';
  } catch {
    return '';
  }
}

/**
 * The Overview reports the destination saved for the currently selected ATGV
 * project.  These are configured mappings, not live remote permission checks.
 * Keep space names and immutable IDs in the same settings scope as the key so
 * a project override cannot accidentally display another space's metadata.
 */
function overviewConnections(project, extensionSettings = {}, globalConfig) {
  if (!project) return {
    jira: { key: '', site: '', source: 'none' },
    confluence: { key: '', name: '', spaceId: '', site: '', source: 'none' }
  };
  const config = projectConfig(project, extensionSettings, globalConfig);
  const jiraProject = project.settings?.jira || {};
  const jiraGlobal = extensionSettings.jira || {};
  const confluenceProject = project.settings?.confluence || {};
  const confluenceGlobal = extensionSettings.confluence || {};
  const jiraKey = String(config.get('jira.projectKey') || '').trim();
  const spaceKey = String(config.get('confluence.spaceKey') || '').trim();
  const jiraSource = jiraKey ? (jiraProject.projectKey ? 'project' : 'extension') : 'none';
  const spaceSource = spaceKey ? (confluenceProject.spaceKey ? 'project' : 'extension') : 'none';
  const spaceScope = spaceSource === 'project' ? confluenceProject : confluenceGlobal;
  return {
    jira: {
      key: jiraKey,
      site: hostname(config.get('jira.baseUrl')),
      source: jiraSource
    },
    confluence: {
      key: spaceKey,
      name: spaceKey ? String(spaceScope.spaceName || '').trim() : '',
      spaceId: spaceKey ? String(spaceScope.spaceId || '').trim() : '',
      site: hostname(config.get('confluence.baseUrl')),
      source: spaceSource
    }
  };
}

module.exports = { overviewConnections };
