# ATGV AIATECH Assist v0.0.38

## Changes

- Business Requirements now prepares the source, develops requirements, and builds a Jira preview automatically. Publishing and republishing still require an explicit click and confirmation.
- The four-stage page aligns the BA skill dropdown with the generated title and keeps the AI wave active only during preparation. Source documents, the ISO/IEC/IEEE 29148 working BRD, 12 Discovery answers, generated requirements, and proposed Jira placement are grouped in collapsible editors with Draft and Ready states.
- A DataTables hierarchy shows Jira items by type and opens their field editors. Preflight checks the Jira project’s field schema, allowed values, Acceptance Criteria, and Definition of Done. The BA role uses guidance derived from `TRM_Application_Req` when generating requirements.
- Republish previews the linked In Progress and Done items affected by a BR revision, then moves them to To Do using verified Jira transitions after confirmation. The publication journal supports resuming interrupted updates.

## Validation

- Regression fixtures cover automatic preparation, editable artifacts, field mapping, publish approval, and scoped Jira transitions. The release workflow verifies Linux packaging, Windows stack reset, and activation of the packaged extension.
