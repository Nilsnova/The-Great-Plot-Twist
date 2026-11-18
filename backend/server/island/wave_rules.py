"""The simulation rules a wave plays with (T33 tower_health, T34/T35 pathing, T38 rescue, T43
defenses_v2, T50 ship_fire).

Each rule was switched on by the feature flag of the same name. The rules of ALWAYS_ON are on in
production for good: their flags are retired (the names stay accepted in FEATURE_FLAGS and change
nothing), so every new wave plays them; the others still follow their flag. The first wave answer
for a wave (start, join or current) keeps the rule set of that moment, in the table wave_rules
(supabase/migrations/20261114130500_wave_rules.sql, wave_rules_keep()); every later answer for
that wave serves the kept set. So a friend who joins after a flag was switched still plays the
bell-ringer's rules, and every client of a wave simulates the same wave.

The set is kept even when it is empty (every rule flag off): a wave that started with no rules
plays none for every later joiner, even if a rule flag is switched on while it runs, and a wave
that started with rules keeps them even if every flag is switched off. One small database call
per answer (wave_rules_keep). An empty kept set leaves the "rules" key out, exactly as before. A
wave with no row yet (started before this was deployed) keeps the flags of its next answer. If
keeping fails (the database is down) the answer has no rules and the error is logged, never a 5xx.

Used by: routes/waves.py.
"""

import logging

from pydantic import BaseModel

from server.errors import ApiError
from server.flags import is_enabled
from server.island.store import read_model
from server.island.waves import WaveStart
from server.settings import Settings
from server.supabase_admin import SupabaseAdmin

# The rules in their fixed order (the "rules" of the wave answers). The browser's sim turns each
# one into an option of createWave() (frontend/src/pirates/wave-rules.js). The migrations' check
# constraint lists the same names (20261114130500_wave_rules.sql, widened for defenses_v2 by
# 20261114140000_culverin.sql, for tower_obstacles by 20261115160000_tower_obstacles.sql and for
# ship_fire by 20261116160000_ship_fire_rule.sql, whose check rule lists all six). defenses_v2
# (T43): the culverins of the island fight in this wave; without it every client's sim ignores a
# culverin, so a whole wave fights the same island even if the flag (and so the island answer)
# changed while it ran. ship_fire (T50): ships at anchor fire at a real wall, tower or the heart
# (frontend/src/pirates/ship-fire.js); a wave that started without it keeps the old shelling.
SIM_RULES = (
    "tower_health",
    "pathing",
    "tower_obstacles",
    "rescue",
    "defenses_v2",
    "ship_fire",
    "structure_recovery",
)
logger = logging.getLogger(__name__)


class KeptRules(BaseModel):
    rules: list[str]


# The rules every new wave plays whatever FEATURE_FLAGS says (their flags are retired, always on).
ALWAYS_ON = ("tower_health", "pathing", "tower_obstacles", "rescue", "defenses_v2", "ship_fire")


def wanted_rules(settings: Settings) -> list[str]:
    """The rules of SIM_RULES that are always on or whose flag is on now, in that order."""
    enabled = {name for name in SIM_RULES if name in ALWAYS_ON or is_enabled(name, settings.flags)}
    return [name for name in SIM_RULES if name in enabled]


async def rules_for_wave(
    admin: SupabaseAdmin, settings: Settings, wave: WaveStart
) -> list[str] | None:
    """The rules of this wave: kept by its first answer (an empty set too), the same for every
    later one whatever the flags say now. None when the wave keeps no rule (the key is then left
    out) or when keeping fails."""
    requested = wanted_rules(settings)
    if wave.recovery_version == 1 and isinstance(wave.initial_snapshot, dict):
        frozen = wave.initial_snapshot.get("rules")
        if isinstance(frozen, list) and all(isinstance(name, str) for name in frozen):
            requested = [name for name in SIM_RULES if name in frozen]
    arguments = {"p_wave_id": str(wave.wave_id), "p_rules": requested}
    try:
        kept = read_model(KeptRules, await admin.call_function("wave_rules_keep", arguments))
    except ApiError as error:
        # The wave itself is fine (started or joined): never fail it for its rules. With the
        # database down it plays with no rules, as before this feature.
        logger.warning("Wave rules not kept; the wave plays without them: %s", type(error).__name__)
        return None
    rules = [name for name in SIM_RULES if name in kept.rules]
    return rules or None
