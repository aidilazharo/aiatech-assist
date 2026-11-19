# ATGV AIATECH Assist v0.4.50

## Discovery Question 12: No forced "NONE"

- Accept a saved, non-empty answer to all twelve Discovery questions before AI Review. Actual unresolved decisions no longer block AI Review or the review-acknowledgement action.
- Display the Question 12 label as **Open decisions and unresolved questions** without requiring a special word or punctuation.
- Add an explicit **No open decisions (confirmed)** checkbox; it writes an editable plain-language answer only when the field is empty or already a no-decisions confirmation. It never silently overwrites actual listed decisions.
- Retain manual **Save 12 Questions**. Checkbox selection is not automatic saving; changed answers still invalidate the previous AI Review until re-run.
- Preserve existing NONE/NONE. answers and accept "No open decisions", "No unresolved decisions", "No outstanding decisions" and N/A as equivalent explicit confirmations.

## Approval safeguard

- Keep real open decisions visible in discovery review and draft generation, with a **needsDecision** state.
- Block both host-level final BR approval routes while Question 12 contains unresolved business decisions, even if AI Review findings have been acknowledged. Do not block review or draft preparation.
- Keep independent Business Owner review, source integrity, and Jira publication protections unchanged.
- Normalize no-decision statements consistently when merging evidence across document sections; never discard real unresolved decisions in other sections.

## Verification and packaging

- Add regression tests for blank Q12, 12/12 review with real open decisions, explicit no-decisions confirmation, UI synchronization, and the separate host approval gates.
- GitHub Actions runs the regression suite, Windows checks, UI theme check, and VSIX packaging before release is merged.
