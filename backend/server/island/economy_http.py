"""Shared client capability negotiation, used by versioned island HTTP routes.

This checks compatibility only. It selects no account and grants no membership,
assignment or mutation authority; routes still use the persisted common context.
"""

from fastapi import Request

from server.errors import ApiError

ECONOMY_CAPABILITY_HEADER = "X-Island-Economy-Version"


def require_economy_capability(request: Request) -> None:
    """Refuse an old/unsupported client before exposing a shared snapshot or mutation."""
    version = request.headers.get(ECONOMY_CAPABILITY_HEADER)
    if version is None:
        raise ApiError(
            409, "economy_context_required", "Reload to use this shared island economy."
        )
    if version != "1":
        raise ApiError(
            409, "economy_version_mismatch", "This client does not support this island economy."
        )
