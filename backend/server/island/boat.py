"""The own boat's games (decision D057, docs/GAME-V3.md section 4.5): the repaired wreck sails out.

Once the best wave won on an island reaches the campaign's "ship" step (wave 30, campaign.json)
and the island's wreck is fully repaired, every member of the game may sail her out between waves
and play one of two short games in the browser (frontend/src/pirates/boat/): the broadside duel
and the treasure dash. A round ends with 0 to 3 stars.

Rewards follow the boss finisher's pattern (waves.py, `bonuses: ["finisher"]`): the browser claims
the outcome, the server decides whether the claim is allowed and how much it is worth. Here:
  * the game must be one of boat.json's games and the stars a whole number from 0 to 3;
  * the island must have opened the ship (409 locked "Opens after wave 30.") and repaired the wreck
    (409 not_repaired);
  * on a friend's island the player must be a member of its game (403 not_member, permissions.BOAT);
  * the coins are the server's own: stars x (coinsBase + floor(wave / coinsPerWaves)), the island's
    best won wave capped at maxWave (boat.json), so 3 stars pay 🪙 36 at wave 30 and 🪙 78 at 100;
  * each game pays ONCE per player, island and best won wave: the ledger ref is
    boat:<island owner>:<wave>:<game>, reason boat_game (earn), and the database accepts each
    player + reason + ref once (apply_wallet_transaction). Further rounds at the same wave are
    play for fun and pay nothing; the next won wave opens the next payment.

    boat_status()  GET /api/island/boat: open or not, why not, and which games paid at this wave
    boat_reward()  POST /api/island/boat: one finished round, paid or not

Used by: routes/island_boat.py; tests test_boat_routes.py and test_boat_matches_migration.py.
"""

import json
from dataclasses import dataclass
from pathlib import Path

from server.errors import ApiError
from server.island import permissions, rules, store
from server.island.catalogue import IslandCatalogue
from server.island.service import target_island
from server.supabase_admin import AlreadyApplied, SupabaseAdmin
from server.wallet import apply_transaction

BOAT_FILE = Path(__file__).resolve().parents[2] / "content" / "boat.json"
REASON = "boat_game"
REF_PREFIX = "boat:"
SHIP = "ship"  # the campaign id (campaign.json) that opens the boat


@dataclass(frozen=True)
class BoatRules:
    games: tuple[str, ...]
    stars: int
    coins_base: int
    coins_per_waves: int
    max_wave: int


def load_boat(path: Path = BOAT_FILE) -> BoatRules:
    data = json.loads(path.read_text(encoding="utf-8"))
    games = data["games"]
    if not isinstance(games, list) or not games or not all(isinstance(g, str) for g in games):
        raise ValueError("boat.json: games must be a list of names.")
    numbers = [data[key] for key in ("stars", "coinsBase", "coinsPerWaves", "maxWave")]
    if not all(isinstance(n, int) and not isinstance(n, bool) and n >= 1 for n in numbers):
        raise ValueError("boat.json: stars, coinsBase, coinsPerWaves, maxWave: whole numbers.")
    return BoatRules(tuple(games), *numbers)


BOAT = load_boat()


def coins_for(stars: int, wave: int, boat: BoatRules = BOAT) -> int:
    """The coins of a round: stars x (base + floor(wave / per_waves)), the wave capped."""
    stars = max(0, min(boat.stars, stars))
    wave = max(0, min(boat.max_wave, wave))
    return stars * (boat.coins_base + wave // boat.coins_per_waves)


def ref_of(owner: str, wave: int, game: str) -> str:
    return f"{REF_PREFIX}{owner}:{wave}:{game}"


def bad_game() -> ApiError:
    return ApiError(400, "bad_game", "There is no such boat game.")


def check_claim(game: str, stars: int, boat: BoatRules = BOAT) -> None:
    if game not in boat.games:
        raise bad_game()
    if isinstance(stars, bool) or not isinstance(stars, int) or not 0 <= stars <= boat.stars:
        raise ApiError(422, "bad_stars", f"Stars are a whole number from 0 to {boat.stars}.")


def blocker(catalogue: IslandCatalogue, wave: int, wreck_paid: int) -> ApiError | None:
    """Why the boat cannot sail on an island with this best wave and wreck repair, or None."""
    try:
        rules.check_open(catalogue, SHIP, wave)
    except ApiError as error:
        return error
    left = catalogue.wreck.goal - min(wreck_paid, catalogue.wreck.goal)
    if left > 0:
        return ApiError(
            409, "not_repaired", f"Finish the wreck's repair first: {left} coins to go."
        )
    return None


@dataclass(frozen=True)
class BoatGameView:
    game: str
    paid: bool  # this player was paid for this game at this wave already
    best: int  # the coins 3 stars pay at this wave


@dataclass(frozen=True)
class BoatStatus:
    open: bool
    reason: str | None  # locked or not_repaired, None when she sails
    message: str | None
    wave: int  # the island's best won wave
    unlock_wave: int
    wreck_paid: int
    wreck_goal: int
    games: tuple[BoatGameView, ...]


@dataclass(frozen=True)
class BoatReward:
    game: str
    stars: int
    coins: int  # paid now (0 when nothing was paid)
    paid: bool  # this claim paid
    already: bool  # this game had paid this player at this wave before
    balance: int | None  # the wallet after a payment (None when nothing moved)
    wave: int


async def boat_status(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, code: str | None = None
) -> BoatStatus:
    island, _ = await target_island(admin, catalogue, player_id, code, permissions.BOAT)
    progress = await store.read_progress(admin, island.owner)
    wave = progress.wave_best
    stop = blocker(catalogue, wave, progress.wreck_paid)
    games = []
    for game in BOAT.games:
        paid = await store.ledger_has(admin, player_id, REASON, ref_of(island.owner, wave, game))
        games.append(BoatGameView(game, paid, coins_for(BOAT.stars, wave)))
    return BoatStatus(
        open=stop is None,
        reason=None if stop is None else stop.code,
        message=None if stop is None else stop.message,
        wave=wave,
        unlock_wave=catalogue.campaign.wave_of(SHIP) or 0,
        wreck_paid=min(progress.wreck_paid, catalogue.wreck.goal),
        wreck_goal=catalogue.wreck.goal,
        games=tuple(games),
    )


async def boat_reward(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    game: str,
    stars: int,
    code: str | None = None,
) -> BoatReward:
    """One finished round. 400 bad_game, 422 bad_stars, 404 no_such_island, 403 not_member,
    409 locked, 409 not_repaired. A round that has nothing to pay (0 stars, or this game paid at
    this wave already) answers paid false and moves no coins."""
    check_claim(game, stars)
    island, _ = await target_island(admin, catalogue, player_id, code, permissions.BOAT)
    progress = await store.read_progress(admin, island.owner)
    wave = progress.wave_best
    stop = blocker(catalogue, wave, progress.wreck_paid)
    if stop is not None:
        raise stop
    ref = ref_of(island.owner, wave, game)
    coins = coins_for(stars, wave)
    already = await store.ledger_has(admin, player_id, REASON, ref)
    if already or coins <= 0:
        return BoatReward(game, stars, 0, False, already, None, wave)
    try:
        balance = await apply_transaction(player_id, coins, REASON, ref, admin=admin)
    except AlreadyApplied:  # a second tab claimed it a moment before
        return BoatReward(game, stars, 0, False, True, None, wave)
    return BoatReward(game, stars, coins, True, False, balance, wave)
