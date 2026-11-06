# Optional AI hints and help

Used by: the next assistant package after G9; records Nils' request of 6 Nov 2026.

Owner: Nils with Codex. Scope: spoiler-safe hints and help, with official ChatGPT sign-in and eligible
ChatGPT-plan usage. This is additional scope, not a replacement for the core release.

## Delivery

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
