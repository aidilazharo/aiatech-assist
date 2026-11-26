# ATGV AIATECH Assist v0.1.53

## Changes

- Scan existing npm modules before installation or Windows offline bundle restoration. Check required dependencies, full offline npm dependency graph, native platform and available runtime smoke probes.
- Reuse healthy existing module trees, including manually restored offline modules, without rewriting them or requiring an ATGV restore marker. Bundle policy, manifest fingerprint and Node platform checks still apply; existing-tree health does not prove archive byte identity.
- Repair only missing, invalid, incompatible or recorded failed dependencies; keep explicit fresh isolated-worktree mode and required offline policy intact.
- Report installation skipped and continue to local startup. Native Maven/.NET restore behavior is unchanged.

## Validation

- Syntax checked; regression cases added. Full regression and actual Windows startup not run; VSIX not built locally.
