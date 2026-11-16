"""Between-wave recovery rates for supported island structures.

Used by: the T55 recovery projection, structure view and recovery-rate tests.
"""

from fractions import Fraction

WALL_SPEC_RATE_FACTORS = {
    "quick_mend": Fraction(2, 1),
    "bastion": Fraction(3, 1),
}
WALL_RESEARCH_RATE_FACTORS = {"mason_drill": Fraction(3, 2)}
SUPPORTED_STRUCTURE_KINDS = frozenset(
    {"wall", "cannon", "mortar", "harpoon", "culverin", "swivel"}
)
WALL_SPEC_IDS = frozenset({"quick_mend", "bastion", "stone", "spiked", "thorns"})
WALL_RESEARCH_IDS = frozenset({"mason_drill", "thick_walls"})


def recovery_rate_factor(
    owner_carpenters: int,
    nearby_workshops: int,
    structure_kind: str,
    wall_spec: str | None,
    wall_research: str | None,
    is_between_waves: bool,
) -> Fraction:
    """Return the exact approved multiplier, or zero for an accepted reservation.

    Carpenters belong to the island owner and cap at two. Nearby Workshops cap at a
    total +50%. Only a wall's selected Quick Mend or Bastion spec and its
    island's Mason Drill research add a rate bonus. Other valid wall skills and
    Thick Walls have no recovery-rate effect.
    """
    _require_count("owner_carpenters", owner_carpenters)
    _require_count("nearby_workshops", nearby_workshops)
    if not isinstance(is_between_waves, bool):
        raise ValueError("is_between_waves must be a boolean")
    if structure_kind not in SUPPORTED_STRUCTURE_KINDS:
        raise ValueError("unknown structure kind")
    if wall_spec not in WALL_SPEC_IDS and wall_spec is not None:
        raise ValueError("unknown wall recovery spec")
    if wall_research not in WALL_RESEARCH_IDS and wall_research is not None:
        raise ValueError("unknown wall recovery research")
    if not is_between_waves:
        return Fraction(0, 1)

    carpenter_factor = 1 + min(owner_carpenters, 2)
    workshop_percent = 100 + min(30 * nearby_workshops, 50)
    wall_spec_factor = WALL_SPEC_RATE_FACTORS.get(wall_spec, Fraction(1, 1))
    wall_research_factor = WALL_RESEARCH_RATE_FACTORS.get(wall_research, Fraction(1, 1))
    wall_factor = Fraction(1, 1)
    if structure_kind == "wall":
        wall_factor = wall_spec_factor * wall_research_factor
    return Fraction(carpenter_factor * workshop_percent, 100) * wall_factor


def _require_count(name: str, value: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a non-negative whole number")
