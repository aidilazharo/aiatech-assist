# ATGV AIATECH Assist v0.4.49

## Jira Preflight — before preview

- Check every planned Jira issue and its existing remote identity before generating an approvable Jira Preview.
- Validate parent references, issue types, project, duplicate matches, edit/create field metadata, required fields, and remote changes.
- Collect blocking findings in a dedicated **Jira Preflight** view; the actual Jira Preview is not rendered until preflight passes.
- Show count of checked items, all identified blocking findings, and a **Fix Jira Link** action for verified recovery candidates.
- Rerun preflight after repairing an existing link. Fail closed for mismatched issue identities and unexpected Jira updates.

## Jira link repair

- Use structured Jira issue keys and BR paths instead of relying solely on error-message text.
- Correct the 8-column Jira preview DataTable layout to stop header and row-action overlap in narrow VS Code panels.
- If an existing role subtask is verified but does not match the current approved BR wording, link it without rewriting Jira and retain an explicit UPDATE pending approval.
- Show recoverable errors and restore the **Fix Jira Link** button for another attempt.

## Verification and release

- Added regression checks for preflight gating, Jira link recovery, historical role-task content and table layout.
- GitHub Actions must pass the full regression suite, theme validation and VSIX packaging before this release is promoted.
- The public release mirror requires its own credentials and update workflow; a private source release does not automatically update the public VSIX download.
