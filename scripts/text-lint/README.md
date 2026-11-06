# Player-facing text lint

Checks display-copy candidates for G24. Used by contributors and the normal frontend Vitest suite. No dependencies are added.

Run from the repository root:

```bash
node scripts/text-lint/index.mjs
```

`--json` returns structured findings; `--vocabulary` prints the candidate vocabulary for manual review, without changing the dictionary. Exit 1 means an editable-copy error or a possible spoiler; report-only findings do not fail the command. Extraction/read/JSON failures are errors, never silently skipped.

- Sources: JavaScript literals and template chunks (including visible/accessibility copy inside HTML templates) in `frontend/src/` and `frontend/public/`, HTML text and accessibility attributes in frontend entries/public files, and display fields in non-secret backend/frontend JSON. Comments, imports, CSS selectors, shader code, exception/console diagnostics and machine identifiers are excluded where recognized. Source locations and JSON field paths accompany findings.
- `words.txt` is a small reviewed project vocabulary, not a general English dictionary. It includes ordinary inflections, contractions, nautical terms, public proper names and visible abbreviations. Unknown words fail; review their spelling before adding them. Never regenerate the file automatically from the source. Approved current words can still be used in the wrong context; a human must review prose.
- `policy.json` records American house spelling, canonical public names and representative long template values. Straight and curly apostrophes compare equally; all-capital headings are allowed. One-edit name variants and capitalization changes are caught; this is not semantic entity resolution. Keep canonical names in sync with the place registry and company content when their owners approve a rename.
- Dash checks apply to extracted copy, not comments, CSS variables or operator syntax. Literal editorial placeholders and undeclared/malformed brace fields fail. Partner fields are checked against both the global declarations and each event's `placeholders_used`; every sample substitution must finish without braces.
- Documented size checks: partner lines use their own `max_characters` after sample substitution; generated captain names must fit 24 characters. The UI kit has no character-count caps: its browser checks verify font size, wrapping and overflow instead. Sample interpolation sizes are not guarantees for arbitrary runtime values.
- Protected story and its demo copy, adapter/online code, case screens (festival and sports are gated), and nested market/weather content are audited but report-only. There is no baseline suppression for editable text. Spoiler findings always fail, including in report-only files.
- The spoiler check reuses the existing protected-reveal fingerprints and flags direct named-culprit/masked-captain associations. It reads no secret files and emits no reveal prose. Fingerprints cannot prove that every possible paraphrase or indirect inference is safe; human review and the production spoiler guard remain necessary.

This is a conservative source audit, not a JavaScript parser or a runtime localization system. Computed labels, concatenations, server-generated API error messages, external service text, pixel-art lettering and all runtime interpolation paths need functional/human review. The linter does not replace the application's renderers or truncate text. The current server NPC line bank validates declared fields and bounds; sample checks here complement its focused server tests. Keep protected findings in the handoff; this integration does not edit approved case or culprit prose.
