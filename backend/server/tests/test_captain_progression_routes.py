"""Standalone personal-profile routes validate context and use only the authenticated actor."""

import pytest

from server.routes.captain_progression import router
from server.tests.account_helpers import (
    PLAYER_ID,
    RIGHT_HEADER,
    make_client,
    scripted_database,
    sent_arguments,
)
from server.tests.helpers import assert_error
from server.tests.test_personal_captain import reply


def client_for(functions):
    client, seen = make_client(scripted_database(functions))
    client.app.include_router(router, prefix="/api")
    return client, seen


def body(**values):
    return {"progressionVersion": 1, "expectedRevision": "4", "actionUid": "profile01", **values}


def test_read_authenticates_personal_owner_and_does_not_import_or_resolve_an_island():
    client, seen = client_for({"personal_captain_context": lambda params: reply(bound=True)})
    response = client.get("/api/captain", headers=RIGHT_HEADER)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert set(response.json()) == {"captain", "skills"}
    assert response.json()["captain"]["canRespec"] is True
    assert sent_arguments(seen[0]) == {"p_player_id": PLAYER_ID}
    assert seen[0].url.path.endswith("/personal_captain_context")


def test_read_without_adoption_requires_personal_context_and_never_initializes():
    client, seen = client_for({"personal_captain_context": lambda params: {"status": "legacy"}})
    assert_error(client.get("/api/captain", headers=RIGHT_HEADER), 409, "captain_context_required")
    assert len(seen) == 1 and seen[0].url.path.endswith("/personal_captain_context")


def test_read_rejects_an_owner_query_and_invalid_login_without_database_access():
    client, seen = client_for({})
    assert_error(client.get("/api/captain?playerId=someone-else", headers=RIGHT_HEADER),
                 422, "validation_error")
    assert_error(client.get("/api/captain", headers={"Authorization": "Bearer wrong-token"}),
                 401, "unauthorized")
    assert seen == []


def test_boolean_progression_version_is_not_integer_version_one():
    client, seen = client_for({})
    assert_error(client.post("/api/captain/respec", headers=RIGHT_HEADER,
                             json=body(progressionVersion=True)), 422, "validation_error")
    assert seen == []


@pytest.mark.parametrize("method,path,payload", [
    ("GET", "/api/captain", None),
    ("POST", "/api/captain/role", body(role="engineer")),
    ("POST", "/api/captain/skill", body(skill="steady_aim")),
    ("POST", "/api/captain/respec", body()),
])
def test_signed_out_requests_never_reach_personal_state(method, path, payload):
    client, seen = client_for({})
    response = client.request(method, path, json=payload)
    assert_error(response, 401, "unauthorized")
    assert seen == []


@pytest.mark.parametrize("path,extra,action,value", [
    ("role", {"role": "engineer"}, "role", "engineer"),
    ("skill", {"skill": "steady_aim"}, "learn", "steady_aim"),
    ("respec", {}, "respec", None),
])
def test_edits_forward_exact_revision_uid_and_authenticated_actor(path, extra, action, value):
    result = {"status": "done", "repeat": False, "receipt": {}, "profile": reply(bound=True)}
    client, seen = client_for({"personal_captain_change": lambda params: result})
    response = client.post(f"/api/captain/{path}", headers=RIGHT_HEADER, json=body(**extra))
    assert response.status_code == 200
    assert sent_arguments(seen[0]) == {
        "p_player_id": PLAYER_ID, "p_action_uid": "profile01", "p_action": action,
        "p_value": value, "p_expected_revision": "4",
    }
    assert response.json()["captain"]["role"] == "engineer"


@pytest.mark.parametrize("revision", [0, 4.0, True, "04", "4.0", "-1", " 4", "1e2"])
def test_revision_is_a_canonical_exact_string(revision):
    client, seen = client_for({})
    response = client.post("/api/captain/respec", headers=RIGHT_HEADER,
                           json=body(expectedRevision=revision))
    assert_error(response, 422, "validation_error")
    assert seen == []


def test_large_revision_is_forwarded_without_javascript_or_float_rounding():
    revision = "900719925474099312345678901234567890"
    result = {"status": "done", "repeat": False, "receipt": {}, "profile": reply()}
    client, seen = client_for({"personal_captain_change": lambda params: result})
    response = client.post("/api/captain/respec", headers=RIGHT_HEADER,
                           json=body(expectedRevision=revision))
    assert response.status_code == 200
    assert sent_arguments(seen[0])["p_expected_revision"] == revision


@pytest.mark.parametrize("extra", [
    {"playerId": "someone-else"}, {"islandOwner": "someone-else"}, {"code": "K7Q2M"},
    {"payer": "someone-else"}, {"coins": 0}, {"engineerBound": False},
])
def test_client_cannot_supply_an_owner_payer_island_or_authority_flags(extra):
    client, seen = client_for({})
    assert_error(client.post("/api/captain/respec", headers=RIGHT_HEADER,
                             json=body(**extra)), 422, "validation_error")
    assert seen == []


@pytest.mark.parametrize("version", [None, 0, 2])
def test_explicit_version_one_is_required_without_database_side_effects(version):
    client, seen = client_for({})
    payload = body()
    if version is None:
        payload.pop("progressionVersion")
    else:
        payload["progressionVersion"] = version
    assert_error(client.post("/api/captain/respec", headers=RIGHT_HEADER,
                             json=payload), 409, "captain_context_required")
    assert seen == []


def test_stale_revision_and_missing_profile_keep_standard_fail_closed_errors():
    for reason, code in (("captain_revision_mismatch", "captain_revision_mismatch"),
                         ("captain_not_initialized", "captain_context_required")):
        client, _ = client_for({"personal_captain_change": lambda params, reason=reason: {
            "status": "refused", "reason": reason,
        }})
        assert_error(client.post("/api/captain/respec", headers=RIGHT_HEADER,
                                 json=body()), 409, code)


def test_an_unregistered_application_has_no_new_route():
    client, _ = make_client(scripted_database())
    assert client.get("/api/captain", headers=RIGHT_HEADER).status_code == 404
