# ATGV AIATECH Assist v0.4.44

## Business Requirements workflow: Next Step readiness

- Set **Next Step** to primary blue only when the actual next-stage action is available; otherwise render a solid dark-gray disabled button with legible text.
- Use explicit milestone readiness, verified next-stage availability, and outstanding process prerequisites instead of painting based on completion alone.
- From Generate Requirements, allow **Preview & Save** only when the draft-preview action is available.
- From Preview & Save, keep **Approve Requirements** unavailable while Discovery Question 12 has unresolved decisions or outstanding BA review findings.
- Preserve draft preview and editing even if final approval is blocked; acknowledge source and AI issues using the existing formal review gate.
- Keep the navigation label, aria-disabled state, tooltip, mouse/keyboard behavior, and CSS visual status synchronized on every rerender.
- Add regression tests for blocked/ready transitions, generated-draft preview, pending approvals, and primary/neutral styling.

## Compatibility

- Existing draft/approved BRs, workflow history, source documents, and Jira links are not modified.
- No project register migration is needed. The update affects only UI navigation status and appearance.
- A previously saved requirement may still be reviewed while the approval gate is unresolved.
