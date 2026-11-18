# Recovery finish checkpoint guard

A first protocol-2 finish before expiry must contain a health vector the existing validator accepts. If a later report is stale or diverges, settlement can use the checkpoint already accepted for that wave. The database reads the checkpoint ID and acceptance time under the existing wave lock. [Issue #415](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/415)

The migration replaces the internal finish function preserved by the reward-recovery migration. The public signature, reward wrapper, role permissions, expiry and saved outcome rules stay the same. A refusal returns the existing validation reason and leaves the participant, wave, health, wallet and progression unchanged.

On main `2e4e27b6`, all six malformed first-report cases could close the wave and award loot in disposable PostgreSQL. The valid first report and the two accepted-prefix cases passed on the same baseline. With the forward migration, all 500 island SQL and recovery HTTP checks passed, including all nine guard cases. Ruff passed.

Run the existing full-chain fixture from `backend/`.

```sh
CASE_PG_SCRATCH=1 uv run --locked --no-env-file --with pgserver==0.1.4 \
  --with 'psycopg[binary]' pytest -q server/tests/island_sql \
  server/tests/test_wave_recovery_routes.py \
  server/tests/test_wave_reward_recovery_routes.py \
  server/tests/test_structure_recovery_routes.py
```

The fixture uses a private Unix socket, applies the migrations twice, rolls back the test cases and deletes the local database. Node is needed for the two HTTP cases that compare replay state across clients. Applying the migration to a deployed database remains a separate release step.
