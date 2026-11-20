# CW2: current-main carried-bomb acceptance

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
This contribution addresses [#459](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/459)
on the isolated actual application at main
`64ee02b360d68836b2de9247121ab47dc6a3ecbf`. It makes no hosted-release claim.

The final provider scenario passed from `2026-11-19T17:57:54.349Z` to
`2026-11-19T17:59:10.397Z` on driver `258b35d1f6ea4d64816946dd81b9d1f3833a1f53`.
Scenario SHA-256: `22f9505d8db4e8a4d9b5b1e8316c36f025f10239a7d37adfc8b5b8a988d5b188`.
[Safe evidence](../docs/evidence/CW2-current-main-bombs/README.md) preserves the
source/helper qualification and the actual observation counts.

## Exact path under test

[The scenario](../frontend/scripts/check-current-main-bombs-provider.mjs) uses two
real registered provider identities and independently rendered Chromium processes.
The defended island remains `personal_legacy`; its actual attempt uses recovery
version 1 and protocol 2. Actual HTTP input bodies without a shared-session proof
therefore select `wave_recovery.append_inputs`, which passes the enabled arsenal
flag to `recovery_wave_inputs(uuid,uuid,jsonb,boolean)`. This is the original fix
whose server-attached carried weapon is being verified.

The native shared-session input producer is different and is not counted as
evidence for that four-argument legacy path. This task does not replace or retire
fire bombs or alter saved weapon identities, statistics or history.

## Setup and observations

An extra 5000-coin wallet budget and saved wave-10 unlock with an ordinary
wave-1 repeat are explicit disposable fixtures, not natural earnings or progress.
Fire bombs are then purchased through the real arsenal API. No HP, clock, outcome
or journal is edited to keep the normal attempt running.

The actual game starts and joins through its normal authenticated API/client
flows. The scenario waits for a naturally spawned target, then queues ordinary
move and aimed-shot intents in the production input transport. It supplies no
weapon or authoritative Captain statistics. A passive observer copies returned
SIM events while forwarding the unchanged `step` result. The supported
`autoBlade=false` browser-check control disables automatic melee on both Captains
to isolate aimed bomb events; this setup is distinct from the passive observer.

Both real clients must observe an area blast that hits. The actual sealed HTTP
journal must contain exactly one shot with server-attached `fire_bombs`. Both
pages replay that accepted prefix using the production SIM and replay driver;
an identical journal page added twice must still produce one throw and blast.
After a real browser transport outage and reconnection, the normal event poll
must succeed, the running game must retain its exact wave and participant token,
and observed throw/blast/damage counts must remain unchanged. The same accepted
prefix must also reconstruct the same damage without duplication. Tutorial overlays are dismissed through their
actual visible controls, rather than fabricated readiness or a forced click.

## Reproduction and limits

After the generic local provider harness is ready, from `frontend/`:

```sh
NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
  node scripts/check-current-main-bombs-provider.mjs \
  --runtime /path/to/private-local-runtime.json \
  --output /path/to/new-private-evidence-directory
```

`MP_ECO_AUTH_HELPERS` can select the same generic helper package from another
local checkout. Working-tree/untracked production source, actual serving source
and helper hashes are checked. Credentials, raw authenticated bodies, actor IDs,
invite codes and uncropped screenshots remain private. This is local current-main
acceptance; it does not establish a deployed build, physical devices, a full
document reload, every native shared-session UI path or pixel-level animation
counts. Earlier full-reload attempts could outlast the natural defeat of the
idle Captains; they are not counted as passing reconnect observations.

The existing `playtest-1117` suite was also run against source-equivalent current
main: 18 tests passed in 6.13 seconds. Those deterministic unit fixtures cover
throw prediction, journal weapon transport, area simulation and replay deduplication;
they are distinct from the actual-provider observations.

The successful provider run observed one shot, one area blast and two damage
events of 9 each. A resumed actual event poll, same running wave/participant and
unchanged live counts prove the bounded transport-reconnect observation. Seven
helper fingerprints and actual serving-source guards matched before/after.
A separate read-only review found no demonstrated material concern. Syntax,
relative documentation links and scoped whitespace checks passed. No full build
or application suite was repeated for this test/evidence contribution.
