"""Board/finale intents reject forged facts and malformed bearings before service calls."""

import pytest
from pydantic import ValidationError

from server.routes.case_models import PairIntent, PinIntent, PostIntent, SignalIntent

UID = "board0001"


@pytest.mark.parametrize("cards", [["C1", "C1"], ["C1"], ["C1", "C2", "C3"], ["C1", 2]])
def test_pairs_require_two_distinct_card_ids(cards):
    with pytest.raises(ValidationError):
        PairIntent(cards=cards, actionUid=UID)


@pytest.mark.parametrize("bearing", [True, "10", -0.1, 360, float("inf"), float("nan")])
def test_signal_bearings_are_finite_numbers_in_the_half_open_circle(bearing):
    with pytest.raises(ValidationError):
        SignalIntent(light="harbor_light", bearing=bearing, actionUid=UID)


def test_numeric_bearings_are_left_for_server_normalisation():
    assert SignalIntent(light="harbor_light", bearing=359.99, actionUid=UID).bearing == 359.99
    assert SignalIntent(light="harbor_light", bearing=0, actionUid=UID).bearing == 0


@pytest.mark.parametrize(
    ("model", "body"),
    [(PinIntent, {"cardId": "C1"}), (PostIntent, {"light": "harbor_light"})],
)
def test_clients_cannot_supply_rewards_or_readiness(model, body):
    with pytest.raises(ValidationError):
        model(**body, actionUid=UID, coinsPaid=500, lightReady=True)
