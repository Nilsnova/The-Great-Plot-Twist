# Optional AI hints and help

Used by: the next assistant package after G9; records Nils' request of 6 Nov 2026.

Owner: Nils with Codex. Scope: spoiler-safe hints and help, with official ChatGPT sign-in and eligible
ChatGPT-plan usage. This is additional scope, not a replacement for the core release.

## Delivery

Use the existing default-off `companion_llm` flag; activation follows the proofs below.

- Add an optional helper panel with explicit connection, consent, loading, reply, cancellation,
  disconnected, quota and recovery states. Ordinary play never depends on AI availability.
- Link ChatGPT to an existing verified game account; preserve the Supabase/GitHub account identity.
  Never link accounts using an email match alone.
- Use the official website Authorization Code + PKCE + OIDC flow, with one-use expiring transaction
  state and validated issuer, audience, signature, nonce and callback. Keep provider credentials on
  the server, redact logs and allow disconnect. Use a registered client, never a borrowed client ID.
- Ask separately for eligible plan usage; signing in alone is not consent to AI usage. No silent
  fallback to project-paid API inference and no fabricated successful connection in demo mode.
- Build context server-side from the requester's earned and authorized game view plus public help.
  Never pass the secret case file, future cards/deductions, other crews' data, login tokens or wallet
  controls to the model. Supply no game-writing tools. Render model text as text, not executable HTML.
- Keep model selection configurable and verify supported models with the registered integration.
  Bound input size, output size, request duration and per-account request rate. Do not persist chat
  histories by default. Publish accurate privacy and usage copy before enabling.

## Acceptance evidence

- OAuth: invalid state/nonce/signature/audience/issuer, expired and reused callbacks, account-link
  confirmation, disconnect and concurrent requests; valid flow through a test registered client.
- Context: another crew, unearned clue and reveal requests cannot expand the server-side allowlist;
  prompt injection cannot request secret files or change game state. Tests contain no new public
  solution content. Hint replies cite earned card IDs or public help sections where applicable.
- UI: keyboard/phone access, safe plain-text output, cancellation, unavailable provider, declined
  consent, expired identity and exhausted usage. No automatic repeated paid calls.
- Live: consented ChatGPT account connects and receives a bounded hint; disconnected play still works.
  No production activation until this passes.

## External prerequisite

The website flow is offered to selected partners in a limited trial. OpenAI must issue the application
client and register exact callback URLs; eligible plan usage also requires approval. No registration
or credentials are available in this task yet. Prepare implementation after G9 without enabling it.

Official references checked on 6 Nov 2026:

- [Quickstart](https://developers.openai.com/siwc/quickstart)
- [Website OAuth](https://developers.openai.com/siwc/website)
- [Request a client ID](https://developers.openai.com/siwc/request-client-id)
- [Interest form](https://openai.com/form/sign-in-with-chatgpt-interest/)

## Prepared earned-context foundation · 6 Nov 2026

`backend/server/companion_context.py` now prepares evidence without connecting a provider or
changing game state. Its internal `earned_hint_context` function takes validated server case
content, a current server-owned `CaseSnapshot`, the verified `Player` and server case seconds.
It checks seated membership and an opened case before using the real pure case view. Never
construct these arguments from a helper request body or use client-supplied case context.

The result contains only earned cards (`id`, `title`, `text`), completed deductions (`id`,
`name`, `finding`) and citation IDs derived from those included rows. Other fields, including
reveal text even for a solved crew, names, identities, money, leads and future search options,
are omitted. It refuses malformed or oversized required fields, ambiguous membership and
future deduction records. Limits are 16 cards, eight deduction rows, 64-byte IDs, 256-byte
titles/names, 2,048-byte evidence text and a 16,384-byte compact UTF-8 JSON context. It never
truncates evidence silently. Public-help selection remains a later integration step.

This function does not call `CaseService.read` or `opened_snapshot`, whose ordinary read can
initialize a case and grant starting cards. A future endpoint must first get a fresh snapshot
using its verified player, then pass that snapshot to this pure function. It must not accept
snapshots from the browser or reuse another session's context. Context strings are data, not
model instructions; this filter alone does not prove a future model's answers are spoiler-safe.
OAuth, consent, prompt/output handling, rate limits and live inference remain unimplemented;
`companion_llm` stays off. See [implementation evidence](../docs/handoff/ai-earned-context.md).

Current official docs also distinguish local/open-source tool registration from a remotely hosted
website. Local dynamic registration is not a substitute for this game's approved hosted client.
Eligible plan usage is a separate authorization from identity login. The current preview requires
streaming with `store:false` and array input; future code must verify the approved contract rather
than assume parameters such as `max_output_tokens` are supported:

- [Plan-usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
