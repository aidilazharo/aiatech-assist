# ATGV AIATECH Assist v0.0.75

## Changes
- Generated Requirements now identifies each BR marked "Needs attention", the affected section, the quality-review reason and the exact cited text when available.
- Regeneration receives unresolved draft-quality findings alongside user feedback, so it can try to correct the actual issue using verified source evidence.
- Identical regenerated drafts are reported as unchanged instead of modified; repeating unchanged content cannot silently clear a quality finding.
- Generation results show counts for new, changed and unchanged BRs, with a specific explanation when no requirement content changes.
- Uniform section spacing, readable typography, buttons, dark-theme Quill and Jira Preview fields; the raw `[ ]` notation remains plain text, not a checkbox.
- BR source identities, approved content, Jira publication approvals and existing linked Jira issue keys remain protected.

## Verification
- Added test/v075-ba-attention-consistency.test.js.
- JavaScript syntax validation passed for modified client, backend and runtime modules.
- GitHub Actions runs npm test, UI validation and VSIX packaging for this version.
- Changes to already published Jira issues still require the existing approval and reconciliation workflow.
