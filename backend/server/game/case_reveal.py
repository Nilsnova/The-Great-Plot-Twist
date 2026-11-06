"""Build the ordered reveal for an authorized solver, using only server-side content.

Used by: case_view.py after it finds the viewer's solver row for the current crew.
"""

from server.game.case_data import CaseData, RevealLine


def _line(line: RevealLine, line_id: str, kind: str) -> dict:
    return {"id": line_id, "kind": kind, "text": line.text, "cites": list(line.cites)}


def reveal_lines(data: CaseData, kit: str, read_log: bool) -> list[dict]:
    """Follow content order, selecting the viewer's closing and optional log lines."""
    named = {line.id: line for line in data.reveal.lines}
    result = []
    for line_id in data.reveal.order:
        if line_id == "closing_line":
            result.append(_line(data.reveal.closing_lines[kit], line_id, "closing"))
        elif line_id == "log_reader_line":
            if read_log:
                result.append(_line(data.reveal.log_reader_line, line_id, "log"))
        elif line_id == "last_beat":
            result.append(_line(data.reveal.last_beat, line_id, "last"))
        else:
            kind = {"unmask": "unmasking", "twist": "twist"}.get(line_id, "evidence")
            result.append(_line(named[line_id], line_id, kind))
    return result
