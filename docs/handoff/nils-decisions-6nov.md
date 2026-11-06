# Nils' decisions of Fri 6 Nov 2026 (for the merges and builds that follow)

Nils answered "Yes, all as recommended" in chat. Each item below is DECIDED, no longer pending.
Replace every "PENDING" marker, "waits for Nils" note and "pending" decision status for these items
with the decision, keeping the history (for example: "decided by Nils on 6 Nov 2026").

1. C4, the case clock: case time runs from the muster (crews.started_at); no pause in v1.
2. C6, partner pin coins: the 50 coins are paid when the order is accepted.
3. C9, solves while the relight lock is on: they never reach the world (no stage change, no Wall names,
   no extra light, also after the lock opens); rewards and the reveal happen as normal.
4. C16, Wall of Lights names: contributors only (the players with a share).
5. C18, position and boarding: presentation only; the server checks no positions.
6. N4 (D022, A2's account data): "delete my data" deletes everything, the coin ledger included; a crew
   the player started that others sit in passes to the player in the lowest other seat; Supabase Auth's
   own audit log is not purged (it expires on Supabase's schedule).
7. N6 (D019): the first Act 1 ending counts; playing Act 1 again changes nothing and pays nothing.
8. The Island Exchange (D017): at most 20 open positions per player stays; no extra 300-coin reserve.

Also decided today, earlier: the prediction desk (L5) and Lantern Duels (A7) switch on after group 3 is
merged and checked (the module teacher approved play-money predictions); the default weather place is
Carcavelos (set in Vercel: WEATHER_PLACE_NAME, WEATHER_LATITUDE, WEATHER_LONGITUDE); Finnhub may be used
for the class (STOCK_API_PROVIDER=finnhub and STOCK_API_KEY are set in Vercel production).

9. Codex and the server (Nils, Fri 6 Nov evening): once Claude switches to the orchestrator role, Codex may
   edit backend/ and supabase/ for named tasks under Claude's review. Applying migrations to the live
   database stays with Claude. Until the switch, Codex keeps to the browser side (G9).
