# AI companion removal · 6 Nov 2026

Owner: Nils with Codex. Branch: `chore/remove-ai-companion`, based on main `f91f541`.
Nils explicitly cancelled the AI companion while the visual simplification work continued.

Removed the unused backend earned-context module and its tests, the active AI specification,
the language-model flag and future key placeholder. The public config and signed-out smoke
registry now contain the same ten flags. The former flag is rejected as unknown rather than
being silently accepted. Existing production FEATURE_FLAGS never included it, so this change
requires no environment edit, migration or live write.

Current roadmap, setup/contracts, privacy/provider inventory, security, contributor and
presentation copy no longer present an AI integration or client approval as future work.
The presentation PDF was regenerated after the copy change. Historical release snapshots
remain as records, with explicit later cancellation notices; the old earned-context handoff
is a cancellation marker so previous links resolve. Git history was not rewritten.

Ordinary scripted NPC partners remain intact. Their specification still forbids model-generated
partner text; only its reference to the now-removed flag was deleted. Archived gull/wisp art
studies are explicitly unassigned character studies, not live AI code, and are retained. The
general development environment sanitizer still strips potential LLM-prefixed secrets; that
defensive filter does not configure a model or restore a removed feature. No new route,
provider, SDK, dependency, applied SQL, G9 source, HUD, movement or story-dialogue edit is included.
The only current frontend change removes cancelled-feature copy from the standalone privacy page.

Verification:

- **1,121 backend checks passed**: exact flag/config contracts, settings parsing, all 1,024
  subsets of the ten remaining flags and current case gating. The retired name is explicitly
  rejected. No full backend suite or live game operation was used.
- **18 signed-out smoke fixtures passed**, retaining malformed/unknown flag and byte/asset guards.
- **Nine offline presentation browser checks passed**, producing a tagged ten-page PDF; extracted
  audience text contains no cancelled companion/helper copy.
- Audit validation passed: 99 locked components, 28 Python pins, 55 existing API routes, local
  source/lock/schema/asset proofs. The deletion changes no dependency or route inventory.
- Current text lint: 2,973 candidates in 333 files, zero errors, 26 existing report-only findings.
- Scoped Ruff and formatting passed from the documented backend working directory. Changed
  Markdown links resolve; whitespace checks pass.

No push, deployment, feature activation, API-key read or database operation was performed by this
package. Root integrates and verifies the live ten-flag config with the visual redesign release.
