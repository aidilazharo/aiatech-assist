# ATGV AIATECH Assist v0.1.52

## Changes

- Simplify dev-tools: short repository labels, compact status, Git progress and actionable buttons only. Wrap controls on narrow screens without clipping.
- Keep Open Source Code and Open Folder available for verified existing source directories even without Git. Resolve a unique matching nested managed checkout, without adopting an enclosing or wrong-origin repository.
- Keep Git writes gated on verified checkout identity; preserve full error and branch details in tooltips.
- Move diagnostic synchronization off the toolbar's critical path; daily brief retains diagnostic priorities.

## Validation

- JavaScript syntax checked and regression tests added. Full extension regression, VS Code visual verification and VSIX build not run.
