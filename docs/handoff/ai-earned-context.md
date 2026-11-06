# AI earned-context foundation · 6 Nov 2026

Owner: Nils with Codex. Branch: `feat/ai-earned-context`, following main `db4ddba`.

The helper's first backend component is a pure, provider-free context projection. It is not
registered in the app and adds no route, SDK, dependency, configuration, migration, provider
request, OAuth flow or frontend/G9 change. Nothing activates `companion_llm` or spends plan/API
usage. Hosted ChatGPT login and plan usage still need the official approved website integration.

`server.companion_context.earned_hint_context` requires validated server `CaseData`, a current
server-owned `CaseSnapshot`, the authenticated `Player`, and server-generated case seconds.
It requires exactly one seated identity, an active/finished opened case, bounded integer
revision/time, and no future completed-deduction records. It then uses the actual pure
`build_case_view`; it never calls the state-initializing case service or a database method.
The typed boundary helps prevent accidentally forwarding a request DTO. It does not authenticate
an identity itself: any future caller must obtain `Player` through the existing verifier and
fetch the player's current snapshot through its membership-checked server store.

The new result is an exact fresh allowlist: version; earned cards with ID/title/text; completed
deductions with ID/name/finding; and `card:<id>`/`deduction:<id>` citation IDs generated only from
those included rows. It does not copy the full view and delete known fields. Reveal text,
suspects, unearned leads, searches, holders, crew/player identifiers, names, wallets, rewards,
credits, future arbitrary fields and caller prompts cannot expand that allowlist. This is data
preparation, not a system prompt, tool allowlist or proof of safe model output.

Limits: 16 cards, eight deduction rows, 64-byte ASCII identifiers, 256-byte titles/names,
2,048-byte card/finding text and 16,384 bytes for the compact UTF-8 JSON result. Empty, malformed,
duplicate, invalid-ID or oversized required data is refused with a constant error; no evidence
is truncated. Unicode limits count encoded bytes. The current complete canonical evidence
comfortably fits. Pending finds still follow the production ready-second boundary, and even an
earned solved reveal is excluded. Future deduction timestamps are refused independently of the
ordinary case-view contract.

Verification:

- Tests-first import gate failed because the new module did not exist, then **41 focused tests
  passed**. Tests use the actual case-view builder and existing server snapshots; protected prose
  comes from the existing server loader and is never copied into new public fixtures.
- Real pending-card landing, wrong/duplicate viewer, finished/reveal stripping and unchanged
  snapshot are checked. Service initialization methods are replaced with failing sentinels.
- Untrusted dictionaries, malformed views/text/completion flags, future records, revision/time,
  duplicate/forged IDs, UTF-8 field bounds, list bounds and total serialized bytes are checked.
  Extra prompt/tool/citation fields cannot widen disclosure. Incomplete findings are not read.
- The combined helper and existing view/spoiler/reveal gate passed **66 tests**. Ruff check,
  format and whitespace checks pass. No full backend suite or live authenticated/inference test
  is claimed for this leaf.

Remaining: fresh verified snapshot/consent endpoint, fixed public-help context, bounded user input,
approved OAuth and plan-usage clients, cancellation/output limits, citation validation, safe UI,
provider errors and live proof. A context filter cannot stop a model from guessing or drawing on
its own training; the eventual reply policy and evaluation must independently check spoiler safety.
No fallback to project-paid inference or borrowed Codex credentials is provided.

Independent review approved exact source `1aafd7e7360ba47483134c866ec8515adc3d7b92`: **82**
helper/current case/finale/NPC/spoiler/reveal checks passed, plus scoped Ruff/format/whitespace.
A separately constructed complete earned canonical snapshot fits at 3,392 UTF-8 bytes: eight
cards, four deductions and twelve derived citations. Values were not printed. No actionable
blocker was found; the current-snapshot/verified-identity caller requirement remains mandatory.
