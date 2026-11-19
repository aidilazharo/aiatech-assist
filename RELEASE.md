# ATGV AIATECH Assist v0.4.48

## Public release reliability

- Identify when the public extension mirror (`aidilazharo/extension`) is older than the locally installed extension.
- Display `Public release mirror is behind` rather than misleading `latest v...` wording; do not offer older VSIX packages as updates.
- Preserve public-only release discovery (`aidilazharo/extension` and `aidilazharo/library`). Private development repositories remain outside update discovery.
- Public mirror workflow preflight and credential setup documentation are maintained separately in `aidilazharo/extension`. The mirror cannot read private source assets until the repository Actions secret `ATGV_SOURCE_READ_TOKEN` has permission.

## Jira workflow

- Include the one-click **Fix Jira Link** recovery for Jira issues that already exist but lack a local recorded create operation.
- Verify source identity, Jira project, parent, issue type, role label, and exact approved or authorized role-repair content before restoring the local link.
- Never create, delete or modify remote Jira issues as part of link recovery; record recovery in the local audit log and regenerate Jira Preview.

## Verification

- Add regression tests for an out-of-date public mirror, no-downgrade behavior and public-only release discovery.
- Run the full extension regression suite, Windows checks and VSIX packaging through GitHub Actions before publishing the release.

**Operational note:** Configuring `ATGV_SOURCE_READ_TOKEN` on the public mirror is a required repository-owner action. Publishing the private-source release alone cannot make newer releases appear in the public mirror.
