# ATGV AIATECH Assist v0.1.15

- Extend verified shared BR recovery to UI/UX Designers and Developers; automatic role recovery imports only verified BR snapshots and Jira mappings without overwriting conflicting BA discovery/source files.
- Keep the exact previously published approved snapshot available while a separate BA draft is being edited, using the recorded publication hash. Never approve the new draft implicitly.
- Show explicitly role-labelled assigned Jira tasks under verified published Epics even before local mapping recovery; show missing-snapshot/mapping entries as unavailable for execution, rather than hiding assignments or inventing a BR.
- Always show the eye-shaped Preview Draft control beside Start Development; existing per-project opt-in, ownership, approved architecture/design and untested delivery guards remain in effect.
- Add shared role recovery and immutable snapshot regression coverage; synchronize version metadata. Full npm regression and live Jira/VS Code validation not run; no VSIX generated.
