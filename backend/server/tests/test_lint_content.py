"""Tests for the content linter, backend/tools/lint_content.py.

Most tests build a tiny content folder in a temporary place. The folder is valid, then the test
breaks exactly one thing, runs the linter the way a person would and reads what it printed. The
last tests run the linter on the real backend/content folder. No test uses the network.

The wording of a message can change, so the tests look for the place (the file and the path inside
it) and one telling word, not for the whole sentence.

Used by: `cd backend && uv run pytest`. The linter itself is described in its own header comment.
"""

import ast
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pytest

from tools import lint_content

# This file is backend/server/tests/test_lint_content.py, so the backend folder is two levels up.
BACKEND = Path(__file__).resolve().parents[2]
SCRIPT = BACKEND / "tools" / "lint_content.py"

# The day the tests pretend it is. The calendar below is valid until 31 Dec 2026.
TODAY = "2026-11-06"

# Built with chr(), so that this file itself holds no em or en dash.
EM_DASH = chr(0x2014)
EN_DASH = chr(0x2013)

# Fake secrets, glued together from pieces. The secret scan in docs/ENGINEERING.md (section 6)
# reads the commits and flags anything that looks like a real key, so this file must never hold a
# finished fake key in one piece. The linter still sees the whole string once the pieces are joined.
FAKE_SB_KEY = "sb_" + "secret_" + "a" * 26
FAKE_JWT = "eyJ" + "hbGciOiJIUzI1NiJ9" + ".eyJ" + "zdWIiOiIxMjM0NTY3ODkwIn0" + ".abcdefghij"
FAKE_SETTING = "CRON_" + "SECRET" + "=hunter2"


def has_time_zone_data() -> bool:
    try:
        ZoneInfo("America/New_York")
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


needs_time_zone_data = pytest.mark.skipif(
    not has_time_zone_data(), reason="this machine has no time-zone data"
)


# ---------------------------------------------------------------------------------------------
# Valid sample data. Each function gives a fresh copy, so a test can change it freely.
# ---------------------------------------------------------------------------------------------


def valid_story() -> dict:
    return {
        "title": "A test story",
        "start": "cottage",
        "items": {"brass_key": {"name": "Brass key", "description": "Heavy and cold."}},
        "scenes": {
            "cottage": {
                "title": "The cottage",
                "text": "A small cottage by the shore.",
                "notes": [{"when": {"has": ["brass_key"]}, "text": "The drawer is empty now."}],
                "actions": [
                    {
                        "id": "take_key",
                        "label": "Take the key",
                        "take": "brass_key",
                        "set": ["took_key"],
                        "message": "You take the key.",
                    },
                    {
                        "id": "to_tower",
                        "label": "Go to the tower",
                        "goto": "tower",
                        "requires": {"has": ["brass_key"], "flags": ["took_key"]},
                        "hide_when_blocked": True,
                        "blocked_message": "The path is blocked.",
                        "message": "You walk to the tower.",
                    },
                ],
            },
            "tower": {"title": "The tower", "text": "A tall tower.", "ending": True},
        },
    }


def island_company(**changes) -> dict:
    company = {
        "id": "harbor-trust",
        "name": "Saltreach Harbor Trust",
        "ticker": "SHT",
        "kind": "island",
        "follows": "Bitcoin",
        "symbol": "BTCUSDT",
        "market": "always",
        "currency": "USDT",
        "priceDecimals": 2,
        "tagline": "The old harbor bank.",
    }
    return {**company, **changes}


def stock_company(**changes) -> dict:
    company = {
        "id": "apple",
        "name": "Apple",
        "ticker": "AAPL",
        "kind": "stock",
        "follows": "Apple Inc. shares (Nasdaq)",
        "market": "us",
        "currency": "USD",
        "priceDecimals": 2,
        "tagline": "Phones, laptops and the shop in every pocket.",
    }
    return {**company, **changes}


def valid_companies() -> dict:
    greyfathom = island_company(
        id="greyfathom-salvage",
        name="Greyfathom Salvage",
        ticker="GREY",
        follows="Gold",
        symbol="PAXGUSDT",
        delistAtRelighting=True,
    )
    return {
        "about": "Island companies are invented. Stock companies are real.",
        "nameCheck": "Not done yet.",
        "companies": [island_company(), greyfathom, stock_company()],
    }


def companies_with(count: int) -> dict:
    """The valid companies file, padded with invented island companies up to `count` companies."""
    companies = valid_companies()
    fillers = [
        island_company(id=f"filler-{n}", ticker=f"F{n}", symbol=f"FILL{n}USDT")
        for n in range(count - len(companies["companies"]))
    ]
    companies["companies"] += fillers
    return companies


def valid_calendars() -> dict:
    return {
        "about": "Opening hours of the stock markets.",
        "validFrom": "2026-11-06",
        "validTo": "2026-12-31",
        "checkedOn": "2026-11-05",
        "markets": [
            {
                "id": "us",
                "name": "New York (NYSE and Nasdaq)",
                "timeZone": "America/New_York",
                "utcOffset": "-05:00",
                "opens": "09:30",
                "closes": "16:00",
                "closedDays": [
                    {"date": "2026-11-26", "name": "Thanksgiving Day"},
                    {"date": "2026-12-25", "name": "Christmas Day"},
                ],
                "shortDays": [
                    {"date": "2026-11-27", "closes": "13:00", "name": "Day after Thanksgiving"},
                    {"date": "2026-12-24", "closes": "13:00", "name": "Christmas Eve"},
                ],
                "source": "https://www.nyse.com/markets/hours-calendars",
            }
        ],
    }


def valid_replay() -> dict:
    return {
        "credit": "Binance Vision",
        "licence": "CC BY-NC-SA 4.0",
        "licenceUrl": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
        "candleSeconds": 60,
        "candles": 3,
        "closes": {"BTCUSDT": [1.5, 2.5, 3.5], "PAXGUSDT": [4.5, 5.5, 6.5]},
    }


def valid_case() -> dict:
    """A case file in the shape of the approved story round: routes sit inside their card."""
    cards = []
    for number in range(1, 9):
        route = {
            "id": f"C{number}.look",
            "kind": "open",
            "coins": 0,
            "timer_minutes": 2,
            "estimate_minutes": 6,
        }
        cards.append({"id": f"C{number}", "title": f"Card {number}", "routes": [route]})
    deductions = [
        {"id": f"D{number}", "cards": [f"C{2 * number - 1}", f"C{2 * number}"]}
        for number in range(1, 5)
    ]
    suspect_ids = ["fisherman", "foreman", "commander", "master"]
    return {
        "cards": cards,
        "deductions": deductions,
        "suspects": [{"id": suspect_id} for suspect_id in suspect_ids],
        "accusation": {"suspects": suspect_ids, "culprit": "foreman"},
    }


def flat_case() -> dict:
    """The case in the flatter shape of the L4 spec: routes and culprit at the top level."""
    case = valid_case()
    for card in case["cards"]:
        del card["routes"]
    case["routes"] = [
        {"id": "r1", "cardId": "C1", "price": 0, "minutes": 3},
        {"id": "r2", "cardId": "C2", "price": 20, "minutes": 0},
    ]
    case["culprit"] = case["accusation"].pop("culprit")
    return case


def cards_numbered(count: int) -> list[dict]:
    return [{"id": f"C{number}", "routes": []} for number in range(1, count + 1)]


def deductions_numbered(count: int) -> list[dict]:
    return [{"id": f"D{number}", "cards": ["C1", "C2"]} for number in range(1, count + 1)]


# ---------------------------------------------------------------------------------------------
# The helpers that build a folder, run the linter and read its answer.
# ---------------------------------------------------------------------------------------------


@dataclass
class Run:
    """What one run of the linter did: its exit code and what it printed."""

    code: int
    out: str
    err: str

    @property
    def lines(self) -> list[str]:
        return self.out.splitlines()


class Tree:
    """A small valid content folder, with the public list a folder up, as in backend/."""

    def __init__(self, base: Path, capsys) -> None:
        self.base = base
        self.root = base / "content"
        self.capsys = capsys
        self.write_json("story.json", valid_story())
        self.write_json("market/companies.json", valid_companies())
        self.write_json("market/calendars.json", valid_calendars())
        self.write_json("market/replay.json", valid_replay())
        self.write_json("weather/recorded-fallback.json", {"answer": {"temperature": 12.5}})
        self.write_text("README.md", "# Content\n\nPlain words only.\n")
        self.write_public_list({"intro-story": "story.json"})

    def write_json(self, name: str, data) -> None:
        self.write_text(name, json.dumps(data, indent=2) + "\n")

    def write_text(self, name: str, text: str) -> None:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def write_public_list(self, entries: dict[str, str]) -> None:
        lines = [
            '"""A test copy of the content route."""',
            "",
            "PUBLIC_CONTENT: dict[str, str] = {",
        ]
        lines += [f"    {name!r}: {filename!r}," for name, filename in entries.items()]
        lines.append("}")
        path = self.base / "server" / "routes" / "content.py"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def lint(self, today: str = TODAY) -> Run:
        code = lint_content.main(["--root", str(self.root), "--today", today])
        captured = self.capsys.readouterr()
        return Run(code, captured.out, captured.err)


@pytest.fixture
def tree(tmp_path, capsys) -> Tree:
    return Tree(tmp_path, capsys)


def find_lines(run: Run, severity: str, path: str, *fragments: str) -> list[str]:
    """The printed lines of this severity for this path that hold every fragment."""
    start = f"{severity} {path}"
    return [
        line for line in run.lines if line.startswith(start) and all(f in line for f in fragments)
    ]


def assert_finding(run: Run, severity: str, path: str, *fragments: str) -> None:
    found = find_lines(run, severity, path, *fragments)
    assert found, f"no {severity} for {path} with {fragments}. The linter printed:\n{run.out}"


def assert_no_finding(run: Run, severity: str, path: str, *fragments: str) -> None:
    found = find_lines(run, severity, path, *fragments)
    assert not found, f"unexpected {severity} for {path} with {fragments}:\n{found}"


def assert_only_notes(run: Run) -> None:
    problems = [line for line in run.lines if line.startswith(("ERROR", "WARNING"))]
    assert not problems, f"expected a clean run, but the linter printed:\n{run.out}"
    assert run.code == 0


# ---------------------------------------------------------------------------------------------
# A clean folder, the summary and the exit codes
# ---------------------------------------------------------------------------------------------


def test_a_valid_folder_passes_with_exit_code_0(tree):
    run = tree.lint()

    assert_only_notes(run)


def test_the_summary_line_counts_errors_warnings_and_files(tree):
    run = tree.lint()

    assert run.lines[-1] == "Content check: 0 errors, 0 warnings, 6 files."


def test_the_summary_says_error_and_warning_in_the_singular_for_one(tree):
    tree.write_text("broken.json", "{")
    tree.write_json("other.json", {"fine": True})

    run = tree.lint()

    assert run.lines[-1] == "Content check: 1 error, 1 warning, 8 files."


def test_one_error_makes_the_exit_code_1(tree):
    tree.write_text("broken.json", "{")

    run = tree.lint()

    assert run.code == 1


def test_a_warning_alone_keeps_the_exit_code_0(tree):
    tree.write_json("other.json", {"fine": True})

    run = tree.lint()

    assert_finding(run, "WARNING", "content/other.json", "no schema yet")
    assert run.code == 0


def test_a_missing_root_is_exit_code_2_with_a_message_on_stderr(tmp_path, capsys):
    code = lint_content.main(["--root", str(tmp_path / "no-such-folder")])

    assert code == 2
    assert "no-such-folder" in capsys.readouterr().err


def test_a_root_that_is_a_file_is_exit_code_2(tmp_path, capsys):
    a_file = tmp_path / "content.json"
    a_file.write_text("{}", encoding="utf-8")

    assert lint_content.main(["--root", str(a_file)]) == 2


def test_a_bad_day_for_today_is_exit_code_2(tree):
    with pytest.raises(SystemExit) as stop:
        lint_content.main(["--root", str(tree.root), "--today", "tomorrow"])

    assert stop.value.code == 2


def test_an_unknown_option_is_exit_code_2(tree):
    with pytest.raises(SystemExit) as stop:
        lint_content.main(["--root", str(tree.root), "--fix"])

    assert stop.value.code == 2


def test_findings_are_sorted_by_file_and_the_summary_comes_last(tree):
    story = valid_story()
    story["scenes"]["cottage"]["actions"][1]["goto"] = "cellar"
    tree.write_json("story.json", story)
    tree.write_public_list({"intro-story": "story.json", "ghost": "ghost.json"})

    run = tree.lint()

    story_line = run.out.index("ERROR content/story.json")
    routes_line = run.out.index("ERROR server/routes/content.py")
    assert story_line < routes_line < run.out.index("Content check:")


def test_findings_in_one_file_are_sorted_by_line(tree):
    secret_line = f"Use {FAKE_SB_KEY} here."
    tree.write_text("README.md", f"{secret_line}\n\nA dash {EN_DASH} on line three.\n")

    run = tree.lint()

    first_secret = run.out.index("ERROR content/README.md:1:5")
    then_dash = run.out.index("ERROR content/README.md:3:8")
    assert first_secret < then_dash


# ---------------------------------------------------------------------------------------------
# L1: every JSON file parses
# ---------------------------------------------------------------------------------------------


def test_bad_json_is_an_error_with_line_and_column(tree):
    tree.write_text("market/broken.json", '{\n  "price": ,\n}\n')

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/broken.json:2:12", "not valid JSON")


def test_a_file_that_is_not_utf8_is_an_error_with_line_and_column(tree):
    path = tree.root / "latin.json"
    path.write_bytes(b'{"name": "caf\xe9"}\n')

    run = tree.lint()

    assert_finding(run, "ERROR", "content/latin.json:1:14", "UTF-8")


def test_a_repeated_key_is_an_error_with_line_and_column(tree):
    tree.write_text("twice.json", '{\n  "a": 1,\n  "a": 2\n}\n')

    run = tree.lint()

    assert_finding(run, "ERROR", "content/twice.json:3:3", 'repeated key "a"')


def test_a_repeated_key_inside_a_list_of_objects_is_found(tree):
    tree.write_text("nested.json", '{\n  "list": [\n    {"x": 1, "x": 2}\n  ]\n}\n')

    run = tree.lint()

    assert_finding(run, "ERROR", "content/nested.json:3:14", 'repeated key "x"')


def test_the_same_key_in_two_different_objects_is_fine(tree):
    tree.write_text("siblings.json", '{"a": {"x": 1}, "b": {"x": 2}, "c": [{"x": 3}, {"x": 4}]}\n')

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/siblings.json")


def test_a_key_that_is_written_twice_in_different_ways_is_still_repeated(tree):
    tree.write_text("escaped.json", '{"ab": 1, "a\\u0062": 2}\n')

    run = tree.lint()

    assert_finding(run, "ERROR", "content/escaped.json", 'repeated key "ab"')


def test_a_value_that_looks_like_a_key_is_not_a_repeat(tree):
    tree.write_text("values.json", '{"first": "name", "second": "name", "list": ["a", "a"]}\n')

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/values.json")


@pytest.mark.parametrize("constant", ["NaN", "Infinity", "-Infinity"])
def test_nan_and_infinity_are_errors_with_line_and_column(tree, constant):
    tree.write_text("numbers.json", '{\n  "price": ' + constant + "\n}\n")

    run = tree.lint()

    assert_finding(run, "ERROR", "content/numbers.json:2:12", constant)


def test_the_word_nan_inside_a_text_is_fine(tree):
    tree.write_text("words.json", '{"word": "NaN", "other": "Infinity"}\n')

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/words.json")


def test_a_file_that_does_not_parse_gets_no_second_complaint_about_its_schema(tree):
    tree.write_text("market/companies.json", "{")

    run = tree.lint()

    assert len(find_lines(run, "ERROR", "content/market/companies.json")) == 1


# ---------------------------------------------------------------------------------------------
# L2: no em or en dashes
# ---------------------------------------------------------------------------------------------


def test_an_em_dash_in_json_is_an_error_with_line_and_column(tree):
    story = valid_story()
    story["scenes"]["tower"]["text"] = f"A tall {EM_DASH} very tall {EM_DASH} tower."
    tree.write_json("story.json", story)

    run = tree.lint()

    found = find_lines(run, "ERROR", "content/story.json", "em dash")
    assert len(found) == 2
    assert found[0].startswith("ERROR content/story.json:")


def test_the_position_of_an_em_dash_counts_columns_from_1(tree):
    tree.write_text("dash.json", f'{{"a": "x {EM_DASH} y"}}\n')

    run = tree.lint()

    assert_finding(run, "ERROR", "content/dash.json:1:10", "em dash")


def test_an_en_dash_in_a_readme_is_an_error(tree):
    tree.write_text("README.md", f"# Content\n\nPages 3 {EN_DASH} 5.\n")

    run = tree.lint()

    assert_finding(run, "ERROR", "content/README.md:3:9", "en dash")


def test_a_dash_written_as_a_json_escape_is_found_too(tree):
    tree.write_text("escaped-dash.json", '{"a": "x \\u2014 y", "b": "x \\u2013 y"}\n')

    run = tree.lint()

    assert_finding(run, "ERROR", "content/escaped-dash.json:1:10", "em dash")
    assert_finding(run, "ERROR", "content/escaped-dash.json:1:29", "en dash")


def test_a_plain_hyphen_is_fine(tree):
    tree.write_text("README.md", "# Content\n\nA well-known harbor - near the pier.\n")

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/README.md")


def test_dashes_are_also_found_in_weather_files(tree):
    tree.write_json("weather/sample.json", {"note": f"dry {EM_DASH} sunny"})

    run = tree.lint()

    assert_finding(run, "ERROR", "content/weather/sample.json", "em dash")


# ---------------------------------------------------------------------------------------------
# L3: required fields. Known files have a schema, weather files are parsed only.
# ---------------------------------------------------------------------------------------------


def test_a_json_file_without_a_schema_gets_a_warning(tree):
    tree.write_json("partners.json", {"lines": []})

    run = tree.lint()

    assert_finding(run, "WARNING", "content/partners.json", "no schema yet")


def test_weather_files_are_only_parsed_and_get_no_warning(tree):
    run = tree.lint()

    assert_no_finding(run, "WARNING", "content/weather/recorded-fallback.json")


def test_a_story_scene_without_text_is_an_error(tree):
    story = valid_story()
    del story["scenes"]["cottage"]["text"]
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "scenes.cottage.text", "is missing")


def test_a_story_without_a_title_is_an_error(tree):
    story = valid_story()
    del story["title"]
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "title", "is missing")


@pytest.mark.parametrize("field", ["id", "label", "message"])
def test_a_story_action_needs_an_id_a_label_and_a_message(tree, field):
    story = valid_story()
    del story["scenes"]["cottage"]["actions"][0][field]
    tree.write_json("story.json", story)

    run = tree.lint()

    where = f"scenes.cottage.actions[0].{field}"
    assert_finding(run, "ERROR", "content/story.json", where, "is missing")


def test_a_story_item_needs_a_name_and_a_description(tree):
    story = valid_story()
    del story["items"]["brass_key"]["description"]
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "items.brass_key.description")


@pytest.mark.parametrize("key", ["items", "scenes"])
def test_story_items_and_scenes_must_be_objects(tree, key):
    story = valid_story()
    story[key] = ["not", "an", "object"]
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", key, "must be an object")


def test_a_story_set_list_must_hold_texts(tree):
    story = valid_story()
    story["scenes"]["cottage"]["actions"][0]["set"] = "took_key"
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "actions[0].set", "list of texts")


def test_a_story_that_is_not_an_object_is_an_error(tree):
    tree.write_text("story.json", "[1, 2, 3]\n")

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "must be an object")


@pytest.mark.parametrize(
    "field, value, fragment",
    [
        ("id", "Apple Inc", "lowercase letters, digits and hyphens"),
        ("id", "a", "2 to 40 characters"),
        ("name", "N" * 41, "2 to 40 characters"),
        ("ticker", "aapl", "capital letters and digits"),
        ("ticker", "TOOLONG", "1 to 6 characters"),
        ("kind", "bond", '"island" or "stock"'),
        ("follows", "x", "2 to 60 characters"),
        ("currency", "usd", "3 to 5 capital letters"),
        ("currency", "DOLLAR", "3 to 5 capital letters"),
        ("tagline", "", "1 to 120 characters"),
        ("tagline", "t" * 121, "1 to 120 characters"),
        ("priceDecimals", 9, "whole number from 0 to 8"),
        ("priceDecimals", -1, "whole number from 0 to 8"),
        ("priceDecimals", "2", "whole number from 0 to 8"),
        ("priceDecimals", True, "whole number from 0 to 8"),
        ("priceDecimals", 2.5, "whole number from 0 to 8"),
        ("name", 42, "must be text"),
    ],
)
def test_a_company_field_in_the_wrong_shape_is_an_error(tree, field, value, fragment):
    companies = valid_companies()
    companies["companies"][2][field] = value
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", f"companies[2].{field}", fragment)


@pytest.mark.parametrize(
    "field", ["id", "name", "ticker", "kind", "follows", "market", "currency", "priceDecimals"]
)
def test_a_company_with_a_missing_field_is_an_error(tree, field):
    companies = valid_companies()
    del companies["companies"][2][field]
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(
        run, "ERROR", "content/market/companies.json", f"companies[2].{field}", "missing"
    )


def test_a_company_without_a_tagline_is_an_error(tree):
    companies = valid_companies()
    del companies["companies"][0]["tagline"]
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies[0].tagline")


@pytest.mark.parametrize("field", ["about", "nameCheck"])
def test_the_companies_file_keeps_its_about_and_name_check_texts(tree, field):
    companies = valid_companies()
    del companies[field]
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", field, "is missing")


def test_an_island_company_needs_a_binance_pair(tree):
    companies = valid_companies()
    del companies["companies"][0]["symbol"]
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies[0].symbol", "missing")


def test_a_binance_pair_must_be_capital_letters_and_digits(tree):
    companies = valid_companies()
    companies["companies"][0]["symbol"] = "btcusdt"
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies[0].symbol")


def test_a_stock_company_must_not_have_a_binance_pair(tree):
    companies = valid_companies()
    companies["companies"][2]["symbol"] = "AAPLUSDT"
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies[2].symbol", "stock")


def test_an_island_company_trades_in_the_always_open_market(tree):
    companies = valid_companies()
    companies["companies"][0]["market"] = "us"
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies[0].market", "always")


def test_the_delist_flag_must_be_true_when_present(tree):
    companies = valid_companies()
    companies["companies"][1]["delistAtRelighting"] = "yes"
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "delistAtRelighting", "true")


def test_the_companies_list_must_be_a_list(tree):
    companies = valid_companies()
    companies["companies"] = {"harbor-trust": {}}
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies", "must be a list")


@pytest.mark.parametrize("field", ["validFrom", "validTo"])
def test_a_calendar_date_must_look_like_year_month_day(tree, field):
    calendars = valid_calendars()
    calendars[field] = "31/12/2026"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", field, "YYYY-MM-DD")


def test_a_calendar_date_that_does_not_exist_is_an_error(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["closedDays"][0]["date"] = "2026-11-31"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "closedDays[0].date")


@pytest.mark.parametrize("field", ["id", "name", "timeZone", "utcOffset", "opens", "closes"])
def test_a_calendar_market_with_a_missing_field_is_an_error(tree, field):
    calendars = valid_calendars()
    del calendars["markets"][0][field]
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", f"markets[0].{field}", "missing")


@pytest.mark.parametrize(
    "field, value", [("opens", "9:30"), ("closes", "25:00"), ("opens", "0930")]
)
def test_an_opening_time_must_look_like_hours_and_minutes(tree, field, value):
    calendars = valid_calendars()
    calendars["markets"][0][field] = value
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", f"markets[0].{field}", "HH:MM")


@pytest.mark.parametrize("value", ["-5", "UTC-05:00", "05:00", "+25:00"])
def test_a_utc_offset_must_look_like_plus_or_minus_hours_and_minutes(tree, value):
    calendars = valid_calendars()
    calendars["markets"][0]["utcOffset"] = value
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "markets[0].utcOffset", "+HH:MM")


def test_a_market_must_open_before_it_closes(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["opens"] = "17:00"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "markets[0].closes", "after")


def test_a_closed_day_needs_a_name(tree):
    calendars = valid_calendars()
    del calendars["markets"][0]["closedDays"][0]["name"]
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "closedDays[0].name", "missing")


def test_a_short_day_needs_a_closing_time(tree):
    calendars = valid_calendars()
    del calendars["markets"][0]["shortDays"][1]["closes"]
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "shortDays[1].closes", "missing")


def test_a_market_may_leave_out_its_lists_of_closed_and_short_days(tree):
    calendars = valid_calendars()
    del calendars["markets"][0]["closedDays"]
    del calendars["markets"][0]["shortDays"]
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_only_notes(run)


def test_a_calendar_source_must_be_an_https_address_when_present(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["source"] = "www.nyse.com"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "markets[0].source", "https://")


def test_a_calendar_needs_at_least_one_market(tree):
    calendars = valid_calendars()
    calendars["markets"] = []
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "markets", "at least one")


@pytest.mark.parametrize("field", ["credit", "licence", "licenceUrl", "candles", "candleSeconds"])
def test_a_replay_file_with_a_missing_field_is_an_error(tree, field):
    replay = valid_replay()
    del replay[field]
    tree.write_json("market/replay.json", replay)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/replay.json", field, "is missing")


def test_a_replay_file_without_prices_is_an_error(tree):
    replay = valid_replay()
    del replay["closes"]
    tree.write_json("market/replay.json", replay)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/replay.json", "closes", "is missing")


def test_the_replay_licence_address_must_be_https(tree):
    replay = valid_replay()
    replay["licenceUrl"] = "http://creativecommons.org/licenses/by-nc-sa/4.0/"
    tree.write_json("market/replay.json", replay)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/replay.json", "licenceUrl", "https://")


@pytest.mark.parametrize("field", ["candles", "candleSeconds"])
def test_replay_counts_must_be_whole_numbers_above_zero(tree, field):
    replay = valid_replay()
    replay[field] = 0
    tree.write_json("market/replay.json", replay)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/replay.json", field, "whole number above 0")


# ---------------------------------------------------------------------------------------------
# L4: ids are unique and exist
# ---------------------------------------------------------------------------------------------


def test_a_story_start_must_name_a_scene(tree):
    story = valid_story()
    story["start"] = "nowhere"
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "start", "no scene")


def test_a_goto_to_a_missing_scene_is_an_error(tree):
    story = valid_story()
    story["scenes"]["cottage"]["actions"][1]["goto"] = "cellar"
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "scenes.cottage.actions[1].goto", "cellar")


def test_a_take_of_a_missing_item_is_an_error(tree):
    story = valid_story()
    story["scenes"]["cottage"]["actions"][0]["take"] = "silver_key"
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "actions[0].take", "silver_key")


@pytest.mark.parametrize("condition", ["has", "missing"])
def test_a_condition_that_names_a_missing_item_is_an_error(tree, condition):
    story = valid_story()
    story["scenes"]["cottage"]["actions"][1]["requires"][condition] = ["silver_key"]
    tree.write_json("story.json", story)

    run = tree.lint()

    where = f"actions[1].requires.{condition}[0]"
    assert_finding(run, "ERROR", "content/story.json", where, "silver_key")


def test_a_note_condition_that_names_a_missing_item_is_an_error(tree):
    story = valid_story()
    story["scenes"]["cottage"]["notes"][0]["when"]["has"] = ["silver_key"]
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "notes[0].when.has[0]", "silver_key")


@pytest.mark.parametrize("condition", ["flags", "not_flags"])
def test_a_flag_that_no_action_sets_is_an_error(tree, condition):
    story = valid_story()
    story["scenes"]["cottage"]["actions"][1]["requires"][condition] = ["never_set"]
    tree.write_json("story.json", story)

    run = tree.lint()

    where = f"actions[1].requires.{condition}[0]"
    assert_finding(run, "ERROR", "content/story.json", where, "never_set", "no action sets")


def test_a_note_that_waits_for_a_flag_nobody_sets_is_an_error(tree):
    story = valid_story()
    story["scenes"]["cottage"]["notes"][0]["when"]["flags"] = ["never_set"]
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "notes[0].when.flags[0]", "never_set")


def test_a_flag_that_is_set_in_another_scene_counts_as_set(tree):
    story = valid_story()
    story["scenes"]["tower"]["actions"] = [
        {"id": "ring_bell", "label": "Ring", "set": ["bell_rung"], "message": "Ding."}
    ]
    story["scenes"]["cottage"]["notes"][0]["when"]["flags"] = ["bell_rung"]
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/story.json")


def test_two_actions_with_the_same_id_in_one_scene_are_an_error(tree):
    story = valid_story()
    story["scenes"]["cottage"]["actions"][1]["id"] = "take_key"
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "actions[1].id", 'action id "take_key"')


def test_two_actions_with_the_same_id_in_two_scenes_are_an_error(tree):
    story = valid_story()
    story["scenes"]["tower"]["actions"] = [{"id": "take_key", "label": "x", "message": "y"}]
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "scenes.tower.actions[0].id", "take_key")


def test_a_flag_that_is_set_but_never_used_is_only_a_warning(tree):
    story = valid_story()
    story["scenes"]["cottage"]["actions"][0]["set"] = ["took_key", "forgotten"]
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "WARNING", "content/story.json", "actions[0].set[1]", "forgotten")
    assert run.code == 0


def test_a_duplicate_company_id_is_an_error(tree):
    companies = valid_companies()
    companies["companies"][2]["id"] = "harbor-trust"
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies[2].id", "duplicate")


def test_a_duplicate_company_ticker_is_an_error(tree):
    companies = valid_companies()
    companies["companies"][2]["ticker"] = "SHT"
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(
        run, "ERROR", "content/market/companies.json", "companies[2].ticker", "duplicate"
    )


def test_a_duplicate_binance_pair_is_an_error(tree):
    companies = valid_companies()
    companies["companies"][1]["symbol"] = "BTCUSDT"
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(
        run, "ERROR", "content/market/companies.json", "companies[1].symbol", "duplicate"
    )


def test_a_stock_in_a_market_without_a_calendar_is_an_error(tree):
    companies = valid_companies()
    companies["companies"][2]["market"] = "mars"
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies[2].market", "mars")


def test_a_stock_needs_the_calendars_file_to_exist(tree):
    (tree.root / "market" / "calendars.json").unlink()

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies[2].market", "us")


def test_a_companies_file_with_21_companies_is_an_error(tree):
    tree.write_json("market/companies.json", companies_with(21))

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies", "at most 20")


def test_a_companies_file_with_20_companies_is_fine(tree):
    tree.write_json("market/companies.json", companies_with(20))

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/market/companies.json")


def test_a_companies_file_must_list_at_least_one_company(tree):
    companies = valid_companies()
    companies["companies"] = []
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies", "at least one")


def test_only_greyfathom_may_be_delisted_at_the_relighting(tree):
    companies = valid_companies()
    companies["companies"][0]["delistAtRelighting"] = True
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/companies.json", "companies[0]", "greyfathom")


def test_a_duplicate_calendar_market_id_is_an_error(tree):
    calendars = valid_calendars()
    calendars["markets"].append(dict(calendars["markets"][0]))
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "markets[1].id", "duplicate")


def test_the_valid_from_day_must_not_be_after_the_valid_to_day(tree):
    calendars = valid_calendars()
    calendars["validFrom"] = "2027-01-01"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "validTo", "before")


@pytest.mark.parametrize("date", ["2026-11-05", "2027-01-01"])
def test_a_closed_day_outside_the_calendar_window_is_an_error(tree, date):
    calendars = valid_calendars()
    calendars["markets"][0]["closedDays"][0]["date"] = date
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "closedDays[0].date", "outside")


def test_a_short_day_outside_the_calendar_window_is_an_error(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["shortDays"][0]["date"] = "2027-01-04"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "shortDays[0].date", "outside")


def test_the_first_and_the_last_day_of_the_window_are_inside_it(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["closedDays"][0]["date"] = "2026-11-06"
    calendars["markets"][0]["closedDays"][1]["date"] = "2026-12-31"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/market/calendars.json")


def test_a_closed_day_written_twice_is_an_error(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["closedDays"][1]["date"] = "2026-11-26"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "closedDays[1].date", "twice")


def test_a_short_day_written_twice_is_an_error(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["shortDays"][1]["date"] = "2026-11-27"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "shortDays[1].date", "twice")


def test_a_closed_day_that_is_also_a_short_day_is_an_error(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["shortDays"][0]["date"] = "2026-11-26"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "shortDays[0].date", "closed day")


def test_a_short_day_may_not_close_after_the_regular_close(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["shortDays"][0]["closes"] = "17:00"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "shortDays[0].closes", "before")


def test_a_short_day_may_not_close_at_the_regular_close(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["shortDays"][0]["closes"] = "16:00"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "shortDays[0].closes", "before")


def test_a_short_day_may_not_close_before_the_market_opens(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["shortDays"][0]["closes"] = "09:30"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "shortDays[0].closes", "after")


@pytest.mark.parametrize("date, weekday", [("2026-11-28", "Saturday"), ("2026-11-29", "Sunday")])
def test_a_closed_day_on_a_weekend_is_only_a_warning(tree, date, weekday):
    calendars = valid_calendars()
    calendars["markets"][0]["closedDays"][0]["date"] = date
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "WARNING", "content/market/calendars.json", "closedDays[0].date", weekday)
    assert run.code == 0


def test_a_short_day_on_a_weekend_is_only_a_warning(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["shortDays"][0]["date"] = "2026-11-28"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "WARNING", "content/market/calendars.json", "shortDays[0].date", "Saturday")


@needs_time_zone_data
def test_a_utc_offset_that_does_not_match_the_time_zone_is_an_error(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["utcOffset"] = "+01:00"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "markets[0].utcOffset", "-05:00")


@needs_time_zone_data
def test_an_offset_that_changes_inside_the_window_is_an_error(tree):
    calendars = valid_calendars()
    calendars["validFrom"] = "2026-10-28"
    calendars["validTo"] = "2026-11-10"
    calendars["markets"][0]["closedDays"] = []
    calendars["markets"][0]["shortDays"] = []
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "utcOffset", "2026-10-28")


@needs_time_zone_data
def test_an_offset_that_matches_the_time_zone_on_every_day_is_fine(tree):
    calendars = valid_calendars()
    calendars["markets"].append(
        {
            "id": "xetra",
            "name": "Frankfurt",
            "timeZone": "Europe/Berlin",
            "utcOffset": "+01:00",
            "opens": "09:00",
            "closes": "17:30",
        }
    )
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_only_notes(run)


@needs_time_zone_data
def test_an_unknown_time_zone_name_is_an_error(tree):
    calendars = valid_calendars()
    calendars["markets"][0]["timeZone"] = "America/New_Yrok"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/calendars.json", "markets[0].timeZone", "New_Yrok")


def test_without_time_zone_data_the_offset_check_is_skipped_with_a_note(tree, monkeypatch):
    def no_data(_name):
        raise ZoneInfoNotFoundError("no time-zone data on this machine")

    monkeypatch.setattr(lint_content, "ZoneInfo", no_data)
    calendars = valid_calendars()
    calendars["markets"][0]["utcOffset"] = "+09:00"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint()

    assert_finding(run, "NOTE", "content/market/calendars.json", "time-zone data")
    assert_only_notes(run)


def test_the_replay_must_cover_every_island_pair(tree):
    replay = valid_replay()
    del replay["closes"]["PAXGUSDT"]
    tree.write_json("market/replay.json", replay)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/replay.json", "closes", "PAXGUSDT")


def test_the_replay_may_hold_pairs_that_no_company_follows(tree):
    replay = valid_replay()
    replay["closes"]["DOGEUSDT"] = [0.1, 0.2, 0.3]
    tree.write_json("market/replay.json", replay)

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/market/replay.json")


def test_stock_tickers_are_not_replay_pairs(tree):
    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/market/replay.json", "AAPL")


@pytest.mark.parametrize("prices", [[1.5, 2.5], [1.5, 2.5, 3.5, 4.5]])
def test_a_replay_series_needs_exactly_as_many_prices_as_candles(tree, prices):
    replay = valid_replay()
    replay["closes"]["BTCUSDT"] = prices
    tree.write_json("market/replay.json", replay)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/replay.json", "closes.BTCUSDT", "exactly 3")


@pytest.mark.parametrize("price", [0, -1.5, "1.5", None, True])
def test_a_replay_price_must_be_a_number_above_zero(tree, price):
    replay = valid_replay()
    replay["closes"]["BTCUSDT"][1] = price
    tree.write_json("market/replay.json", replay)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/replay.json", "closes.BTCUSDT[1]", "above 0")


def test_a_replay_series_must_be_a_list(tree):
    replay = valid_replay()
    replay["closes"]["BTCUSDT"] = "1.5, 2.5, 3.5"
    tree.write_json("market/replay.json", replay)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/replay.json", "closes.BTCUSDT", "list")


def test_without_a_readable_companies_file_the_replay_is_still_checked_on_its_own(tree):
    tree.write_text("market/companies.json", "{")
    replay = valid_replay()
    replay["closes"]["BTCUSDT"] = [1.5]
    tree.write_json("market/replay.json", replay)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/market/replay.json", "closes.BTCUSDT", "exactly 3")


# ---------------------------------------------------------------------------------------------
# L5: no real personal names in game data
# ---------------------------------------------------------------------------------------------


def story_with_person(field: str, value) -> dict:
    story = valid_story()
    story["scenes"]["cottage"]["actions"][0][field] = value
    return story


@pytest.mark.parametrize(
    "field", ["speaker", "character", "person", "npc", "owner", "author", "captain"]
)
def test_a_personal_name_in_a_person_field_is_an_error(tree, field):
    tree.write_json("story.json", story_with_person(field, "John Smith"))

    run = tree.lint()

    where = f"scenes.cottage.actions[0].{field}"
    assert_finding(run, "ERROR", "content/story.json", where, "titles, not personal names")


@pytest.mark.parametrize(
    "value",
    [
        "Harbor Master",
        "The Keeper",
        "Captain-A3F9",
        "the old fisherman in the yellow coat",
        "Salvage Foreman",
        "Coastguard Commander",
        "The Stranger",
        "Informant",
        "Doorman",
        "Dockhand",
        "Day Clerk",
        "Ferry Pilot",
        "Elena Vos",
        "Elena",
    ],
)
def test_a_title_or_an_allowed_name_is_fine_in_a_person_field(tree, value):
    tree.write_json("story.json", story_with_person("speaker", value))

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/story.json")


def test_a_list_of_names_in_a_person_field_is_checked_one_by_one(tree):
    tree.write_json("story.json", story_with_person("speaker", ["Harbor Master", "John Smith"]))

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "speaker[1]", "personal names")
    assert_no_finding(run, "ERROR", "content/story.json", "speaker[0]")


def test_a_long_description_in_a_person_field_is_not_a_name(tree):
    description = "The crew model decides how the clock moves. The case only reads it."
    tree.write_json("story.json", story_with_person("owner", description))

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/story.json")


def test_a_person_field_of_exactly_8_words_is_still_checked(tree):
    tree.write_json(
        "story.json", story_with_person("owner", "John Smith and his brother and a dog")
    )

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "actions[0].owner", "personal names")


def test_a_person_field_of_9_words_counts_as_a_description(tree):
    text = "John Smith and his brother and a dog too"
    tree.write_json("story.json", story_with_person("owner", text))

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/story.json")


def test_a_title_must_be_a_whole_word(tree):
    tree.write_json("story.json", story_with_person("speaker", "Ferryman Smith"))

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "speaker", "personal names")


@pytest.mark.parametrize("container", ["partners", "suspects", "characters"])
def test_a_personal_name_inside_a_list_of_people_is_an_error(tree, container):
    story = valid_story()
    story[container] = [{"id": "someone", "name": "John Smith"}]
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", f"{container}[0].name", "personal names")


def test_a_personal_name_inside_a_table_of_people_is_an_error(tree):
    story = valid_story()
    story["characters"] = {"someone": {"name": "John Smith"}}
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "characters.someone.name", "personal names")


def test_a_name_field_outside_a_list_of_people_is_not_checked(tree):
    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/story.json", "items.brass_key.name")


def test_real_stock_company_names_are_exempt(tree):
    companies = valid_companies()
    companies["companies"][2]["name"] = "Tesla"
    tree.write_json("market/companies.json", companies)

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/market/companies.json")


def test_an_email_address_in_game_data_is_an_error(tree):
    story = valid_story()
    story["scenes"]["tower"]["text"] = "Write to someone@example.com for help."
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "scenes.tower.text", "email address")
    assert "someone@example.com" not in run.out


def test_an_at_handle_in_game_data_is_an_error(tree):
    story = valid_story()
    story["scenes"]["tower"]["text"] = "Follow @harbor_master for news."
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "scenes.tower.text", "@handle")


def test_an_email_is_one_finding_not_two(tree):
    story = valid_story()
    story["scenes"]["tower"]["text"] = "Write to someone@example.com for help."
    tree.write_json("story.json", story)

    run = tree.lint()

    assert len(find_lines(run, "ERROR", "content/story.json", "scenes.tower.text")) == 1


def test_a_lone_at_sign_is_fine(tree):
    story = valid_story()
    story["scenes"]["tower"]["text"] = "Meet at the pier @ noon."
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/story.json")


# ---------------------------------------------------------------------------------------------
# L6: nothing secret on the public list
# ---------------------------------------------------------------------------------------------


def test_a_public_name_that_serves_a_plain_json_file_is_fine(tree):
    run = tree.lint()

    assert_no_finding(run, "ERROR", "server/routes/content.py")


@pytest.mark.parametrize("filename", ["sub/story.json", "..\\story.json", "../story.json"])
def test_a_public_file_name_with_a_path_is_an_error(tree, filename):
    tree.write_public_list({"intro-story": "story.json", "extra": filename})

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py:", 'PUBLIC_CONTENT["extra"]', "plain")


def test_a_public_file_name_with_two_dots_is_an_error(tree):
    tree.write_public_list({"intro-story": "story.json", "extra": "story..json"})

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py:", 'PUBLIC_CONTENT["extra"]', "plain")


def test_a_public_file_name_with_a_leading_dot_is_an_error(tree):
    tree.write_json(".hidden.json", {"a": 1})
    tree.write_public_list({"intro-story": "story.json", "extra": ".hidden.json"})

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py:", 'PUBLIC_CONTENT["extra"]', "dot")


def test_a_public_name_that_points_into_the_secret_folder_is_an_error(tree):
    tree.write_json("secret/case.json", valid_case())
    tree.write_public_list({"intro-story": "story.json", "case": "secret/case.json"})

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py:", 'PUBLIC_CONTENT["case"]', "secret/")


def test_a_public_name_for_a_file_that_does_not_exist_is_an_error(tree):
    tree.write_public_list({"intro-story": "story.json", "ghost": "ghost.json"})

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py:", 'PUBLIC_CONTENT["ghost"]', "exist")


@pytest.mark.parametrize(
    "filename", ["secret-notes.json", "case-notes.json", "solution.json", "Answers.json"]
)
def test_a_public_file_whose_name_sounds_secret_is_an_error(tree, filename):
    tree.write_json(filename, {"a": 1})
    tree.write_public_list({"intro-story": "story.json", "extra": filename})

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py:", 'PUBLIC_CONTENT["extra"]', "name")


def test_a_public_value_that_is_not_a_plain_text_is_an_error(tree):
    path = tree.base / "server" / "routes" / "content.py"
    path.write_text(
        'PUBLIC_CONTENT = {"intro-story": "story.json", "extra": 42}\n', encoding="utf-8"
    )

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py:1:", 'PUBLIC_CONTENT["extra"]', "text")


def test_the_public_list_is_read_without_importing_the_routes_file(tree):
    path = tree.base / "server" / "routes" / "content.py"
    path.write_text(
        "import a_module_that_does_not_exist\n"
        'PUBLIC_CONTENT = {"intro-story": "story.json", "ghost": "ghost.json"}\n',
        encoding="utf-8",
    )

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py:2:", 'PUBLIC_CONTENT["ghost"]')


def test_a_plain_assignment_of_the_public_list_is_read_too(tree):
    path = tree.base / "server" / "routes" / "content.py"
    path.write_text('PUBLIC_CONTENT = {"ghost": "ghost.json"}\n', encoding="utf-8")

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py:1:", 'PUBLIC_CONTENT["ghost"]')


def test_a_routes_file_without_a_public_list_is_an_error(tree):
    path = tree.base / "server" / "routes" / "content.py"
    path.write_text("OTHER_LIST = {}\n", encoding="utf-8")

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py", "PUBLIC_CONTENT")


def test_a_routes_file_that_is_not_python_is_an_error(tree):
    path = tree.base / "server" / "routes" / "content.py"
    path.write_text("PUBLIC_CONTENT = {\n", encoding="utf-8")

    run = tree.lint()

    assert_finding(run, "ERROR", "server/routes/content.py:", "Python")


def test_a_missing_routes_file_is_a_warning_and_the_other_checks_still_run(tree):
    (tree.base / "server" / "routes" / "content.py").unlink()
    tree.write_text("broken.json", "{")

    run = tree.lint()

    assert_finding(run, "WARNING", "server/routes/content.py", "public")
    assert_finding(run, "ERROR", "content/broken.json")


@pytest.mark.parametrize(
    "secret",
    [
        FAKE_SB_KEY,
        FAKE_JWT,
        "-----BEGIN PRIVATE KEY-----",
        FAKE_SETTING,
        "SUPABASE_SERVICE_ROLE_KEY",
    ],
)
def test_a_secret_looking_string_in_content_is_an_error_and_is_not_printed(tree, secret):
    story = valid_story()
    story["scenes"]["tower"]["text"] = f"Look at this: {secret}"
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json:", "secret")
    assert secret not in run.out


def test_a_secret_looking_string_is_found_in_every_kind_of_content_file(tree):
    tree.write_text("README.md", f"Use {FAKE_SB_KEY} here.\n")
    tree.write_json("weather/sample.json", {"note": FAKE_SETTING})

    run = tree.lint()

    assert_finding(run, "ERROR", "content/README.md:1:5", "secret")
    assert_finding(run, "ERROR", "content/weather/sample.json", "secret")


def test_a_lowercase_secret_word_is_not_a_secret_string(tree):
    tree.write_text(
        "README.md", "Secret content lives in secret/, and the service role is a word.\n"
    )

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/README.md")


# ---------------------------------------------------------------------------------------------
# L7: the calendar is still valid
# ---------------------------------------------------------------------------------------------


def test_a_calendar_that_ends_in_less_than_14_days_is_a_warning(tree):
    run = tree.lint(today="2026-12-18")

    assert_finding(run, "WARNING", "content/market/calendars.json", "validTo", "13 days")
    assert run.code == 0


def test_a_calendar_that_ends_in_exactly_14_days_is_fine(tree):
    run = tree.lint(today="2026-12-17")

    assert_no_finding(run, "WARNING", "content/market/calendars.json")


def test_a_calendar_that_has_already_ended_is_a_warning(tree):
    run = tree.lint(today="2027-01-05")

    assert_finding(run, "WARNING", "content/market/calendars.json", "validTo", "ended 5 days ago")


def test_a_calendar_that_ends_today_is_a_warning(tree):
    run = tree.lint(today="2026-12-31")

    assert_finding(run, "WARNING", "content/market/calendars.json", "validTo", "0 days")


def test_a_calendar_with_a_broken_valid_to_gets_no_expiry_warning(tree):
    calendars = valid_calendars()
    calendars["validTo"] = "soon"
    tree.write_json("market/calendars.json", calendars)

    run = tree.lint(today="2027-01-05")

    assert_no_finding(run, "WARNING", "content/market/calendars.json")


# ---------------------------------------------------------------------------------------------
# L8: the case rules
# ---------------------------------------------------------------------------------------------


def test_without_a_case_file_the_linter_prints_a_note_and_skips_the_case_rules(tree):
    run = tree.lint()

    assert_finding(run, "NOTE", "content/secret/case.json", "No case file yet: case rules skipped.")
    assert run.code == 0


def test_a_valid_case_file_passes_and_prints_no_note(tree):
    tree.write_json("secret/case.json", valid_case())

    run = tree.lint()

    assert_only_notes(run)
    assert "No case file yet" not in run.out


def test_a_case_file_counts_as_a_content_file(tree):
    tree.write_json("secret/case.json", valid_case())

    run = tree.lint()

    assert run.lines[-1] == "Content check: 0 errors, 0 warnings, 7 files."


@pytest.mark.parametrize("count", [7, 9])
def test_a_case_with_the_wrong_number_of_cards_is_an_error(tree, count):
    case = valid_case()
    case["cards"] = cards_numbered(count)
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "cards", "exactly 8")


def test_a_card_id_must_be_one_of_c1_to_c8(tree):
    case = valid_case()
    case["cards"][3]["id"] = "X4"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "cards[3].id", "C1 to C8")


def test_a_card_that_is_missing_is_named(tree):
    case = valid_case()
    case["cards"][3]["id"] = "X4"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "cards", "C4 is missing")


def test_two_cards_with_the_same_id_are_an_error(tree):
    case = valid_case()
    case["cards"][4]["id"] = "C1"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "cards[4].id", "duplicate")


def test_a_card_without_an_id_is_an_error(tree):
    case = valid_case()
    del case["cards"][2]["id"]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "cards[2].id", "is missing")


@pytest.mark.parametrize("count", [3, 5])
def test_a_case_with_the_wrong_number_of_deductions_is_an_error(tree, count):
    case = valid_case()
    case["deductions"] = deductions_numbered(count)
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "deductions", "exactly 4")


def test_a_deduction_id_must_be_one_of_d1_to_d4(tree):
    case = valid_case()
    case["deductions"][0]["id"] = "D9"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "deductions[0].id", "D1 to D4")


def test_two_deductions_with_the_same_id_are_an_error(tree):
    case = valid_case()
    case["deductions"][1]["id"] = "D1"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "deductions[1].id", "duplicate")


@pytest.mark.parametrize("pair", [["C1"], ["C1", "C2", "C3"], []])
def test_a_deduction_must_name_exactly_two_cards(tree, pair):
    case = valid_case()
    case["deductions"][0]["cards"] = pair
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "deductions[0].cards", "two")


def test_a_deduction_whose_cards_are_one_text_and_not_a_list_is_an_error(tree):
    case = valid_case()
    case["deductions"][0]["cards"] = "C1,C2"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "deductions[0].cards", "list")


def test_a_deduction_must_name_two_different_cards(tree):
    case = valid_case()
    case["deductions"][0]["cards"] = ["C1", "C1"]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "deductions[0].cards", "different")


def test_a_deduction_must_name_cards_that_exist(tree):
    case = valid_case()
    case["deductions"][0]["cards"] = ["C1", "C9"]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "deductions[0].cards[1]", "card")


def test_a_card_that_is_in_no_deduction_is_an_error(tree):
    case = valid_case()
    case["deductions"][0]["cards"] = ["C2", "C3"]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "deductions", "C1 is in no deduction")


def test_a_card_that_is_in_two_deductions_is_an_error(tree):
    case = valid_case()
    case["deductions"][0]["cards"] = ["C2", "C3"]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "deductions", "C3 is in 2 deductions")


def test_two_suspects_with_the_same_id_are_an_error(tree):
    case = valid_case()
    case["suspects"][2]["id"] = "fisherman"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "suspects[2].id", "duplicate")


def test_a_suspect_without_an_id_is_an_error(tree):
    case = valid_case()
    del case["suspects"][0]["id"]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "suspects[0].id", "is missing")


def test_the_culprit_must_be_a_known_suspect(tree):
    case = valid_case()
    case["accusation"]["culprit"] = "mayor"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "accusation.culprit", "suspects")


def test_a_case_without_a_culprit_is_an_error(tree):
    case = valid_case()
    del case["accusation"]["culprit"]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "culprit", "is missing")


def test_the_culprit_is_never_printed(tree):
    case = valid_case()
    case["accusation"]["culprit"] = "Mayor Hale"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "accusation.culprit")
    assert "Hale" not in run.out


def test_two_routes_with_the_same_id_are_an_error(tree):
    case = valid_case()
    case["cards"][1]["routes"][0]["id"] = "C1.look"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "cards[1].routes[0].id", "duplicate")


def test_a_route_without_an_id_is_an_error(tree):
    case = valid_case()
    del case["cards"][1]["routes"][0]["id"]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "cards[1].routes[0].id", "is missing")


@pytest.mark.parametrize("price", [-1, 2.5, "10", True])
def test_a_route_price_must_be_a_whole_number_of_coins_from_0(tree, price):
    case = valid_case()
    case["cards"][1]["routes"][0]["coins"] = price
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "cards[1].routes[0].coins", "whole")


@pytest.mark.parametrize("field", ["timer_minutes", "estimate_minutes"])
def test_route_minutes_must_be_a_number_from_0(tree, field):
    case = valid_case()
    case["cards"][1]["routes"][0][field] = -3
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", f"cards[1].routes[0].{field}", "0")


def test_route_minutes_may_have_a_fraction(tree):
    case = valid_case()
    case["cards"][1]["routes"][0]["timer_minutes"] = 2.5
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/secret/case.json")


def test_the_flat_shape_with_routes_at_the_top_and_a_card_id_works_too(tree):
    tree.write_json("secret/case.json", flat_case())

    run = tree.lint()

    assert_only_notes(run)


def test_a_flat_route_must_name_a_card_that_exists(tree):
    case = valid_case()
    case["routes"] = [{"id": "r1", "cardId": "C9", "price": 0, "minutes": 3}]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "routes[0].cardId", "card")


def test_a_flat_route_price_and_minutes_are_checked(tree):
    case = valid_case()
    case["routes"] = [{"id": "r1", "cardId": "C1", "price": -5, "minutes": -1}]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "routes[0].price")
    assert_finding(run, "ERROR", "content/secret/case.json", "routes[0].minutes")


def test_a_flat_route_id_must_not_repeat_an_id_inside_a_card(tree):
    case = valid_case()
    case["routes"] = [{"id": "C1.look", "cardId": "C1", "price": 0, "minutes": 3}]
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "routes[0].id", "duplicate")


def test_a_share_route_must_name_a_company_in_the_companies_file(tree):
    case = valid_case()
    case["cards"][5]["routes"][0]["needs_share"] = "greyfathom-salvage"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_only_notes(run)


def test_a_share_route_that_names_an_unknown_company_is_an_error(tree):
    case = valid_case()
    case["cards"][5]["routes"][0]["needs_share"] = "greyfathom-salvag"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "cards[5].routes[0].needs_share")


def test_a_share_route_is_not_checked_when_the_companies_file_cannot_be_read(tree):
    tree.write_text("market/companies.json", "{")
    case = valid_case()
    case["cards"][5]["routes"][0]["needs_share"] = "anything"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/secret/case.json")


def test_a_case_file_that_is_not_an_object_is_an_error(tree):
    tree.write_text("secret/case.json", "[]\n")

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "must be an object")


CASE_SENTENCE = "The ledger shows a second key was cut on the night of the storm."


def case_and_story_that_share(sentence: str) -> tuple[dict, dict]:
    case = valid_case()
    case["cards"][0]["text"] = sentence
    story = valid_story()
    story["scenes"]["tower"]["text"] = f"A note on the wall: {sentence}"
    return case, story


def test_case_text_that_appears_in_a_public_file_is_an_error(tree):
    case, story = case_and_story_that_share(CASE_SENTENCE)
    tree.write_json("secret/case.json", case)
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "scenes.tower.text", "secret case file")


def test_the_spoiler_message_points_to_the_place_in_the_case_but_not_to_its_text(tree):
    case, story = case_and_story_that_share(CASE_SENTENCE)
    tree.write_json("secret/case.json", case)
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "cards[0].text")
    assert "ledger" not in run.out
    assert "second key" not in run.out


def test_case_text_of_exactly_20_characters_may_appear_in_a_public_file(tree):
    case, story = case_and_story_that_share("a" * 20)
    tree.write_json("secret/case.json", case)
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/story.json")


def test_case_text_of_21_characters_may_not_appear_in_a_public_file(tree):
    case, story = case_and_story_that_share("a" * 21)
    tree.write_json("secret/case.json", case)
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "secret case file")


def test_the_spoiler_check_ignores_case_and_extra_spaces(tree):
    case, story = case_and_story_that_share(CASE_SENTENCE)
    story["scenes"]["tower"]["text"] = (
        "THE LEDGER  shows a second key was  cut on the night of the storm."
    )
    tree.write_json("secret/case.json", case)
    tree.write_json("story.json", story)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/story.json", "secret case file")


def test_case_text_in_a_file_that_is_not_public_is_not_a_spoiler(tree):
    case = valid_case()
    case["cards"][0]["text"] = CASE_SENTENCE
    tree.write_json("secret/case.json", case)
    tree.write_text("README.md", f"# Content\n\n{CASE_SENTENCE}\n")

    run = tree.lint()

    assert_no_finding(run, "ERROR", "content/README.md")


def test_the_spoiler_check_covers_every_file_on_the_public_list(tree):
    case = valid_case()
    case["cards"][0]["text"] = CASE_SENTENCE
    tree.write_json("secret/case.json", case)
    tree.write_json("extra.json", {"line": CASE_SENTENCE})
    tree.write_public_list({"intro-story": "story.json", "extra": "extra.json"})

    run = tree.lint()

    assert_finding(run, "ERROR", "content/extra.json", "line", "secret case file")


def test_text_from_the_case_file_is_never_printed_in_other_messages_either(tree):
    case = valid_case()
    case["cards"][0]["speaker"] = "John Smith"
    case["cards"][0]["text"] = f"Mail it to someone@example.com. {CASE_SENTENCE}"
    tree.write_json("secret/case.json", case)

    run = tree.lint()

    assert_finding(run, "ERROR", "content/secret/case.json", "cards[0].speaker", "personal names")
    assert_finding(run, "ERROR", "content/secret/case.json", "cards[0].text", "email address")
    assert "John Smith" not in run.out
    assert "someone@example.com" not in run.out


# ---------------------------------------------------------------------------------------------
# The script itself: where it runs, what it imports, and the real content folder
# ---------------------------------------------------------------------------------------------


def test_the_default_root_is_the_content_folder_next_to_the_server_folder():
    assert lint_content.DEFAULT_ROOT == BACKEND / "content"


def run_script(tree: Tree) -> subprocess.CompletedProcess:
    """Start the linter the way a person does: python, then the file name."""
    arguments = [sys.executable, "-I", str(SCRIPT), "--root", str(tree.root), "--today", TODAY]
    return subprocess.run(arguments, capture_output=True, text=True, check=False)


def test_the_script_runs_by_its_file_name_and_exits_0_for_clean_content(tree):
    result = run_script(tree)

    assert result.returncode == 0
    assert "Content check: 0 errors" in result.stdout


def test_the_script_runs_by_its_file_name_and_exits_1_when_there_is_an_error(tree):
    tree.write_text("broken.json", "{")

    result = run_script(tree)

    assert result.returncode == 1
    assert "ERROR content/broken.json" in result.stdout


def test_the_script_without_a_root_finds_the_content_folder_from_any_folder(tmp_path):
    arguments = [sys.executable, "-I", str(SCRIPT), "--today", TODAY]
    run = subprocess.run(arguments, capture_output=True, text=True, cwd=tmp_path, check=False)

    assert "Content check:" in run.stdout
    assert run.returncode in (0, 1)


@pytest.mark.parametrize("check", [f"L{number}" for number in range(1, 9)])
def test_the_header_comment_lists_every_check(check):
    assert f"  {check}  " in lint_content.__doc__


@pytest.mark.parametrize(
    "promise",
    ["--root", "--today", "Exit codes", "ERROR content/", "WARNING content/", "NOTE content/"],
)
def test_the_header_comment_describes_the_options_the_output_and_the_exit_codes(promise):
    assert promise in lint_content.__doc__


def imported_module_names(source: str) -> set[str]:
    names = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            names.add(node.module.split(".")[0])
    return names


def test_the_linter_imports_only_the_standard_library():
    names = imported_module_names(SCRIPT.read_text(encoding="utf-8"))

    assert names
    assert names <= set(sys.stdlib_module_names)


def test_the_linter_never_imports_the_server_or_fastapi():
    names = imported_module_names(SCRIPT.read_text(encoding="utf-8"))

    assert not names & {"server", "fastapi", "pydantic", "httpx", "plot_twist"}


def test_the_linter_source_holds_no_em_or_en_dash():
    source = SCRIPT.read_text(encoding="utf-8")

    assert EM_DASH not in source
    assert EN_DASH not in source


def test_the_real_content_folder_passes_with_no_errors(capsys):
    code = lint_content.main(["--today", TODAY])

    out = capsys.readouterr().out
    assert code == 0, out
    assert "Content check: 0 errors" in out
