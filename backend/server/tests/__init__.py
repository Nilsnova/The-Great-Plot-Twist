"""Tests for the server. Run them all with: cd backend && uv run pytest

No test uses the network. Fake Supabase servers (httpx.MockTransport), a fake clock and
fake outside services stand in for the real ones.
"""
