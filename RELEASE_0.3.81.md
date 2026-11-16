# ATGV AIATECH Assist v0.3.81 — Remove Library pull action from brand headers

- Remove the **Pull Latest Library** button from both the initial/start screen branding and the workspace top bar.
- Preserve the compact, left-aligned logo, title, and single verified installed Library version.
- Keep existing **Pull Catalog** under SDLC Catalog settings and the verified Git SHA/version update workflow unchanged.
- Remove obsolete button handlers and style rules, and add regression coverage asserting neither brand header contains update controls.
- No changes to stored project data, active Library checkout, or credentials.
