"""Old wave paths surface persisted control fences without changing accounting."""

import pytest

from server.errors import ApiError
from server.island import wave_recovery, waves
from server.island.store import Refusal
from server.supabase_admin import SupabaseRejected


@pytest.mark.parametrize("reason,status", [
    ("economy_context_required", 409), ("personal_captain_managed", 409),
    ("unauthorized", 401),
])
@pytest.mark.parametrize("adapter", [
    waves.start_refusal, waves.finish_refusal, waves.revive_refusal,
])
def test_legacy_wave_refusals_keep_the_actual_authority_failure(adapter, reason, status):
    error = adapter(Refusal(reason))
    assert (error.status_code, error.code) == (status, reason)


@pytest.mark.parametrize("reason,status", [
    ("economy_context_required", 409), ("personal_captain_managed", 409),
    ("unauthorized", 401),
])
def test_recovery_transport_surfaces_the_same_persisted_fences(reason, status):
    with pytest.raises(ApiError) as error:
        wave_recovery._refusal({"status": "refused", "reason": reason})
    assert (error.value.status_code, error.value.code) == (status, reason)


def test_unknown_fence_stays_a_database_error():
    with pytest.raises(SupabaseRejected):
        wave_recovery._refusal({"status": "refused", "reason": "unknown_future_fence"})
