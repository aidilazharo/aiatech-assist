# ATGV AIATECH Assist v0.4.40

## Business Requirements — Markdown-only intermediate files

- Preserve the original DOCX/PDF unchanged and authoritative; create verified `.md` source units under `documents/requirements/br-markdown/`, with no newly generated TXT intermediates.
- Add a Markdown BR heading, SHA-256 provenance, continuation number, and verbatim extracted source content to each unit. AI mapping reads exactly the extracted source characters, not the Markdown wrapper.
- Keep logical multiple-BR grouping, continuation-part grouping, 12-question discovery, sequential preflight/mapping, cumulative results, human review, Jira publication gates and authenticated resume checkpoints.
- Migrate v0.4.39 saved TXT references to verified Markdown on demand, preserving SHA-256 source identity and prior mapped answers. Retire legacy TXT only after Markdown integrity verification.
- Delete both Markdown intermediates and obsolete legacy TXT units when deleting the original document.
- Extend tests for Markdown exact round-trips, tampering detection, migration and source cleanup.

## Fidelity limitations

- Markdown preserves the *extracted* source without inventing missing tables, figures, approvals or requirements. A conversion cannot reconstruct DOCX/PDF information not captured by the existing extractor.
- Split logic is conservative and based on numbered BR headings. Large individual BRs remain grouped as continuation parts.
- More than 64 processing units or an oversized extraction fails safely; no content is silently truncated.
