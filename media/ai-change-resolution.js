'use strict';

(function (global) {
  const escapeHtml = text => String(text == null ? '' : text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const names = { detected: 'Review required', draft: 'Proposal generated', previewed: 'Ready for approval', approved: 'Approved', applied: 'Applied', conflict: 'Source conflict', rejected: 'Rejected', superseded: 'No longer reported' };

  function createChangeResolutionView(root, transport) {
    if (!root || !transport || typeof transport.send !== 'function') throw new Error('A root element and transport.send are required.');
    let cases = [];
    let targetWarnings = [];
    let selected = null;
    let working = false;
    let error = '';
    let pending = null;
    let confirmation = null;

    function issueCard(issue) {
      const active = issue.id === selected;
      return `<button type="button" class="acr-case ${active ? 'acr-active' : ''}" data-select="${escapeHtml(issue.id)}">
        <span class="acr-case-text"><strong>${escapeHtml(issue.title)}</strong><small>${escapeHtml(issue.severity)} priority · ${escapeHtml(names[issue.status] || issue.status)}</small></span>
        <span class="acr-chevron" aria-hidden="true">${active ? '⌄' : '›'}</span>
      </button>`;
    }

    function details(issue) {
      if (!issue) return '';
      const proposal = issue.proposal;
      const preview = issue.preview;
      const canPreview = ['draft', 'previewed', 'approved'].includes(issue.status);
      const canApprove = issue.status === 'previewed' && preview;
      const canApply = issue.status === 'approved';
      const canGenerate = issue.status !== 'applied';
      const items = proposal?.changes || [];
      return `<div class="acr-detail">
        <div class="acr-detail-heading"><strong>${escapeHtml(issue.title)}</strong><span class="acr-chip">${escapeHtml(issue.category)}</span></div>
        <p>${escapeHtml(issue.details)}</p>
        <div class="acr-section"><strong>AI proposed resolution</strong>${proposal
          ? `<p>${escapeHtml(proposal.summary)}</p><p class="acr-muted">${escapeHtml(proposal.rationale)}</p><p class="acr-muted">Risk: ${escapeHtml(proposal.risk)}</p><div class="acr-change-list">${items.map(item => `<div><span class="acr-operation">${escapeHtml(item.operation)}</span> ${escapeHtml(item.artifactId)}${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</div>`).join('')}</div>`
          : '<p class="acr-muted">No proposal generated. Generate a proposed resolution to review affected artifacts.</p>'}
        </div>
        ${preview ? `<div class="acr-section acr-preview"><strong>Change preview</strong>${preview.summary ? `<p>${escapeHtml(preview.summary)}</p>` : ''}<pre>${escapeHtml(JSON.stringify(preview.diff || preview.changes || preview, null, 2))}</pre></div>` : ''}
        ${issue.approval ? `<p class="acr-muted">Approved by ${escapeHtml(issue.approval.by)} · ${escapeHtml(issue.approval.at)}</p>` : ''}
        <label class="acr-label" for="acr-instructions">Additional AI instructions</label>
        <textarea id="acr-instructions" placeholder="Describe how AI should refine the selected proposal..." rows="2" ${working || !canGenerate ? 'disabled' : ''}></textarea>
        <div class="acr-actions">
          <button type="button" data-action="generate" ${!canGenerate || working ? 'disabled' : ''}>${proposal ? 'Regenerate with AI' : 'Generate with AI'}</button>
          <button type="button" data-action="preview" ${!canPreview || working ? 'disabled' : ''}>Preview</button>
          <button type="button" class="acr-primary" data-action="approve" ${!canApprove || working ? 'disabled' : ''}>Approve</button>
          <button type="button" data-action="apply" ${!canApply || working ? 'disabled' : ''}>Apply approved changes</button>
          <button type="button" data-action="reject" ${issue.status === 'applied' || working ? 'disabled' : ''}>Reject</button>
        </div>
      </div>`;
    }

    function render() {
      const unresolved = cases.filter(issue => issue.status !== 'applied' && issue.status !== 'rejected' && issue.status !== 'superseded');
      root.hidden = unresolved.length === 0 && targetWarnings.length === 0;
      if (root.hidden) return;
      if (!unresolved.some(issue => issue.id === selected)) selected = unresolved[0].id;
      const issue = unresolved.find(value => value.id === selected);
      root.classList.add('acr-root');
      root.innerHTML = `<section class="acr-panel" aria-label="AI Change Resolution">
        <header class="acr-header"><div><h2>AI Change Resolution <span class="acr-count">${unresolved.length} issue${unresolved.length === 1 ? '' : 's'} found</span></h2><p>AI prepares changes. You review and approve before anything is applied.</p></div><button type="button" data-action="refresh" ${working ? 'disabled' : ''}>Refresh</button></header>
        ${error ? `<div class="acr-error" role="alert">${escapeHtml(error)}</div>` : ''}
        ${targetWarnings.length ? `<div class="acr-error" role="status"><strong>${targetWarnings.length} discovery change(s) require source-to-BR reconciliation.</strong> Automatic multi-BR updates were blocked; approved BRs and Jira issues were not changed. Review the correct BR and create a targeted revision. ${targetWarnings.slice(-3).map(x=>`<p>${escapeHtml(x.sourceId)}: ${escapeHtml(x.reason)}</p>`).join('')}</div>` : ''}
        ${unresolved.length ? `<div class="acr-layout"><div class="acr-cases">${unresolved.map(issueCard).join('')}</div>${details(issue)}</div>` : ''}
        ${working ? '<div class="acr-busy" role="status">Processing selected resolution…</div>' : ''}
        ${confirmation ? `<div class="acr-modal-backdrop" role="presentation"><div class="acr-modal" role="dialog" aria-modal="true" aria-label="Confirm AI resolution action"><strong>Confirm ${escapeHtml(confirmation.action)}</strong><p>${escapeHtml(confirmation.action === 'approve' ? 'Approve the previewed AI resolution? No documents will change until you apply.' : confirmation.action === 'apply' ? 'Apply these approved changes? External Jira publication remains separately gated.' : 'Reject this AI resolution?')}</p><div class="acr-actions"><button data-action="confirm-no">Cancel</button><button class="acr-primary" data-action="confirm-yes">Confirm</button></div></div></div>` : ''}
      </section>`;
    }

    root.addEventListener('click', event => {
      const control = event.target.closest('[data-action], [data-select]');
      if (!control || !root.contains(control) || working) return;
      if (control.dataset.select) {
        selected = control.dataset.select;
        error = '';
        render();
        return;
      }
      const action = control.dataset.action;
      if (!action) return;
      const instructions = root.querySelector('#acr-instructions')?.value || '';
      if (action === 'confirm-no') {
        confirmation = null;
        render();
        return;
      }
      if (action === 'confirm-yes') {
        if (!confirmation) return;
        const accepted = confirmation;
        confirmation = null;
        pending = { action: accepted.action, issueId: accepted.issueId };
        working = true;
        error = '';
        render();
        transport.send({ type: 'aiChangeResolution/request', ...accepted });
        return;
      }
      if (['approve', 'apply', 'reject'].includes(action)) {
        confirmation = { action, issueId: selected, instructions };
        render();
        return;
      }
      pending = { action, issueId: selected };
      working = true;
      error = '';
      render();
      transport.send({ type: 'aiChangeResolution/request', action, issueId: selected, instructions });
    });

    function receive(message) {
      if (!message || !String(message.type || '').startsWith('aiChangeResolution/')) return;
      if (message.type === 'aiChangeResolution/state') {
        cases = Array.isArray(message.cases) ? message.cases : [];
        targetWarnings = Array.isArray(message.targetWarnings) ? message.targetWarnings : [];
        pending = null;
        working = false;
        error = '';
      } else if (message.type === 'aiChangeResolution/error') {
        working = false;
        pending = null;
        error = message.message || 'Unable to process the request.';
      }
      render();
    }

    return { receive, render, getState: () => ({ selected, working, pending, cases: JSON.parse(JSON.stringify(cases)) }) };
  }

  global.ATGVAIChangeResolution = { createChangeResolutionView };
})(typeof window !== 'undefined' ? window : globalThis);
