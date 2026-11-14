"""The simulation rules a wave plays with (T33 tower_health, T34/T35 pathing, T38 rescue).

Each rule is switched on by the feature flag of the same name. The first wave answer for a wave
(start, join or current) keeps the rule set the flags say at that moment, in the table wave_rules
(supabase/migrations/20261114130500_wave_rules.sql, wave_rules_keep()); every later answer for that
wave serves the kept set. So a friend who joins after a flag was switched still plays the
bell-ringer's rules, and every client of a wave simulates the same wave.

While every rule flag is off nothing is kept or read (the table may not exist yet) and the wave
answers carry no rules, exactly as before. If keeping fails (the migration is not applied yet,
the database is down) the answer has no rules and the error is logged, never a 5xx. Known
limit: switching the LAST rule flag off while a wave runs gives later joiners of that wave no
rules; switch it off between waves.

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
# one into an option of createWave() (frontend/src/pirates/wave-rules.js). The migration's check
# constraint lists the same names.
SIM_RULES = ("tower_health", "pathing", "rescue")
logger = logging.getLogger(__name__)


class KeptRules(BaseModel):
    rules: list[str]


def wanted_rules(settings: Settings) -> list[str]:
    """The rules of SIM_RULES whose flag is on now, in that order."""
    return [name for name in SIM_RULES if is_enabled(name, settings.flags)]


async def rules_for_wave(
    admin: SupabaseAdmin, settings: Settings, wave: WaveStart
) -> list[str] | None:
    """The rules of this wave: kept by its first answer, the same for every later one. None while
    every rule flag is off, or when the wave keeps no rule (the key is then left out)."""
    wanted = wanted_rules(settings)
    if not wanted:
        return None
    arguments = {"p_wave_id": str(wave.wave_id), "p_rules": wanted}
    try:
        kept = read_model(KeptRules, await admin.call_function("wave_rules_keep", arguments))
    except ApiError as error:
        # The wave itself is fine (started or joined): never fail it for its rules. Without the
        # migration, or with the database down, it plays with no rules, as before this feature.
        logger.warning("Wave rules not kept; the wave plays without them: %s", type(error).__name__)
        return None
    rules = [name for name in SIM_RULES if name in kept.rules]
    return rules or None
