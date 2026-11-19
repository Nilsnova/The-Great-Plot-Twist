"""Replay measured funded play through real disposable domain transactions.

Used by MP-ECO-19 reviewers. No credentials or configured database are read. Local Auth/Realtime
schema stand-ins support the real migration chain; there is no authority-provider fixture.
Combat runs headlessly; countdown/minimum wait are zero in this explicitly bounded experiment.
"""

import argparse
import asyncio
import json
import tempfile
from collections.abc import Coroutine
from dataclasses import replace
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from server.island import (
    construction_store,
    personal_captain_store,
    shared_session_api,
    shared_wave_template,
)
from server.island.catalogue import IslandCatalogue, load_island, runtime_catalogue
from server.island.construction_rules import ConstructionIntent
from server.island.shared_session_models import SessionAttach, SessionSettings
from server.island.treasury_models import EconomyContext
from server.island.wave_rules import ALWAYS_ON
from tools.economy.funded_play import (
    ROOT,
    Campaign,
    Combat,
    buy_queue,
    profiles_for,
    source_inventory,
)
from tools.economy.island_balance_plans import building_plan


class SQLAdmin:
    """Execute actual production adapter RPCs, with the service role and a commit per call."""

    def __init__(self, connection: Any) -> None:
        self.connection = connection

    async def call_function(self, name: str, arguments: dict) -> dict:
        from psycopg import sql
        from psycopg.types.json import Jsonb

        self.connection.execute("set local role service_role")
        query = sql.SQL("select public.{}({})").format(sql.Identifier(name), sql.SQL(",").join(
            sql.SQL("{} => %s").format(sql.Identifier(key)) for key in arguments))
        values = [Jsonb(value) if isinstance(value, dict) or
                  isinstance(value, list) and key != "p_rules" else
                  Decimal(str(value)) if isinstance(value, float) else value
                  for key, value in arguments.items()]
        result = self.connection.execute(query, values).fetchone()[0]
        self.connection.commit()
        return result

    async def select_rows(self, table: str, query: dict) -> list[dict]:
        if table != "island_recovery_state" or query["select"] != "revision":
            raise ValueError("The headless runner permits only the documented recovery read.")
        self.connection.execute("set local role service_role")
        row = self.connection.execute(
            "select revision from public.island_recovery_state where island_owner=%s",
            (query["island_owner"][3:],),
        ).fetchone()
        self.connection.commit()
        return [{"revision": row[0]}] if row else []


class DomainCampaign:
    """Fresh grant, actual target purchases, earned personal state and native wave closure."""

    def __init__(self, connection: Any, catalogue: IslandCatalogue, count: int,
                 policy: str, priority: str) -> None:
        self.db, self.admin, self.catalogue = connection, SQLAdmin(connection), catalogue
        self.actors = [uuid4() for _ in range(count)]
        self.owner, self.policy = self.actors[0], policy
        self.game = Campaign(catalogue.starting_coins)
        self.queue = building_plan(priority == "income")
        self.sessions = {actor: uuid4() for actor in self.actors}
        self.generations = {actor: "0" for actor in self.actors}
        connection.execute("reset role")
        for actor in self.actors:
            connection.execute("insert into auth.users(id) values(%s)", (actor,))
        connection.commit()
        # Only the explicitly local test owner receives a fresh service-side island admission.
        self.code = "".join("ABCDEFGHJKMNPQRSTUVWXYZ23456789"[n % 29]
                            for n in uuid4().bytes[:5])
        self.rpc("island_open", self.owner, self.code, 100)
        for actor in self.actors[1:]:
            self.rpc("game_join", actor, self.owner, 10)
        admitted = self.rpc("island_treasury_admit", self.owner, self.owner,
                            uuid4().hex, catalogue.starting_coins)
        envelope = admitted["currentEconomy"]
        self.account, self.epoch = envelope["accountId"], envelope["runEpoch"]
        self.context = EconomyContext("island_shared", 1, str(self.owner), str(self.owner),
                                      self.account, self.epoch, 1)
        self.intent = {"mode": "island_shared", "version": 1,
                       "islandOwner": str(self.owner), "runEpoch": self.epoch}
        self.attach_controls()
        self.wallets = self.private_wallets()

    def attach_controls(self) -> None:
        for actor in self.actors:
            body = SessionAttach(economy=self.intent, sessionId=self.sessions[actor],
                expectedGeneration=self.generations[actor], actionUid=uuid4().hex)
            result = self.run(shared_session_api.session_call(
                self.admin, str(actor), "attach", body, self.catalogue))
            self.generations[actor] = result["session"]["connectionGeneration"]
        settings = SessionSettings(economy=self.intent, sessionId=self.sessions[self.owner],
            connectionGeneration=self.generations[self.owner], actionUid=uuid4().hex,
            countdownSeconds=0)
        self.run(shared_session_api.session_call(self.admin, str(self.owner), "settings", settings))

    @staticmethod
    def run(coroutine: Coroutine[Any, Any, Any]) -> Any:
        return asyncio.run(coroutine)

    def rpc(self, name: str, *arguments: Any) -> Any:
        from psycopg import sql
        from psycopg.types.json import Jsonb

        self.db.execute("set local role service_role")
        statement = sql.SQL("select public.{}({})").format(sql.Identifier(name),
            sql.SQL(",").join(sql.Placeholder() for _ in arguments))
        answer = self.db.execute(statement, [Jsonb(v) if isinstance(v, dict) else v
                                            for v in arguments]).fetchone()[0]
        self.db.commit()
        if isinstance(answer, dict) and answer.get("status") == "refused":
            raise ValueError((name, answer))
        return answer

    def read(self, statement: str, arguments: tuple[Any, ...] = ()) -> list[tuple]:
        self.db.execute("reset role")
        rows = self.db.execute(statement, arguments).fetchall()
        self.db.commit()
        return rows


    def private_wallets(self) -> list[tuple]:
        """Counts catch a hidden debit/refund even when a final wallet balance agrees."""
        return self.read("select w.player_id,w.balance,"
            "(select count(*) from public.wallet_transactions t where t.player_id=w.player_id),"
            "coalesce((select sum(t.delta) from public.wallet_transactions t "
            "where t.player_id=w.player_id),0) from public.wallets w order by w.player_id")

    def profile_choices(self) -> list[dict]:
        desired = []
        for index, actor in enumerate(self.actors):
            current = self.run(personal_captain_store.read_optional(self.admin, str(actor)))
            wanted = profiles_for(self.catalogue, len(self.actors), self.policy,
                                  current["captain"]["personalBestWave"])[index]
            desired.append(wanted)
            if "gunner" in wanted["skills"] and current["captain"]["role"] != "gunner":
                changed = self.run(personal_captain_store.change(
                    self.admin, str(actor), uuid4().hex, "role", "gunner",
                    expected_revision=current["captain"]["revision"]))
                current = changed["profile"]
            for skill in wanted["skills"]:
                if skill != "gunner" and skill not in current["skills"]["known"]:
                    changed = self.run(personal_captain_store.change(self.admin, str(actor),
                        uuid4().hex, "learn", skill,
                        expected_revision=current["captain"]["revision"]))
                    current = changed["profile"]
        return desired

    def purchases(self) -> tuple[list[dict], dict | None]:
        purchased, blocked = buy_queue(self.catalogue, self.game, self.queue)
        for item in purchased:
            rows = self.read("select recovery_instance_id,level from public.islet_buildings "
                             "where player_id=%s and plot=%s", (self.owner, item["plot"]))
            instance, level = rows[0] if rows else (None, 0)
            body = ConstructionIntent(action="build" if not level else "upgrade",
                spot=item["plot"], kind=item["kind"], instanceId=instance,
                expectedLevel=level, quotedCoins=str(item["paidCoins"]))
            result = self.run(construction_store.construct(self.admin, self.context,
                                                           uuid4().hex, body, self.catalogue))
            assert result["receipt"]["result"]["chargedCoins"] == str(item["paidCoins"])
        return purchased, blocked

    def attempt(self, combat: Combat, seed: int) -> dict:
        bought, blocked = self.purchases()
        desired = self.profile_choices()
        for actor in self.actors:
            self.rpc("shared_session_heartbeat", actor, self.owner, UUID(self.epoch),
                     self.sessions[actor], int(self.generations[actor]))
        weather = next(row for row in self.catalogue.weather if row.kind == "calm")
        template, basis = self.run(shared_wave_template.prepare_shared_wave(
            self.admin, self.catalogue, str(self.owner), str(self.owner), weather, seed,
            [*ALWAYS_ON, "structure_recovery"]))
        started = self.run(shared_session_api.start_wave(self.admin, self.catalogue, weather,
            str(self.owner), str(self.owner), self.epoch, str(self.sessions[self.owner]),
            self.generations[self.owner],
            uuid4().hex, rules=[*ALWAYS_ON, "structure_recovery"], snapshot_template=template,
            reward_basis=basis))
        wave = UUID(started["waveId"])
        slots = self.read("select player_id,participant_token,frozen_captain from "
                          "public.shared_session_slots where wave_id=%s", (wave,))
        facts = {actor: (token, frozen) for actor, token, frozen in slots}
        profiles = []
        for actor, wanted in zip(self.actors, desired, strict=True):
            token, frozen = facts[actor]
            assert frozen["level"] == wanted["level"]
            assert set(frozen["skills"]) == set(wanted["skills"])
            profiles.append({**wanted, "id": str(token)})
            self.rpc("shared_session_heartbeat", actor, self.owner, UUID(self.epoch),
                     self.sessions[actor], int(self.generations[actor]))
        options = {**started["initialSnapshot"]["createWave"], "wave": started["wave"],
                   "seed": seed, "waveProtocol": 2, "recoveryVersion": 1}
        result = combat.play(options, profiles)
        report = {"survived": result["survived"], "shipsSunk": result["shipsSunk"],
                  "bonuses": result.get("bonuses"), "rescued": result.get("rescued", False)}
        completion = self.run(shared_session_api.finish_wave(self.admin, self.catalogue,
            str(self.owner), wave, str(self.owner), self.epoch, str(self.sessions[self.owner]),
            self.generations[self.owner], report))
        assert completion["outcome"] == ("won" if result["survived"] else "lost")
        played, before, previous_best = self.game.next_wave, self.game.coins, self.game.best
        reward = basis.reward_coins(result.get("bonuses", [])) if result["survived"] else 0
        self.game.change(reward, "pirate_loot" if reward else "normal_defeat", playedWave=played)
        actual_best, next_wave = self.read(
            "select wave_best,next_wave from public.islands where player_id=%s", (self.owner,))[0]
        self.game.best, self.game.next_wave = actual_best, next_wave
        self.game.seconds += result["time"]
        balance, held = self.read("select balance_coins,committed_coins from "
            "public.island_economy_accounts where id=%s", (self.account,))[0]
        assert (int(balance), int(held)) == (self.game.coins, 0)
        assert self.wallets == self.private_wallets()
        tokens = {profile["id"]: f"captain_{index}" for index, profile in enumerate(profiles)}
        result["captains"] = [{**row, "id": tokens[row["id"]]} for row in result["captains"]]
        return {"playedWave": played, "bestBefore": previous_best, "seed": seed,
                "frozenProfiles": desired,
                "purchases": bought, "blockedOffer": blocked, "openingCoins": before,
                "lootCoins": reward, "closingCoins": int(balance), "result": result,
                "nativeOutcome": completion["outcome"], "nextWave": next_wave}

    def measure(self, combat: Combat, seed: int, attempts: int, target: int) -> dict:
        rows, stalled = [], 0
        for index in range(attempts):
            row = self.attempt(combat, seed + index * 7919)
            rows.append(row)
            stalled = stalled + 1 if self.game.best == row["bestBefore"] else 0
            if self.game.best >= target or stalled >= 6:
                break
        balance, deltas, entries = self.read("select a.balance_coins,sum(t.balance_delta),"
            "count(t.id) from public.island_economy_accounts a join "
            "public.island_treasury_transactions t on t.account_id=a.id "
            "where a.id=%s group by a.id", (self.account,))[0]
        assert balance == deltas
        return {"captains": len(self.actors), "policy": self.policy,
                "bestWave": self.game.best, "closingCoins": int(balance),
                "simSeconds": round(self.game.seconds, 2), "treasuryEntries": entries,
                "ledgerReconciles": True, "personalWalletsUnchanged": True,
                "personalWalletLedgersUnchanged": True, "attempts": rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--captains", type=int, default=2)
    parser.add_argument("--policy", choices=("novice", "mixed", "veteran"), default="mixed")
    parser.add_argument("--priority", choices=("defense", "income"), default="defense")
    parser.add_argument("--attempts", type=int, default=45)
    parser.add_argument("--target", type=int, default=40)
    parser.add_argument("--seed", type=int, default=7919)
    parser.add_argument("--choices", action="store_true",
                        help="Measure research/refunds and real five-minute fixture-price wagers")
    args = parser.parse_args()
    import pgserver
    import psycopg

    catalogue = runtime_catalogue(load_island())
    current_timing = {"countdownSeconds": catalogue.waves.countdown_seconds,
                      "minimumSeconds": catalogue.waves.minimum_seconds}
    catalogue = replace(catalogue, waves=replace(catalogue.waves,
                        minimum_seconds=0, countdown_seconds=0))
    sources = source_inventory()
    combat = Combat()
    try:
        with tempfile.TemporaryDirectory(prefix="funded-economy-") as directory:
            with pgserver.get_server(Path(directory) / "data", cleanup_mode="delete") as server:
                assert psycopg.conninfo.conninfo_to_dict(server.get_uri())["host"].startswith("/")
                with psycopg.connect(server.get_uri(), autocommit=True) as db:
                    db.execute((ROOT / "backend/server/tests/case_sql/stub.sql").read_text())
                    migrations = sorted((ROOT / "supabase/migrations").glob("*.sql"))
                    for migration in migrations:
                        db.execute(migration.read_text())
                with psycopg.connect(server.get_uri()) as db:
                    measured = DomainCampaign(db, catalogue, args.captains,
                                              args.policy, args.priority)
                    report = measured.measure(combat, args.seed, args.attempts, args.target)
                    if args.choices:
                        from tools.economy.funded_choices import measure_choices
                        report["choices"] = measure_choices(measured, combat)
        assert sources == source_inventory(), "Source files changed during the measured run."
        print(json.dumps({"evidenceLayer": "production_simulation_plus_disposable_domain_sql",
            "migrations": len(migrations), "countdownSeconds": 0, "minimumFinishSeconds": 0,
            "productionTimingBeforeExplicitHeadlessOverride": current_timing,
            "sources": sources,
            "limits": ["Local Auth/Realtime schema stand-ins; no provider/browser authentication",
                       "Actual persistent authority, quote/CAS, bell, earned profiles, finish RPCs",
                       "Headless results; no journal/checkpoint validation or network latency",
                       "No natural wager/ship provider, human or physical-device acceptance"],
            "campaign": report}, indent=2, sort_keys=True))
    finally:
        combat.close()


if __name__ == "__main__":
    main()
