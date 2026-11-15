# ATGV AIATECH Assist v0.3.53 — Verified Legacy Scaffold Migration v2

## Fixes

- Save Stack upgrades a verified, committed React or Angular starter to the active GitHub SDLC Catalog on a new `migration/<stack>-catalog-<version>-<sha>` branch.
- The original `main` and `bootstrap/*` Git commits are preserved; no force pushes or existing branch overwrites.
- v1.1.1 `templateDigest` is verified against existing bytes, safe LF/CRLF normalization, or a matching historical catalog revision.
- No migration occurs if application contents differ from the verified original, an unrelated file is modified, or the new branch already exists.
- The original source and manifest are copied to a journal under Git metadata before any write; a write failure rolls back.
- Save Stack's normal test, build and runtime checks must complete before migration changes are staged, committed and pushed. Failed checks leave the old published branch untouched.
- A failed test can be retried on the same validated migration branch; the previous branch is not rewritten.
- New starter manifests record the active catalog Git commit and per-file SHA-256 hashes while retaining schema-1 compatibility.

## Scope / safety

- Only managed `react`/`angular` schema-1 draft starters are eligible for this migration.
- Migrations from `main`, partially tracked drafts, staged changes, unverified templates, or user-modified generated files are blocked.
- Missing historical catalog provenance is never guessed; a digest mismatch stops migration.
- The library repository is not modified.

## Validation

- Dedicated v0.3.53 regression tests for tracked migration, LF/CRLF, edited source protection, branch collision, successful publishing, failed test retry.
- Full extension regression, generated UI theme and VSIX packaging verification.
