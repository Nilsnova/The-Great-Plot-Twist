"""Shared setup for the server tests.

Tests never use the network: each test replaces Supabase, Open-Meteo and Binance with a fake
transport or a fake service. This guard turns a forgotten fake into a loud error instead of a
slow test that quietly talks to the real service. That happened once: a merge moved a parameter
of create_app, and the Island Exchange tests fetched real Binance prices without failing at once.
"""

import socket

import pytest


def _refuse(*_args, **_kwargs):
    raise RuntimeError("Tests must not use the network. Pass a fake transport or service instead.")


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    monkeypatch.setattr(socket.socket, "connect", _refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", _refuse)
