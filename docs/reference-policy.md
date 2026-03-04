# Reference Use Policy

## Goal
Use external toolboxes, repos, and books to improve implementation quality while preserving legal and ethical compliance.

## Default Rule
Implement independently by default.

## Allowed Reference Modes
- `reference_only`: Learn concepts/methods only. Do not copy code.
- `adapt_with_citation`: Adapt nontrivial code with attribution and license compliance.
- `direct_reuse`: Copy code only when license permits and attribution requirements are met.

## Source Intake Requirements
- Record source URL/path and version pin (commit/tag/release/date).
- Record license status before reuse.
- Record intended usage mode (`reference_only`, `adapt_with_citation`, `direct_reuse`).

## License Guardrails
- Permissive licenses (MIT/BSD/Apache): Reuse/adaptation typically allowed with attribution.
- Copyleft licenses (GPL/AGPL/LGPL): Reuse allowed only if project obligations are acceptable.
- No license / unclear license: Treat as all-rights-reserved; do not copy code.

## Attribution Rules
- For nontrivial adapted/reused code, add:
  - Inline provenance comment near implementation.
  - Entry in `THIRD_PARTY_NOTICES.md` with source, version, license, and changes made.
- For `reference_only`, do not copy code; optionally cite method source in docs.

## Textbooks and Papers
- Allowed as technical references.
- Prefer method-level summaries and independent implementations.
- Do not include large copyrighted excerpts in repo files.

## Decision Flow
1. Identify source and license.
2. Choose usage mode.
3. Implement or adapt accordingly.
4. Add attribution/notice entries if adaptation or reuse occurred.
5. Verify obligations are satisfied before merge/release.
