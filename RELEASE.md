# ATGV AIATECH Assist v0.1.46

## Changes

- Accept local-build tags bound to the exact source release commit.
- For local builds, require the primary versioned artifact and either its checksum file or GitHub-published SHA-256 digest. Optional source ZIPs are verified when present; regular CI release requirements remain unchanged.
- Copy and publish verified release artifacts independently of the copied code version after destination PR merge. Keep source provenance, protected repository pairs and no-downgrade checks.
- Recognize local releases in the extension and Library updaters and release download links. Verify downloaded bytes before installation.
- Check the durable release queue immediately after enqueue and continue hourly retry checks.

## Validation

- Verified the source v0.1.41 release metadata through GitHub; it contains a VSIX with a published SHA-256 digest.
- Focused source checks; full regression and VSIX packaging not executed here.
