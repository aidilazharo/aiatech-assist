# ATGV AIATECH Assist v0.1.16

- Extend the shared npm dependency installer with opt-in, policy-scoped recovery for package-version-specific HTTP 403 responses. Generic authentication, connectivity and package-wide prohibition failures remain terminal.
- Evaluate explicitly approved versions of the original module, within its declared npm range and original major version, prioritizing dependency-verified versions then same-minor patches. Never change registry, TLS, or firewall settings. Stop after 12 install attempts.
- Keep a private SQLite history of rejected and dependency-verified versions across projects, scoped by policy revision, package range, OS, architecture, Node and npm versions. Record positive memory only after the installed version, npm dependency tree and platform checks pass.
- Preserve project manifests and lockfiles during temporary recovery; a permanent pin or incompatible/exact-range change requires separate review. Application startup and functional validation remain separate from dependency verification.
- Add simulated regression tests and synchronize version metadata.

## Enable corporate-policy recovery

Place an IT-approved policy file at `~/.atgv-aiatech-assist/npm-version-policy.json` (Windows: under the user's home directory). Use the current authorized HTTPS npm registry, a policy identifier, expiry, and explicitly approved versions per package. Example (illustrative only; not an approval):

```json
{
  "policyId": "IT-APPROVAL-ID",
  "registry": "https://npm.example.invalid/",
  "expiresAt": "2027-01-01T00:00:00Z",
  "packages": { "example-package": ["1.2.1", "1.2.2"] }
}
```

The file must be supplied and maintained by the authorized policy owner. No policy is bundled. With no valid matching policy, a 403 stops installation. SQLite memory is stored in `npm-policy-recovery.sqlite` beside the policy, outside Git. No credentials are stored in the SQLite table.

## Validation

Isolated policy parsing, SQLite persistence and candidate-ordering checks passed on Node 22.16.0. Full repository regression, Windows/live firewall validation and VSIX packaging were not run because the build environment could not resolve github.com. Integration regression tests are included but not yet executed.
