# GitHub SDLC Catalog integration — ATGV v0.0.92

Open **Extension Settings → Integrations → GitHub — SDLC Catalog**. This is a global extension configuration, separate from the per-project GitHub repository.

## Create the central GitHub repository

Use a private or public repository. Example:

```
atgv-sdlc-catalog/
├── catalog.yaml
├── roles/
│   ├── business-analyst/SKILL.md
│   ├── developer/SKILL.md
│   └── ...
├── shared/
│   ├── workflows/
│   ├── policies/
│   └── document-templates/
└── tech-stacks/
    ├── react-node/stack.yaml
    ├── react-node/skeleton/
    ├── dotnet/stack.yaml
    ├── dotnet/skeleton/
    └── ...
```

The **machine-readable** root manifest can be either `catalog.json` (recommended for complex metadata) or a simple `catalog.yaml` (as shown below). The extension currently uses the manifest for validation and counting; it does not run any downloaded scripts or deploy applications.

```yaml
schema: 1
version: 1.0.0
roles:
  - business-analyst
  - project-manager
  - solution-architect
  - developer
  - qa-engineer
techStacks:
  - react-node
  - dotnet
  - spring-boot
  - angular
  - nestjs
```

All role IDs must match `roles/<role-id>/SKILL.md`. Each listed stack must contain `tech-stacks/<stack-id>/stack.yaml` or `stack.json`. Add the rest of your SDLC roles as desired. Catalog counts are taken from your manifest, not hardcoded.

## Configuration and operation

1. Enter `https://github.com/organization/atgv-sdlc-catalog` and choose a pinned release tag (recommended) or branch.
2. Select VS Code GitHub sign-in, fine-grained PAT (Contents: Read), or public access.
3. Select **Test Connection** and **Save Catalog Settings**.
4. Select **Pull Catalog** to retrieve role skills, shared workflows and all stack definitions into ATGV's **global storage cache**. The download is verified against GitHub blob hashes, size limits, and path safety checks before a versioned snapshot is activated.
5. Select **View Updates** to compare the remote commit SHA to the installed snapshot; it does not change project files.

The optional hourly update check is independent from project opening. The catalog API performs read-only operations and never creates commits, branches or pull requests.

## Important scope boundary

This release integrates **catalog configuration, authentication, read-only download, verification, caching, and update status** into Settings. It **does not automatically replace the extension's built-in SDLC role skills or existing technology-stack templates**, copy external skeletons into a project, or overwrite approved project artifacts. Those adoption actions should be implemented as a separate explicit preview-and-approve workflow. Existing Jira, Confluence, project GitHub, BR approvals, and project startup behavior remain unchanged.

## Security

- Private PATs are stored in VS Code SecretStorage; no token is written into the catalog snapshot or project.
- Only `github.com` repositories and `api.github.com` GitHub REST endpoints are accepted.
- Symlinks, path traversal, unsupported Git tree objects, oversized files and corrupted blob hashes are rejected.
- Downloads are staged and validated before updating the active catalog cache pointer.
- Published projects are not modified by pulling a new catalog.
