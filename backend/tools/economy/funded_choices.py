"""Paid research/refunds and fixture-price wagering on an actually earned scratch island.

Used only by funded_sql --choices. Real five-minute deadlines elapse; prices are explicitly
supplied test fixtures, never natural market observations. No clock or immutable row is edited.
"""

from __future__ import annotations

import sys
import time
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from server.island import construction_store, economy_progression, shared_snapshot
from server.island.construction_rules import ConstructionIntent, refund_for_payments
from server.island.treasury_models import EconomyContext
from tools.economy.funded_play import Campaign
from tools.economy.island_balance_plans import building_plan

if TYPE_CHECKING:
    from tools.economy.funded_play import Combat
    from tools.economy.funded_sql import DomainCampaign


def money(world: DomainCampaign, account: str | None = None) -> dict:
    row = world.read("select a.balance_coins,a.committed_coins,"
        "coalesce(sum(t.balance_delta),0),coalesce(sum(t.committed_delta),0),"
        "a.revision,count(t.id) "
        "from public.island_economy_accounts a left join public.island_treasury_transactions t "
        "on t.account_id=a.id where a.id=%s group by a.id", (account or world.account,))[0]
    assert (row[0], row[1], row[4]) == (row[2], row[3], row[5]), "Origin ledger drifted."
    return {"balance": int(row[0]), "committed": int(row[1]), "available": int(row[0] - row[1])}


def snapshot(world: DomainCampaign) -> dict:
    return world.run(shared_snapshot.read_shared_snapshot(
        world.admin, str(world.owner), str(world.owner), world.catalogue))


def research_changes(world: DomainCampaign) -> list[dict]:
    rows = []
    for tier, change in ((1, False), (2, False), (2, True), (2, True)):
        offers = snapshot(world)["quotes"]["research"]
        offer = next((row for row in offers if row["available"]
            and row["target"]["branch"] == "cannon" and row["target"]["tier"] == tier
            and row["target"]["change"] == change), None)
        if offer is None:
            rows.append({"tier": tier, "change": change, "status": "no_affordable_offer"})
            break
        before, uid = money(world), uuid4().hex
        body = {"action": "research", **offer["intent"]}
        first = world.run(economy_progression.mutate(world.admin, world.catalogue,
            world.context, uid, body))
        again = world.run(economy_progression.mutate(world.admin, world.catalogue,
            world.context, uid, body))
        after = money(world)
        assert again.repeat and first.receipt == again.receipt
        assert before["balance"] - after["balance"] == int(offer["intent"]["quotedCoins"])
        rows.append({"target": offer["target"], "paidCoins": int(offer["intent"]["quotedCoins"]),
                     "before": before, "after": after, "oneEffectOnReplay": True})
    return rows


def demolish_all(world: DomainCampaign) -> list[dict]:
    rows = []
    for spot in list(world.game.buildings):
        offer = next(row for row in snapshot(world)["quotes"]["demolish"]
                     if row["target"] == {"spot": spot})
        assert offer["available"]
        paid, expected = world.game.payments[spot], int(offer["intent"]["quotedCoins"])
        assert expected == refund_for_payments(tuple(paid))
        body = ConstructionIntent(action="demolish", **offer["intent"])
        uid, before = uuid4().hex, money(world)
        first = world.run(construction_store.construct(world.admin, world.context, uid,
                                                       body, world.catalogue))
        again = world.run(construction_store.construct(world.admin, world.context, uid,
                                                       body, world.catalogue))
        after = money(world)
        assert first["receipt"] == again["receipt"] and again["repeat"]
        assert after["balance"] - before["balance"] == expected
        rows.append({"spot": spot, "actualPayments": paid, "refundCoins": expected,
                     "before": before, "after": after, "oneEffectOnReplay": True})
    world.game.buildings.clear()
    world.game.payments.clear()
    world.queue.clear()
    world.game.coins = money(world)["balance"]
    return rows


def price_evidence(world: DomainCampaign, price: str) -> dict:
    moment = world.read("select clock_timestamp()::text")[0][0]
    return {"asset": "harbor-trust", "price": price, "source": "live",
            "fetchedAt": moment, "quotedAt": moment}


def open_all(world: DomainCampaign) -> dict:
    before = money(world)
    assert before["available"] > 0
    reply = world.rpc("island_wager_open", world.owner, world.owner, UUID(world.epoch),
        uuid4().hex, "market_call", "harbor-trust", "up", before["available"],
        price_evidence(world, "100"))
    wager = reply["receipt"]["result"]["wager"]
    assert money(world)["available"] == 0
    return {"reply": reply, "wager": wager, "opening": before, "account": world.account}


def settle_after_deadline(world: DomainCampaign, opened: dict, price: str) -> dict:
    # Wait for the actual stored production deadline, without time fixture updates.
    remaining = world.read("select greatest(0,extract(epoch from (settle_at-clock_timestamp()))) "
                            "from public.island_wagers where id=%s", (opened["wager"]["id"],))[0][0]
    print(f"Waiting {float(remaining):.2f}s for a real local wager deadline.", file=sys.stderr)
    started = time.monotonic()
    while remaining > 0:
        time.sleep(min(30, float(remaining) + .02))
        remaining = world.read("select greatest(0,extract(epoch from "
            "(settle_at-clock_timestamp()))) from public.island_wagers where id=%s",
            (opened["wager"]["id"],))[0][0]
    first = world.rpc("island_wager_settle", UUID(opened["wager"]["id"]),
                      price_evidence(world, price))
    again = world.rpc("island_wager_settle", UUID(opened["wager"]["id"]),
                      price_evidence(world, price))
    assert first["receipt"] == again["receipt"] and again["repeat"]
    effect = first["receipt"]["result"]["settlement"]
    return {"stakeCoins": int(opened["wager"]["stake"]),
            "outcome": effect["outcome"], "returnedPayout": int(effect["returnedPayout"]),
            "elapsedWaitSeconds": round(time.monotonic() - started, 2),
            "originMoney": money(world, opened["account"]), "oneEffectOnReplay": True}


def reset(world: DomainCampaign) -> dict:
    profiles = [world.rpc("personal_captain_read", actor) for actor in world.actors]
    old_account, old_epoch = world.account, world.epoch
    uid = uuid4().hex
    first = world.rpc("island_lifecycle_reset", world.owner, world.owner, UUID(world.epoch),
        uid, world.code, world.catalogue.starting_coins, "catalogue-starting-coins-v1")
    again = world.rpc("island_lifecycle_reset", world.owner, world.owner, UUID(old_epoch),
        uid, world.code, world.catalogue.starting_coins, "catalogue-starting-coins-v1")
    assert first["receipt"] == again["receipt"] and again["repeat"]
    world.account, world.epoch = map(str, world.read(
        "select current_account_id,run_epoch from public.island_economy_state "
        "where island_owner=%s", (world.owner,))[0])
    assert profiles == [world.rpc("personal_captain_read", actor) for actor in world.actors]
    world.context = EconomyContext("island_shared", 1, str(world.owner), str(world.owner),
                                   world.account, world.epoch, 1)
    world.intent = {"mode": "island_shared", "version": 1,
                   "islandOwner": str(world.owner), "runEpoch": world.epoch}
    world.game, world.queue = Campaign(world.catalogue.starting_coins), building_plan(False)
    assert money(world)["balance"] == world.catalogue.starting_coins
    grants = world.read("select count(*) from public.island_treasury_transactions "
        "where account_id=%s and reason='starting_coins'", (world.account,))[0][0]
    assert grants == 1
    world.attach_controls()
    return {"personalProfilesPreserved": True, "oneGrantOnReplay": True,
            "newMoney": money(world), "retiredMoney": money(world, old_account)}


def measure_choices(world: DomainCampaign, combat: Combat) -> dict:
    if world.game.best < 15:
        return {"status": "not_run", "reason": "The measured island did not unlock tier 2."}
    report = {"priceEvidence": "explicit supplied price fixtures, not natural-provider results",
              "research": research_changes(world), "demolition": demolish_all(world)}
    opened = open_all(world)
    report["allInLoss"] = settle_after_deadline(world, opened, "99")
    assert money(world) == {"balance": 0, "committed": 0, "available": 0}
    world.game.coins = 0
    world.attach_controls()
    report["zeroFundsNoAssets"] = [world.attempt(combat, 99001 + i * 7919) for i in range(3)]
    report["ownerReset"] = reset(world)
    # The replacement run must actually unlock Harbor again; no saved island record is inserted.
    report["replacementUnlockAttempts"] = world.measure(combat, 55619, 6, 4)
    assert world.game.best >= 4
    won = open_all(world)
    report["allInWin"] = settle_after_deadline(world, won, "101")
    assert report["allInWin"]["returnedPayout"] == 2 * report["allInWin"]["stakeCoins"]
    reinvested = open_all(world)
    report["reinvestedStakeCoins"] = int(reinvested["wager"]["stake"])
    report["resetWithOpenWager"] = reset(world)
    new_before = money(world)
    report["oldOriginSettlement"] = settle_after_deadline(world, reinvested, "101")
    assert money(world) == new_before
    report["newRunUnchangedByOldPayout"] = True
    assert world.wallets == world.private_wallets()
    report["personalWalletsUnchanged"] = True
    report["personalWalletLedgersUnchanged"] = True
    report["allObservedOriginLedgersReconcile"] = True
    return report
