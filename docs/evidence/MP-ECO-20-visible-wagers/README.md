# Visible shared wager controls and retired-run settlement

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.

Two actual registered players use independent rendered Chromium browsers, genuine
provider SDK session restoration, the production API verifier and committed
PostgreSQL accounting. Native amount/side/All in controls submit the stakes;
physical pointer clicks submit their confirmations and the owner's reset form.
The [summary](summary.json) and compressed reports retain exact receipts, loaded
helper hashes, served sources, timestamps and verification boundaries.

## Actual observations

| Stage | Observed result |
|---|---|
| Original visible openings | Member 1 up, owner a separate 1 down on the same event, then member All in for the remaining 198. Both rendered cards show available 0 / held 200. |
| Normal reload and permissions | Actual SDK identity and the pending shared bank survive ordinary member reload. The member Settings view has the owner-only explanation and no reset-code input. |
| First settlement | The source-age guard initially defers settlement. After the real durable retry, normal CRON HTTP commits 2 / 0 / 396; both rendered cards show 398 / 0. |
| Reinvestment | The owner's native All in and confirmation submit the entire 398 return. Both cards show 0 / 398. |
| Visible owner reset | The owner enters the actual island code in Settings and submits its normal reset form. The warning explains retired-run payouts. Both current HUDs show the replacement 200 / 0; the member adopts the new epoch automatically. |
| Second settlement | Normal CRON HTTP after actual maturity pays 796 exclusively to the retired original account. The replacement remains 200 with one grant, and both current HUDs remain 200 / 0. |
| Match board | A separate real registered owner opens the native Match board. Actual football GET returns 200 with no available choices; the rendered card explains the unavailable events and offers no stake confirmation. Shared treasury, wager count and private wallet history stay exactly unchanged. |

Every stored market maturity is exactly **300 seconds** after opening. The
[committed observations](observed-quotes.json) retain opening/closing quote source,
actual fetched timestamps, settlement times and the four completed queue rows.
All settlements occur after maturity with closing evidence fetched after maturity.
The normal board accepts cached prices for 60 seconds; SQL also requires evidence
fetched after maturity. The first scheduler observation therefore legitimately
records a five-minute retry. The final observation follows the real cache window.
No clock, retry timestamp, financial history, quote cache or outcome was edited.

Private-wallet accounting starts at the original first rendered shared-bank
observation. There are zero private ledger entries from that point through final
payout. Pre-render API setup had separate zero personal balances; ordinary game
entry initialized the existing legacy personal wallets before this boundary.
That initialization is recorded separately from wagering and reset effects.

## Staged execution and retained failures

The original opening run passed two assertion groups, then failed when a delayed
native unlock card covered Settings. Its [complete report](opening-report.json.gz)
remains failed. A later observation [also remains failed](deferred-observation-report.json.gz):
it expected an immediate payout after a successful scheduler HTTP response, while
the authoritative queue still correctly held the pending funds.

The [final continuation](continuation-report.json.gz) restores the same genuine
identities and adopts the exact three original receipts without opening them
again. It passes six groups, including actual payout, visible reinvestment/reset
and retired-account isolation. The browsers genuinely close and restore between
these stages; this is a staged browser observation. Earlier unsuccessful Auth,
asynchronous readiness and tutorial setup attempts are retained in
[setup failures](setup-failures.json.gz), with no accepted stakes in those attempts.
The failed observations are not relabeled as successful full runs.

## Sources and local fixtures

Protected production candidate:
`64ee02b360d68836b2de9247121ab47dc6a3ecbf`.
The API, frontend source, migrations and dependencies compare identically to that
candidate before and after. Loaded driver/helper/factory hashes are unchanged
within each reported interval. The final continuation starts at `db627d2e` and
ends with HEAD metadata at `45a89e54`; that sole intervening commit adds the
separate, unimported Match scenario. The continuation's loaded files and all
protected production bytes remain identical.

Side API 58006 uses the existing supported quote-transport fixture: real Auth,
financial handlers, calendars and UTC clocks, with declared increasing Binance
prices. Its own manifest identifies the actual process and factory bytes.
Side frontend 55106 has a private Vite cache and proxies its real API traffic to
that instance. Its wrapper/config/lock hashes and actual serving process are
recorded separately from the primary provider manifests. Primary manifests attest
the primary endpoints only.

The isolated provider gateway's CORS header allows the primary frontend origin.
The side frontend therefore supplies a transparent same-origin `/provider` proxy
for initial SDK session restoration, using the real provider and trusted TLS.
Product Auth configuration retains its original valid HTTPS provider root.
JWT issuer, verified identities and response payloads remain real. The proxy
supports exact prefix rewriting and WebSocket forwarding; this observation does
not imply every product transport used that proxy.

Initial saved record 4 and one normal 200-coin admission grant enable the market
case. The separate Match case uses saved record 7 before its own normal admission.
These are explicit eligibility fixtures, not earned victories or conversion.
The Match proof uses the genuinely unavailable configured football source and
claims no accepted football stake or natural result. This package supplies bounded
browser bridges to the existing API/SQL evidence; it does not claim the complete
#505 matrix, public activation or rollout.

## Reproduction and focused checks

Use the documented isolated provider with a full source-matched candidate first.
Start the existing `tools.authenticated_economy.wager_http_fixture` on its separate
58006 instance and private directory. From the repository root:

```sh
export NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt
node frontend/scripts/authenticated-economy/serve-visible-wagers.mjs \
  /tmp/mp505-provider/runtime.json /tmp/visible-wagers
node frontend/scripts/authenticated-economy/prepare-visible-wagers.mjs /tmp/visible-wagers
node frontend/scripts/authenticated-economy/visible-wagers.mjs \
  /tmp/visible-wagers /tmp/visible-wagers-result
node frontend/scripts/authenticated-economy/visible-match-unavailable.mjs \
  /tmp/visible-wagers /tmp/visible-match-result
```

Keep `NODE_EXTRA_CA_CERTS` set for every Node command that contacts the actual
TLS provider. The setup writes real credentials exclusively to its private
external file. An optional final driver argument adopts a prior source-fenced
opening report while that same epoch remains current, as in the recorded staged
continuation. The reports preserve both source intervals independently.

The actual staged browser groups, Match case, four committed quote/maturity reads
and loaded-source fences passed. Node syntax, relative documentation links,
credential-content and diff checks accompany this package. Broad application
suites and a production build were not repeated for these test/evidence additions.

Selected screenshots: [all funds held](member-all-funds-held.png),
[first payout](owner-first-settlement.png), [member reset view](member-reset-owner-only.png),
[entire return reinvested](owner-all-proceeds-reinvested.png),
[owner reset confirmation](owner-reset-confirmation.png),
[owner final bank](owner-bank-after-retired-payout.png),
[member final bank](member-bank-after-retired-payout.png) and
[unavailable Match board](native-match-unavailable.png).

The [Match report](match-unavailable.json.gz) preserves its own loaded-helper and
protected-source comparisons. The enclosing wager interval also checks the
unchanged side frontend config/lock hashes before and after that shorter case.
