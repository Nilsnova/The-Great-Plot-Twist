"""Feature flags: switches that turn unfinished features on or off.

Every flag is OFF unless FEATURE_FLAGS lists it. Example:

    FEATURE_FLAGS=market,arena    switches on the market and the arena, the rest stay off

A name that is not in FLAG_NAMES is an error, so a typo such as "markt" is caught when the
server starts instead of silently doing nothing.

Used by: settings.py (reads FEATURE_FLAGS), routes/config.py (tells the browser which features
are on) and every feature route that must stay hidden until its flag is on.
"""

from collections.abc import Mapping

# The exact list of flags. To add a feature flag, add its name here.
FLAG_NAMES = (
    "market",
    "predictions",
    "sports",
    "arena",
    "raid",
    "live_presence",
    "case",
    "sign_in",
    "bulletin",
    "festival",
    "demo",
    "islands",
    "rescue",  # T38 last-chance rescue (D044): the finish honours rescued; a wave rule for the sim
    # D039 (proposed): wall damage stays after a wave, paid Repair/Rebuild between waves.
    # Needs supabase/migrations/20261114100000_wall_recovery.sql applied first.
    "wall_recovery",
    "placement",  # T36 flexible placement: retired, always on (the name is still accepted)
    # T43 (D048, proposed): the second wave of defenses, starting with the culverin. Keep it off
    # until its sim wiring and its migration are merged (specs/T43-new-defenses.md).
    "defenses_v2",
    # T40/T41 (D042): the shared island arsenal. Off: the old personal weapon shop, as before.
    "arsenal",
    # T33 (D049): towers have hp in a wave (a wave rule). Retired: always on (wave_rules.ALWAYS_ON).
    "tower_health",
    # T34/T35 (D040): boarders walk round or through real walls (a wave rule). Retired: always on.
    "pathing",
    # T35 combat towers block boarders (a wave rule). Retired: always on.
    "tower_obstacles",
    # T50: ships at anchor fire at a real wall, tower or the heart and their hits count (a wave
    # rule). Needs supabase/migrations/20261116160000_ship_fire_rule.sql applied first.
    "ship_fire",
    # D060: extra tower spots that open with progress (cannon_8..cannon_11 after waves 10, 20, 30
    # and 40). Needs supabase/migrations/20261117010000_more_tower_spots.sql applied first.
    "more_tower_spots",
    # T55/T54: protocol-2 persistent structure HP and recovery state. Keep off until separately
    # reviewed and authorized for activation; adding the registry entry does not enable it.
    "structure_recovery",
)


class UnknownFlagError(ValueError):
    """A flag name that does not exist. Usually a typo."""


def known_flags_text() -> str:
    """The valid flag names as one line, for error messages."""
    return ", ".join(FLAG_NAMES)


def default_flags() -> dict[str, bool]:
    """Every flag, all switched off."""
    return {name: False for name in FLAG_NAMES}


def parse_flags(raw: str) -> dict[str, bool]:
    """Turn the text of FEATURE_FLAGS ("market, arena") into {name: on or off}."""
    pieces = [piece.strip() for piece in raw.split(",")]
    names = [piece for piece in pieces if piece]  # ignore empty pieces such as a trailing comma

    unknown = [name for name in names if name not in FLAG_NAMES]
    if unknown:
        raise UnknownFlagError(
            f"FEATURE_FLAGS has unknown flag(s): {', '.join(unknown)}. "
            f"Known flags are: {known_flags_text()}."
        )

    flags = default_flags()
    for name in names:
        flags[name] = True
    return flags


def is_enabled(name: str, flags: Mapping[str, bool]) -> bool:
    """True if the feature called `name` is switched on. A misspelled name raises an error."""
    if name not in FLAG_NAMES:
        raise UnknownFlagError(
            f"Unknown feature flag '{name}'. Known flags are: {known_flags_text()}."
        )
    return flags.get(name, False)
