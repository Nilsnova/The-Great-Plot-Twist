"""Translate persisted authority fences on the old wave controls.

Used by both legacy wave adapters; refusing a control never selects another payer.
"""

from server.errors import ApiError


def control_refusal(reason: str | None) -> ApiError | None:
    errors = {
        "economy_context_required": (
            409, "economy_context_required", "Read this island's shared session first."
        ),
        "personal_captain_managed": (
            409, "personal_captain_managed", "Use the canonical Captain session to play."
        ),
        "unauthorized": (401, "unauthorized", "Sign in again before playing."),
    }
    value = errors.get(reason)
    return None if value is None else ApiError(*value)
