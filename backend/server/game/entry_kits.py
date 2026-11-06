"""The four entry kits, and how the end of Act 1 picks one (package A3, decision D019).

Act 1 ends in one of two scenes (ending_rescue or ending_trapped), and on the way the player made
one of three decisions at the shore: they warned the harbor master, they trusted the fisherman, or
they took no side. Together that gives four kits: True Keeper, Witness, Informant and Stranger. A
kit decides where the player starts the case, how many coins they get, which clue card they hold
from the start, and one small item.

The kits are data, not code. They live in backend/content/entry_kits.json (the format is in
backend/content/README.md), a file for the server only that is never served to the browser. This
file reads that data, checks every field, and answers two questions: which kit belongs to this
ending and decision (kit_for), and what is the kit with this id (kit_by_id). A mistake in the file
stops the code with a message that names the field, so a typo cannot hide until a player finishes
Act 1.

Which flag means which decision is part of the same file (decisionFlags and logFlag). The referee
(referee.py) reads the flags of the finished story and uses those names.

Used by: game/referee.py, routes/intro.py and the tests.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path

from plot_twist.engine import CONTENT_DIR
from server.wallet import MAX_DELTA

# Settled by the story round (N5 in specs/M1-backbone.md, D018): the coins and the texts in the
# file come from the S0 story drafts (CASE-FILE.md section 3), which Nils approved.
ENTRY_KITS_PATH = CONTENT_DIR / "entry_kits.json"

# What the player decided at the shore. The database repeats this list in the table rule
# entry_profiles_decision_allowed, and a test compares the two.
DECISIONS = ("warned", "trusted", "none")

# An id in the file (a kit, an ending, a start place, an item, a flag): lowercase letters, digits
# and underscores, 2 to 40 characters. The database checks the same pattern for the ending and the
# start place (entry_profiles_ending_format and entry_profiles_start_place_format).
ID_PATTERN = r"[a-z0-9_]{2,40}"

# The id of a clue card is a short code such as C6.
CARD_PATTERN = r"[A-Za-z0-9_]{1,20}"

MAX_NAME_LENGTH = 60
MAX_TEXT_LENGTH = 300


@dataclass(frozen=True)
class KitItem:
    """The small item that comes with a kit."""

    id: str
    name: str
    text: str


@dataclass(frozen=True)
class Kit:
    """One entry kit."""

    id: str  # true_keeper, witness, informant or stranger
    name: str  # what the player sees, for example "True Keeper"
    ending: str  # the Act 1 ending scene that leads to this kit
    decision: str  # warned, trusted or none: what the player decided at the shore
    start_place: str  # the id of a place in the browser's registry
    coins: int  # the coins paid once, with the reason kit_grant
    cheap_card: str  # the id of the clue card the player holds from the start
    item: KitItem


@dataclass(frozen=True)
class EntryKits:
    """The whole file: the kits and the names of the flags the referee looks at."""

    kits: tuple[Kit, ...]
    trusted_flag: str  # the story flag that means "trusted the fisherman"
    warned_flag: str  # the story flag that means "warned the harbor master"
    log_flag: str  # the story flag that means "read the keeper's last logbook entry"


def problem(where: str, text: str) -> ValueError:
    """A ValueError whose message starts with where the problem is, for example the file name."""
    return ValueError(f"{where}: {text}")


def read_id(entry: dict, key: str, where: str) -> str:
    value = entry.get(key)
    if not isinstance(value, str) or not re.fullmatch(ID_PATTERN, value):
        raise problem(
            where, f"'{key}' must be 2 to 40 characters: lowercase letters, digits and underscores."
        )
    return value


def read_text(entry: dict, key: str, where: str, longest: int) -> str:
    value = entry.get(key)
    if not isinstance(value, str) or not value.strip() or len(value) > longest:
        raise problem(
            where, f"'{key}' must be text that is not blank, at most {longest} characters."
        )
    return value


def read_card(entry: dict, where: str) -> str:
    value = entry.get("cheapCard")
    if not isinstance(value, str) or not re.fullmatch(CARD_PATTERN, value):
        raise problem(
            where, "'cheapCard' must be a card id such as C6 (1 to 20 letters or digits)."
        )
    return value


def read_coins(entry: dict, where: str) -> int:
    value = entry.get("coins")
    # bool is a kind of int in Python (True == 1), so it needs its own check.
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= MAX_DELTA:
        raise problem(where, f"'coins' must be a whole number from 1 to {MAX_DELTA}.")
    return value


def read_decision(entry: dict, where: str) -> str:
    value = entry.get("decision")
    if value not in DECISIONS:
        raise problem(where, f"'decision' must be one of: {', '.join(DECISIONS)}.")
    return value


def read_item(entry: dict, where: str) -> KitItem:
    item = entry.get("item")
    if not isinstance(item, dict):
        raise problem(where, "'item' must be an object with an id, a name and a text.")
    item_where = f"{where}, item"
    return KitItem(
        id=read_id(item, "id", item_where),
        name=read_text(item, "name", item_where, MAX_NAME_LENGTH),
        text=read_text(item, "text", item_where, MAX_TEXT_LENGTH),
    )


def read_kit(entry: object, where: str) -> Kit:
    """Check one entry of the file and turn it into a Kit."""
    if not isinstance(entry, dict):
        raise problem(where, "a kit must be an object.")
    return Kit(
        id=read_id(entry, "id", where),
        name=read_text(entry, "name", where, MAX_NAME_LENGTH),
        ending=read_id(entry, "ending", where),
        decision=read_decision(entry, where),
        start_place=read_id(entry, "startPlace", where),
        coins=read_coins(entry, where),
        cheap_card=read_card(entry, where),
        item=read_item(entry, where),
    )


def check_no_duplicates(kits: list[Kit], file_name: str) -> None:
    """Every kit id is used once, and every pair of ending and decision belongs to one kit."""
    ids = [kit.id for kit in kits]
    if len(ids) != len(set(ids)):
        raise problem(file_name, "two kits share the same id.")
    pairs = [(kit.ending, kit.decision) for kit in kits]
    if len(pairs) != len(set(pairs)):
        raise problem(file_name, "two kits share the same ending and decision.")


def read_flag_names(content: dict, file_name: str) -> tuple[str, str, str]:
    """The names of the trusted flag, the warned flag and the log flag. They must differ."""
    decision_flags = content.get("decisionFlags")
    if not isinstance(decision_flags, dict):
        raise problem(file_name, "'decisionFlags' must be an object with 'trusted' and 'warned'.")
    where = f"{file_name}, decisionFlags"
    trusted = read_id(decision_flags, "trusted", where)
    warned = read_id(decision_flags, "warned", where)
    log_flag = read_id(content, "logFlag", file_name)
    if len({trusted, warned, log_flag}) != 3:
        raise problem(file_name, "the trusted flag, the warned flag and 'logFlag' must differ.")
    return trusted, warned, log_flag


def load_entry_kits(path: Path = ENTRY_KITS_PATH) -> EntryKits:
    """Read and check the kits file.

    Raises ValueError, with the problem in words, if the file breaks a rule. A file that is missing
    raises OSError, which the route turns into the same 503 as a broken file.
    """
    with open(path, encoding="utf-8") as file:
        try:
            content = json.load(file)
        except json.JSONDecodeError as error:
            raise ValueError(f"{path.name} is not valid JSON.") from error
    if not isinstance(content, dict):
        raise problem(path.name, "the file must be a JSON object with 'kits' and the flag names.")
    entries = content.get("kits")
    if not isinstance(entries, list) or not entries:
        raise problem(path.name, "'kits' must be a list with at least one kit.")
    kits = [read_kit(entry, f"{path.name}, kits[{number}]") for number, entry in enumerate(entries)]
    check_no_duplicates(kits, path.name)
    trusted, warned, log_flag = read_flag_names(content, path.name)
    return EntryKits(kits=tuple(kits), trusted_flag=trusted, warned_flag=warned, log_flag=log_flag)


def kit_for(kits: EntryKits, ending: str, decision: str) -> Kit:
    """The kit of an ending and a decision.

    Raises ValueError if there is none. The story cannot end that way, so it is a mistake in the
    content (the story or the kits file), never something a player can cause.
    """
    for kit in kits.kits:
        if kit.ending == ending and kit.decision == decision:
            return kit
    raise ValueError(
        f"No entry kit for the ending '{ending}' with the decision '{decision}'. "
        "Check entry_kits.json against the story."
    )


def kit_by_id(kits: EntryKits, kit_id: str) -> Kit:
    """The kit with this id. Raises ValueError if the file has no such kit."""
    for kit in kits.kits:
        if kit.id == kit_id:
            return kit
    raise ValueError(f"No entry kit with the id '{kit_id}'. Check entry_kits.json.")
