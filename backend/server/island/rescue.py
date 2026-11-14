"""The last-chance rescue's settlement (T38, specs/T38-T39-minigames-rescue.md, decision D044).

When an island wave is lost (the heart fell or every captain is down), the browsers play one
short co-op haul (frontend/src/pirates/finisher/rescue.js). The wave stays lost: no loot, no
flag, no best wave. A won rescue only changes the restart rule of wave_finish(): the next bell
rings the island's best wave minus 1 instead of minus 2 (at least wave 1). Coins, buildings,
crew, weapons, research, wave_best, won_wave_best and the flags are never changed by a rescue.

The server cannot see the battle, like `survived` itself: it trusts the claim only where a
rescue could have happened (a lost wave on an island, wave 4 to 100, the flag `rescue` on) and
otherwise ignores it, never refuses it. Exactly once comes from the database: wave_finish()
applies the restart rule only at the first finish that closes the wave run, so the first
finisher's claim decides, and a repeat or a later participant cannot apply it again. No new
table or migration is needed: the rescue only changes the existing p_restart_back argument.

Used by: island/waves.py (finish) and the tests.
"""

# Keep equal to RESCUE.fromWave and RESCUE.lastWave in frontend/src/pirates/finisher/rescue.js
# (a test checks).
# Below wave 4 the island's best is at most 2, so both fallbacks ring wave 1 and nothing could
# be saved.
RESCUE_FROM_WAVE = 4
RESCUE_LAST_WAVE = 100


def rescue_counts(rescued: bool, survived: bool, place: str | None, wave: int | None) -> bool:
    """True when a reported rescue may change the restart rule of this finish."""
    if not rescued or survived or place != "island" or wave is None:
        return False
    return RESCUE_FROM_WAVE <= wave <= RESCUE_LAST_WAVE


def restart_back(normal_back: int, counts: bool) -> int:
    """How many waves below the best the next bell rings: one less after a counted rescue."""
    return max(0, normal_back - 1) if counts else normal_back


def next_wave_after_loss(best: int, back: int) -> int:
    """The restart rule of wave_finish() in Python (for the tests and the spec): never wave 0.
    Wave 0 is not a playable wave; a best of 0 means the island has not won a wave yet."""
    return max(1, best - back)
