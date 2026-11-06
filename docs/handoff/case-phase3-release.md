# Case Phase 3 release proof · 6 Nov 2026

Used by: Nils and integrating agents; branch integrate/case-relighting, following live Phase 2.

- Added server-only shared world state, once-per-crew solves and contributor-only Wall of Lights.
  The solve transaction relights once when explicitly open, allocates consecutive solve numbers
  and caps later lamps at 12. Locked solves remain excluded forever, including server retries.
- Added flag-gated public GET /api/world without login or query parameters. It returns captain
  names/order and public coast facts only, cached 30 seconds; no culprit, player or crew ids.
- Connected the bulletin and Exchange to the same shared state, preserving injected services.
  The Exchange retains its existing relit fee/listing rules. Unconfigured local copies stay dark.
- Full backend/story with disposable PostgreSQL: **10,309 passed**. Integration explicitly proves
  public coast, bulletin reader and Exchange agree on both stages. Ruff and diff checks pass.
  Frontend source/assets are unchanged; Phase 2's 1,603-test/build/spoiler proof remains applicable.
- Independent code review approved cbde688 plus the integration-test/doc changes; its sole stale
  AlwaysDark assertion was corrected, then the full suite passed. Independent SQL review: **34
  focused checks**, actual migration order, non-superuser ownership, broad defaults, repeated
  applies and real concurrent accusation transactions passed. Replaying 060000 preserves this hook.
- Redacted Gitleaks passed with only the exact existing RFC7636 public test-vector exclusion.
- Applied one file verbatim: **20261106120000_relighting.sql**, name relighting.
  Repository/stored MD5 **255250670ba94f84619bfb75fd1f6439** agree. Tool history version
  20261106192011 was restored to **20261106120000**.
- Final live totals: **30 tables +1 view /16 public policies /5 realtime policies /17 reasons
  /39 project functions excluding rls_auto_enable /8 sequences /6 public triggers**.
- Security advisor: known items only; three additional intentional server-only RLS/no-policy INFO
  notices. [Advisor explanations](https://supabase.com/docs/guides/database/database-linter).
- Live state after apply: **dark, relit_at null, solves 0, extra_lights 0, world_solves 0, Wall 0**.
  RELIGHT_OPEN stays unset and case stays off. No live Relighting, solve or reward proof is claimed.
- Remaining: NPC integration/69-mix proof, followups/hardening, G9 integration after laptop return.
  Full festival/lantern claims, Star/title/epilogue and public-cache HIT verification remain later work.

Phase 2 production baseline: main **c365985**, deployment **dpl_ECNtND9AvU2qe7uGbsMSh1ZvoTBt** READY.
Health/config 200, four approved flags on and case off; case 404 feature_off private/no-store;
GET probes to board/pin and finale/post return 405 Allow: POST with private/no-store.
