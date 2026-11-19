# MP ECO 22 Visible idle economy and lifecycle acceptance

- Issue: [#505](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/505), under [#492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
- Scope: a bounded actual-provider browser bridge for idle economy and lifecycle controls. No product, schema or shared helper changes.

## Candidate and setup

The driver is `frontend/scripts/check-economy-idle-browser-provider.mjs`. It uses the existing authenticated-provider helper package and an independently validated local runtime manifest. Two real registered GoTrue users enter the actual production frontend and API with independent Chromium processes. Protected production sources and dependency manifests must match candidate `64ee02b360d68836b2de9247121ab47dc6a3ecbf`, including clean working files and no untracked production additions. Actual API/frontend serving-source records and the imported JavaScript/Python helper closure are captured before and after execution.

Fresh service-only island admission provides 5000 test coins. Saved island unlock50 and a pre-existing earned-profile eligibility fixture enable research, arsenal and Engineer controls. These are explicit disposable setup, not naturally earned progression, conversion, combat or starting-balance acceptance. No responses, journal, HP, outcome or clock are fabricated.

## Acceptance boundaries

| Row | Intended observation | Layer |
| --- | --- | --- |
| Shared bank | Both clients display the same available and committed treasury values. | Visible HUD |
| Personal Engineer | Free role selection, exact discounted purchase and pending commitment disable the next role change. | Visible Captain/build cards and actual personal read |
| Member build | Displayed shared quote commits the exact charge and structure once. | Visible card and normal HTTP mutation |
| Retry and old client | Exact request replays without another debit; changed intent and missing capability fail closed. | Authenticated fetch originating in the browser, explicitly not additional UI clicks |
| Research reversal | An invited member buys tier1, chooses tier2 and pays for its alternative choice. | Visible research tree |
| Demolition | An invited member confirms the actual quoted teardown and refunds the shared treasury. | Visible confirmation |
| Arsenal | An invited member buys a shared copy and returns it to stored stock. | Visible arsenal controls and normal inventory read |
| Reset permission | Member Settings show owner-only access; owner confirmation names the retired cash/wager boundary. | Visible Settings |
| Reset effects | A normal peer product refresh adopts the new epoch/bank, clears old selection/research/stock and preserves personal Captain state. | Visible UI, real HTTP and independent PostgreSQL |
| Account/island deletion | First account confirmation refuses without owned-island consent; the explicit second confirmation deletes the owner account/island. A normal peer refresh clears the missing island and its stale bank. | Visible Settings/account dialog, real HTTP and independent PostgreSQL |

This package does not claim immediate push delivery for lifecycle refresh, arbitrary last-funds cross-domain races, every arsenal tenure/capacity case, frozen combat loadout, generation consumption, fallen/nonempty-cooldown reconnect, natural victories, wagering UI, the whole #505 matrix, hosted deployment or release activation. Existing API/SQL packages remain separately source-qualified evidence for those rows. A failure is retained and reported rather than converted into a passing broader claim.

## Reproduction

From the repository root, with an existing isolated actual-provider runtime and installed Chromium:

```sh
NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
node frontend/scripts/check-economy-idle-browser-provider.mjs \
  --runtime /path/to/private-local-runtime.json \
  --output /tmp/new-idle-browser-evidence
```

The output directory must be new. It contains private screenshots/diagnostics and source-qualified facts. Never commit runtime credentials, access tokens, raw account identifiers or invite codes. `MP_ECO_AUTH_HELPERS` and `MP_ECO_OBSERVER_HELPERS` may select an explicit frozen helper checkout; the exact imported files are hashed in the result.
