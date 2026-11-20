# Supported legacy protocol-one provider acceptance

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`). This bounded #505
follow-up verifies the explicit `wave-protocol-1` acceptance row on production
baseline `64ee02b360d68836b2de9247121ab47dc6a3ecbf`.

Use the actual production application and real local provider behind a separate
loopback API with recovery admission disabled as declared compatibility setup.
Fresh legacy islands may use their supported protocol; admitted shared islands
must still refuse protocol one and never fall back to personal payouts. Do not
rewrite saved recovery state, fabricate simulation outcomes or shorten provider
clocks to create a pass.

The [retained evidence](../docs/evidence/MP-ECO-20-protocol-one/README.md) records
passed actual Auth, same-UID/different-UID bell races, real-time natural production
combat, canonical finish and exact-once 35-coin payout/retry, followed by shared
admission refusal without personal effects. Two current-source disposable SQL
expiry cases passed separately with their existing explicit timestamp fixtures.
Actual 900-second provider expiry and rendered play are not claimed.

No production source, migration, economic rule, deployment or activation changes.
