"""Normalized HP projection and settlement for persistent structures.

Used by: T55 recovery services and tests; all calculations use integer HP units.
"""

from fractions import Fraction

FULL_HP_UNITS = 1_000_000
BASE_RECOVERY_MILLISECONDS = 600_000


def project_hp_units(hp_units: int, elapsed_ms: int, rate_factor: Fraction) -> int:
    """Project a pure between-wave read, flooring only the elapsed recovery delta."""
    _require_hp(hp_units)
    _require_elapsed(elapsed_ms)
    _require_rate(rate_factor)
    if rate_factor == 0 or elapsed_ms == 0:
        return hp_units
    recovered = Fraction(FULL_HP_UNITS * elapsed_ms, BASE_RECOVERY_MILLISECONDS)
    recovered *= rate_factor
    return min(FULL_HP_UNITS, hp_units + recovered.numerator // recovered.denominator)


def settle_hp_units(
    hp_units: int, settled_at_ms: int, now_ms: int, rate_factor: Fraction
) -> tuple[int, int]:
    """Materialize elapsed recovery and move its anchor without moving time backwards."""
    _require_hp(hp_units)
    _require_elapsed(settled_at_ms)
    _require_elapsed(now_ms)
    _require_rate(rate_factor)
    if now_ms <= settled_at_ms:
        return hp_units, settled_at_ms
    return project_hp_units(hp_units, now_ms - settled_at_ms, rate_factor), now_ms


def _require_hp(hp_units: int) -> None:
    if isinstance(hp_units, bool) or not isinstance(hp_units, int):
        raise ValueError("hp_units must be a whole number")
    if not 0 <= hp_units <= FULL_HP_UNITS:
        raise ValueError("hp_units must be between zero and FULL_HP_UNITS")


def _require_elapsed(elapsed_ms: int) -> None:
    if isinstance(elapsed_ms, bool) or not isinstance(elapsed_ms, int) or elapsed_ms < 0:
        raise ValueError("time values must be non-negative whole milliseconds")


def _require_rate(rate_factor: Fraction) -> None:
    if not isinstance(rate_factor, Fraction) or rate_factor < 0:
        raise ValueError("rate_factor must be a non-negative Fraction")
