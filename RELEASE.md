# ATGV AIATECH Assist v0.1.33

## Changes

- Add Scan Folder at the right of the Solution Architect Technology Stack header. Discover project repository folders, prompt on explicit scans when more than one folder exists, and remember the selected folder per project for subsequent Custom Stack operations.
- Integrate imported Windows x64 offline Library v0.0.11 packages for new single-stack starters: React, Angular, NestJS, .NET and Spring Boot. Match scaffold fingerprints, restore prepared npm modules without online installation, use local NuGet and Maven offline, and stop if a required package is missing.
- Preserve existing older starter and other-platform behavior; do not silently migrate edited projects or execute Library scripts.

## Validation

- JavaScript syntax checked for changed modules; folder-selection regression test added. Full regression, Windows builds, offline package publication and VSIX packaging not verified.
