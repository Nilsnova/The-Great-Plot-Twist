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
    "companion_llm",
    "case",
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
