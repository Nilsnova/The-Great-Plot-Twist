"""Load three genuine historical league results. Used by the sports desk's recorded mode."""

import json
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from server.sports.models import Match

RECORDED = Path(__file__).resolve().parents[2] / "content" / "sports" / "recorded"
MATCH_IDS = (
    "recorded-epl-20230811-bur-mci", "recorded-epl-20230812-ars-nfo",
    "recorded-epl-20230812-bou-whu",
)


def load_recorded_matches() -> tuple[Match, ...]:
    """Raw English kickoff times are interpreted in London; they do not claim to be UTC."""
    payload = json.loads((RECORDED / "epl-2023-opening.json").read_text())
    rows = payload["matches"]
    if len(rows) != len(MATCH_IDS):
        raise ValueError("The sports recording must contain the three curated matches.")
    return tuple(
        recorded_match(match_id, payload["name"], row)
        for match_id, row in zip(MATCH_IDS, rows, strict=True)
    )


def recorded_match(match_id: str, competition: str, row: dict) -> Match:
    kickoff = datetime.fromisoformat(f"{row['date']}T{row['time']}")
    kickoff = kickoff.replace(tzinfo=ZoneInfo("Europe/London")).astimezone(UTC)
    home, away = row["score"]["ft"]
    return Match(
        match_id, "football", competition, row["team1"], row["team2"], kickoff,
        "finished", home, away,
    )
