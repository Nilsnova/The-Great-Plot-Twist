# Authenticated controller and retained-session checkpoint

This bounded MP-ECO-20 contribution verifies actual local provider identities,
controller fencing and a normal first-wave reconnect. It adds a reproducible
scenario and qualified evidence for [#505](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/505).
It does not close the complete authenticated acceptance matrix.

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.

The final scenario passed from 2026-11-19T15:38:50.353Z to 2026-11-19T15:41:00.348Z on test source
`051d6b0544b7b48ea5b3efdd2bf39181b7e4864e`. Scenario SHA-256: `8ee117bf1c04c058989684c41eb94fa0ba9999ea8ce003c2d12909e5318054e7`.

## Scope and trust boundary

[The scenario](../frontend/scripts/check-economy-sessions-provider.mjs) uses the
generic MP-ECO-20 local provider clients and independent read-only database observer.
Auth, REST, PostgreSQL and the application token verifier are real. It creates two
registered identities and an ordinary game through the front door. Fresh service-only
admission is explicit setup, using the configured 200-coin grant. The invited member's
own second game is created through authenticated HTTP and separately admitted.

The scenario supplies no fixture wave outcome, elapsed clock, HP, position, fall or
cooldown. Keyboard movement and the rendered ordinary bell drive a normal wave 1.
An explicit application disconnect, browser offline period and reload exercise the
existing real grace interval. New input and Captain-report requests are temporarily
aborted during the post-reconnect observation, so an independent read can compare
the retained accepted facts before further gameplay writes. No successful response,
combat result or database row is fabricated by that transport partition.

## Required observations

| Boundary | Checked result |
|---|---|
| Current controller | A fresh session read with the actual proof grants control; the same authenticated actor's proof-free read returns a spectator with no session UUID or generation. |
| Duplicate session | An independent session UUID cannot attach while the actor's lease is occupied; authenticated HTTP returns `409/controller_held`. |
| Cross-island control | A second admitted island cannot acquire that actor's occupied global lease; it also returns `409/controller_held`. |
| Browser clone | A real popup clones session storage/Auth, settles into a non-controlling phase and exposes no proof while a fresh read still confirms the original tab's control. |
| Retained reconnect | A disconnect leaves the frozen fighter in unexpired real grace. Reload uses the same session UUID with a greater connection generation and retains the participant token, accepted HP/fall/pose/cooldowns, journal frontier and revival basis. The obsolete proof is refused. |
| Explicit departure | The current controller's accepted leave withdraws its fighter immediately. Both separate island balances remain 200 with zero holds, and balances match their immutable ledgers. |

The [safe result](../docs/evidence/MP-ECO-20-sessions/result.json) records the exact
scenario and helper hashes, source commit, times, observed facts and limitations.
The production baseline is `82abc298570ce5436c721a992f538c16d04c30e5`.
The driver refuses a candidate with changed frontend/server production code,
catalogue or migration source relative to that baseline. A different candidate
requires fresh source qualification; this checkpoint is not silently relabeled.

## Reproduction

After the generic local provider stack is ready, from `frontend/`:

```sh
NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
  node scripts/check-economy-sessions-provider.mjs \
  --runtime /path/to/private-local-runtime.json \
  --output /path/to/new-private-evidence-directory
```

The runtime file stays outside the repository. `MP_ECO_AUTH_HELPERS` and
`MP_ECO_OBSERVER_HELPERS` may select the same generic helper interfaces from a
separate local checkout; their content hashes are recorded. The generic helpers
restrict operations to the generated loopback provider. No hosted database,
deployment, migration, conversion or activation is performed.

The evidence is deliberately narrow. A naturally fallen Captain, a nonempty
cooldown, grace expiry, all-browser-gone closure, realistic latency and the full
authenticated scenario matrix need their own observations. Retaining a healthy
standing Captain is not evidence for those cases. This task changes no runtime
permission, session, financial or gameplay rule.
