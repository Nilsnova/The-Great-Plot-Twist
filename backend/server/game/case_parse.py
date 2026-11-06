"""Convert the private case file into immutable records without changing its content.

Used by: case_data.py. Rule checks are separate so mutations can test each rule directly.
"""

from types import MappingProxyType
from typing import Any

from server.game.case_read import Reader, freeze
from server.game.case_types import (
    Accusation,
    Board,
    Card,
    CaseData,
    Chart,
    CoinReward,
    Deduction,
    EntryProfile,
    Hotspot,
    Kit,
    Light,
    Night,
    PaidRoutes,
    Partners,
    Place,
    Reveal,
    RevealLine,
    Rewards,
    Route,
    Suspect,
    Window,
)


def read_kit(row: Reader) -> Kit:
    return Kit(
        row.text("id"),
        row.text("name"),
        row.text("starts_at"),
        row.text("home"),
        row.integer("start_coins"),
        row.text("cheap_card"),
        row.lines("act1_end"),
        row.lines("kit_item"),
    )


def read_place(row: Reader) -> Place:
    hotspots = tuple(
        Hotspot(
            spot.text("id"),
            spot.text("name"),
            spot.optional_text("card"),
            spot.optional_text("light"),
        )
        for spot in row.objects("hotspots")
    )
    return Place(row.text("id"), row.text("name"), hotspots)


def read_route(row: Reader, card_id: str) -> Route:
    return Route(
        card_id,
        row.text("id"),
        row.text("kind"),
        row.text("place"),
        row.text("hotspot"),
        row.optional_text("kit"),
        row.boolean("players_only"),
        row.integer("coins"),
        row.text("open_when"),
        row.integer("timer_minutes"),
        row.integer("estimate_minutes"),
        row.text("found_line"),
        row.optional_text("label"),
        row.optional_text("needs_share"),
        row.optional_text("needs_profile"),
        row.optional_text("needs_world"),
        row.boolean("starts_in_journal", False),
        row.optional_text("needs_flag"),
    )


def read_card(row: Reader) -> Card:
    card_id = row.text("id")
    return Card(
        card_id,
        row.text("title"),
        row.text("deduction"),
        row.text("kind"),
        row.optional_text("cheap_for_kit"),
        row.strings("opens_after"),
        row.text("lead"),
        row.text("text"),
        tuple(read_route(route, card_id) for route in row.objects("routes")),
        row.optional_text("closed_line"),
    )


def read_deduction(row: Reader) -> Deduction:
    return Deduction(
        row.text("id"),
        row.text("name"),
        row.strings("cards"),
        row.text("finding"),
        row.optional_text("clears"),
        row.optional_text("clear_line"),
        row.strings("opens"),
        row.optional_text("opens_line"),
    )


def read_chart(row: Reader) -> Chart:
    fog = row.object("fog_bank")
    schooner = row.object("schooner")
    return Chart(
        row.pair("size"),
        fog.pair("center"),
        fog.integer("radius"),
        schooner.integer("max_offset_from_fog_center"),
        row.integer("min_degrees_between_fixed_lights"),
    )


def read_light(row: Reader) -> Light:
    return Light(
        row.text("id"),
        row.text("name"),
        row.text("tier"),
        row.text("place"),
        row.text("hotspot"),
        row.pair("chart_xy"),
        freeze(row.read("ready", dict)),
        row.boolean("partners_may_man"),
        row.integer("planning_price_coins"),
    )


def read_night(row: Reader) -> Night:
    return Night(
        row.strings("opens_after"),
        row.integer("night_minutes"),
        row.integer("dawn_wait_minutes"),
        row.integer("lights_needed"),
        row.integer("lock_seconds"),
        row.integer("tolerance_degrees"),
        row.integer("relock_wait_seconds"),
        row.integer("climb_minutes"),
        read_chart(row.object("chart")),
        tuple(read_light(light) for light in row.objects("lights")),
        row.lines("lines"),
    )


def read_accusation(row: Reader) -> Accusation:
    return Accusation(
        row.strings("needs_deductions"),
        row.boolean("needs_schooner_found"),
        row.strings("suspects"),
        row.text("culprit"),
        row.integer("wrong_wait_seconds"),
        row.lines("lines"),
    )


def read_line(row: Reader, line_id: str) -> RevealLine:
    return RevealLine(line_id, row.text("text"), row.strings("cites"))


def read_reveal(row: Reader) -> Reveal:
    closings = row.read("closing_lines", dict)
    return Reveal(
        tuple(read_line(line, line.text("id")) for line in row.objects("lines")),
        MappingProxyType(
            {
                key: read_line(Reader(value, f"reveal.closing_lines[{index}]"), "closing_line")
                for index, (key, value) in enumerate(closings.items())
            }
        ),
        read_line(row.object("log_reader_line"), "log_reader_line"),
        read_line(row.object("last_beat"), "last_beat"),
        row.strings("order"),
    )


def read_coin(row: Reader) -> CoinReward:
    return CoinReward(
        row.text("id"),
        row.text("reason"),
        row.text("ref"),
        row.integer("amount", 0),
        row.integer("base", 0),
        row.integer("per_deduction_part", 0),
        row.integer("finale_role", 0),
        row.integer("max", 0),
        row.integer("max_per_player", 1),
    )


def read_rewards(row: Reader) -> Rewards:
    paid = row.object("paid_routes")
    # The content file appends an explanatory sentence after the partner ref's comma.
    # Keep the template in the typed record and preserve the complete field in raw.
    partner_ref = paid.text("partner_ref").split(",", 1)[0]
    return Rewards(
        tuple(read_coin(coin) for coin in row.objects("coins")),
        PaidRoutes(paid.text("reason"), paid.text("player_ref"), partner_ref),
    )


def parse_case(raw: dict[str, Any]) -> CaseData:
    root = Reader(raw, "case.json")
    board = root.object("board")
    windows = root.object("case_clock").read("windows", dict)
    partners = root.object("partners")
    # Child locations start at their top-level key, matching the documented case schema.
    root.place = ""
    return CaseData(
        root.integer("format_version"),
        root.text("case_id"),
        tuple(read_kit(row) for row in root.objects("kits")),
        tuple(
            EntryProfile(row.text("id"), row.text("kit"), row.boolean("read_log"))
            for row in root.objects("entry_profiles")
        ),
        tuple(read_place(row) for row in root.objects("places")),
        tuple(
            Suspect(
                row.text("id"),
                row.text("title"),
                row.text("on_the_surface"),
                row.optional_text("cleared_by"),
                row.optional_text("refused_line"),
            )
            for row in root.objects("suspects")
        ),
        tuple(read_card(row) for row in root.objects("cards")),
        tuple(read_deduction(row) for row in root.objects("deductions")),
        tuple(
            Window(
                key,
                row.integer("every_minutes"),
                row.integer("from_minute"),
                row.integer("open_minutes"),
                row.text("closed_line"),
            )
            for index, (key, value) in enumerate(windows.items())
            for row in (Reader(value, f"case_clock.windows[{index}]"),)
        ),
        Board(
            board.integer("player_pin_minutes"),
            board.integer("wrong_pair_wait_seconds"),
            board.boolean("pair_needs_two_seats"),
            board.lines("lines"),
        ),
        read_night(root.object("night")),
        read_accusation(root.object("accusation")),
        read_reveal(root.object("reveal")),
        read_rewards(root.object("rewards")),
        Partners(
            partners.strings("kit_order"),
            partners.strings("may_use_route_kinds"),
            partners.strings("never_use_route_kinds"),
            partners.strings("may_man_lights"),
        ),
        freeze(raw),
    )
