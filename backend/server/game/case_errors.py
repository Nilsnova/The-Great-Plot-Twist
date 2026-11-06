"""Case content errors name a rule and field location without repeating protected content.

Used by: the case loader and load-time checks.
"""


class CaseDataError(ValueError):
    def __init__(self, rule: str, place: str, problem: str) -> None:
        self.rule = rule
        self.place = place
        self.problem = problem
        super().__init__(f"{rule} at {place}: {problem}")


def require(rule: str, place: str, condition: bool, problem: str) -> None:
    if not condition:
        raise CaseDataError(rule, place, problem)
