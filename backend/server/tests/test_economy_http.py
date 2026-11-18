"""Shared capability negotiation without granting economic or membership authority."""

import pytest
from starlette.requests import Request

from server.errors import ApiError
from server.island.economy_http import require_economy_capability


def request_with(version: str | None) -> Request:
    headers = [] if version is None else [(b"x-island-economy-version", version.encode())]
    return Request({"type": "http", "headers": headers})


def test_version_one_negotiates_without_returning_an_authorization_permit() -> None:
    assert require_economy_capability(request_with("1")) is None


def test_missing_capability_requires_an_updated_shared_client() -> None:
    with pytest.raises(ApiError) as error:
        require_economy_capability(request_with(None))
    assert (error.value.status_code, error.value.code) == (409, "economy_context_required")


@pytest.mark.parametrize("version", ["", "0", "2", "01", "true", "1.0", " 1 "])
def test_unsupported_or_noncanonical_capabilities_are_rejected(version: str) -> None:
    with pytest.raises(ApiError) as error:
        require_economy_capability(request_with(version))
    assert (error.value.status_code, error.value.code) == (409, "economy_version_mismatch")
