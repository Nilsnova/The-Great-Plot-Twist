"""Tests for scripts/voice/generate.py. Run: python3 -I -m unittest discover -s scripts/voice -v

Every network call is replaced by a fake opener; nothing here talks to ElevenLabs.
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import tempfile
import unittest
import urllib.error
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("voice_generate", HERE / "generate.py")
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

FAKE_KEY = "sk_test_" + "f" * 40  # pragma: allowlist secret


def frame(family=2, kbps=32, rate=22050, padding=0, mono=True, payload=b""):
    """Build one MPEG Layer III frame with silent payload."""
    version_bits = 3 if family == 1 else 2
    table = gen._BITRATES[(family, 3)]
    rates = gen._SAMPLE_RATES[version_bits]
    header = bytes([
        0xFF, 0xE0 | (version_bits << 3) | (1 << 1) | 1,
        (table.index(kbps) << 4) | (rates.index(rate) << 2) | (padding << 1),
        (3 << 6) if mono else 0,
    ])
    length = (144 if family == 1 else 72) * kbps * 1000 // rate + padding
    body = (payload + bytes(length))[: length - 4]
    return header + body


def mp3(frames=40, **kwargs):
    return b"".join(frame(**kwargs) for _ in range(frames))


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


class FakeOpener:
    def __init__(self, body=None, error=None):
        self.requests = []
        self.body = body if body is not None else mp3(50)
        self.error = error

    def __call__(self, request, timeout=None):
        self.requests.append(request)
        if self.error:
            raise self.error
        return FakeResponse(self.body)


def refuse_network(*_args, **_kwargs):
    raise AssertionError("network must not be used")


class Mp3DurationTests(unittest.TestCase):
    def test_mpeg2_layer3_frames(self):
        self.assertAlmostEqual(gen.mp3_duration(mp3(100)), 100 * 576 / 22050, places=6)

    def test_mpeg1_with_padding_and_stereo(self):
        data = b"".join(frame(family=1, kbps=128, rate=44100, padding=i % 2, mono=False) for i in range(30))
        self.assertAlmostEqual(gen.mp3_duration(data), 30 * 1152 / 44100, places=6)

    def test_id3v2_tag_garbage_and_id3v1_tag_are_skipped(self):
        id3 = b"ID3\x04\x00\x00" + bytes([0, 0, 1, 0]) + b"\x00" * 128
        tail = b"TAG" + b"\x00" * 125
        data = id3 + mp3(10) + b"\x00\x01junk" + mp3(10) + tail
        self.assertAlmostEqual(gen.mp3_duration(data), 20 * 576 / 22050, places=6)

    def test_xing_frame_count_wins(self):
        xing = b"Xing" + (1).to_bytes(4, "big") + (500).to_bytes(4, "big")
        first = frame(family=1, kbps=128, rate=44100, mono=True, payload=b"\x00" * 17 + xing)
        self.assertAlmostEqual(gen.mp3_duration(first + mp3(3, family=1, kbps=128, rate=44100)),
                               500 * 1152 / 44100, places=6)

    def test_info_frame_without_count_is_not_counted(self):
        info = b"Info" + (0).to_bytes(4, "big")
        first = frame(payload=b"\x00" * 9 + info)
        self.assertAlmostEqual(gen.mp3_duration(first + mp3(10)), 10 * 576 / 22050, places=6)

    def test_not_audio(self):
        with self.assertRaises(gen.ToolError):
            gen.mp3_duration(b"<html>nope</html>")
        self.assertFalse(gen.looks_like_mp3(b'{"detail": "quota"}'))
        self.assertTrue(gen.looks_like_mp3(mp3(2)))


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.key = self.root / "elevenlabs.key"
        self.out = self.root / "voice"
        self.scripts = self.root / "scripts.json"
        self.scripts.write_text(json.dumps([
            {"id": "intro", "lines": [{"id": "01", "text": "The light went dark.", "voice": "narrator"},
                                      {"id": "02", "text": "Bring it back.", "voice": "narrator"}]},
            {"id": "arrival", "lines": [{"id": "01", "text": "Welcome, captain.", "voice": "keeper"}]},
        ]))

    def tearDown(self):
        self.tmp.cleanup()

    def write_key(self, mode=0o600, text=FAKE_KEY):
        self.key.write_text(text + "\n")
        os.chmod(self.key, mode)

    def call(self, *argv, opener=refuse_network):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stderr(err):
            try:
                code = gen.run(["--scripts", str(self.scripts), *argv], key_path=self.key, out_dir=self.out,
                               opener=opener, out=out)
            except gen.ToolError as error:
                code, message = 2, str(error)
                err.write(message)
        text = out.getvalue() + err.getvalue()
        self.assertNotIn(FAKE_KEY, text)
        self.assertNotIn("ffffffffffffffff", text)
        return code, text


class DryRunAndRefusalTests(Fixture):
    def test_dry_run_prints_plan_and_counts_without_key_or_network(self):
        with mock.patch.object(gen, "read_key", side_effect=AssertionError("dry run read the key")):
            code, text = self.call("--dry-run")
        self.assertEqual(code, 0)
        self.assertIn("intro-01", text)
        self.assertIn("characters to send: 51", text)
        self.assertIn("Key file missing", text)
        self.assertFalse(self.out.exists())

    def test_dry_run_reports_safe_key_without_reading_it(self):
        self.write_key()
        with mock.patch.object(gen, "read_key", side_effect=AssertionError("dry run read the key")):
            code, text = self.call("--dry-run")
        self.assertEqual(code, 0)
        self.assertIn("present, owner-only permissions", text)

    def test_missing_key_refuses(self):
        code, text = self.call("--voice-id", "abcdefgh12345678")
        self.assertEqual(code, 2)
        self.assertIn("Key file missing", text)
        self.assertIn("chmod 600", text)

    def test_key_readable_by_others_refuses(self):
        for mode in (0o644, 0o640, 0o604):
            self.write_key(mode)
            code, text = self.call("--voice-id", "abcdefgh12345678")
            self.assertEqual(code, 2)
            self.assertIn("readable by others", text)

    def test_malformed_key_refuses_without_echo(self):
        self.write_key(text="two words")
        code, text = self.call("--voice-id", "abcdefgh12345678")
        self.assertEqual(code, 2)
        self.assertNotIn("two words", text)

    def test_budget_guard_refuses_before_key_or_network(self):
        with mock.patch.object(gen, "read_key", side_effect=AssertionError("read the key")):
            code, text = self.call("--voice-id", "abcdefgh12345678", "--max-chars", "40")
        self.assertEqual(code, 2)
        self.assertIn("exceeds --max-chars 40", text)

    def test_missing_voice_id_refuses(self):
        self.write_key()
        code, text = self.call()
        self.assertEqual(code, 2)
        self.assertIn("No voice id for keeper, narrator", text)

    def test_unknown_scene_and_bad_ids(self):
        self.assertEqual(self.call("--dry-run", "--only", "nope")[0], 2)
        self.scripts.write_text(json.dumps([{"id": "../evil", "lines": [{"id": "1", "text": "x"}]}]))
        self.assertIn("Bad scene id", self.call("--dry-run")[1])
        self.scripts.write_text(json.dumps([{"id": "ok", "lines": [{"id": "a/b", "text": "x"}]}]))
        self.assertIn("Bad line id", self.call("--dry-run")[1])

    def test_falls_back_to_sample_scripts(self):
        with mock.patch.object(gen, "SCRIPTS_PATH", self.root / "missing.json"):
            path, scenes = gen.load_scripts()
        self.assertEqual(path, gen.SAMPLE_PATH)
        self.assertEqual([s["id"] for s in scenes],
                         ["lore_intro", "arrival", "goal_card", "keepers_lock", "lamps_relight"])

    def test_sample_scripts_fit_the_free_plan_and_timing(self):
        _, scenes = gen.load_scripts(gen.SAMPLE_PATH)
        total = sum(len(line["text"]) for scene in scenes for line in scene["lines"])
        self.assertLess(total, gen.DEFAULT_MAX_CHARS)
        words = {s["id"]: sum(len(line["text"].split()) for line in s["lines"]) for s in scenes}
        self.assertTrue(55 <= words["lore_intro"] <= 75, words)  # about 25 seconds of narration
        self.assertTrue(10 <= words["arrival"] <= 20, words)  # 5 to 8 seconds


class GenerationTests(Fixture):
    def test_generates_lines_writes_manifest_and_sends_the_right_request(self):
        self.write_key()
        opener = FakeOpener()
        code, text = self.call("--voice-id", "abcdefgh12345678", "--voice", "keeper=zyxwvuts87654321",
                               opener=opener)
        self.assertEqual(code, 0, text)
        self.assertEqual(len(opener.requests), 3)
        first = opener.requests[0]
        self.assertEqual(first.get_method(), "POST")
        self.assertEqual(first.full_url, "https://api.elevenlabs.io/v1/text-to-speech/abcdefgh12345678"
                                         "?output_format=mp3_22050_32")
        self.assertEqual(first.get_header("Xi-api-key"), FAKE_KEY)
        self.assertEqual(json.loads(first.data), {"text": "The light went dark.", "model_id": "eleven_multilingual_v2",
                                                  "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}})
        self.assertIn("/zyxwvuts87654321?", opener.requests[2].full_url)
        self.assertEqual(sorted(p.name for p in self.out.iterdir()),
                         ["arrival-01.mp3", "intro-01.mp3", "intro-02.mp3", "manifest.json"])
        manifest = json.loads((self.out / "manifest.json").read_text())
        self.assertEqual(manifest["credit"], "Voices by ElevenLabs")
        intro = manifest["scenes"][0]
        self.assertEqual(intro["lines"][0]["file"], "audio/voice/intro-01.mp3")
        self.assertEqual(intro["lines"][0]["durationMs"], round(50 * 576 / 22050 * 1000))
        self.assertEqual(intro["durationMs"], 2 * round(50 * 576 / 22050 * 1000))
        self.assertTrue(intro["complete"])
        self.assertNotIn("text", intro["lines"][0])  # captions live in the scripts file only
        self.assertNotIn(FAKE_KEY, (self.out / "manifest.json").read_text())

    def test_skips_existing_files_and_force_regenerates(self):
        self.write_key()
        self.call("--voice-id", "abcdefgh12345678", opener=FakeOpener())
        code, text = self.call("--voice-id", "abcdefgh12345678")  # refuse_network: all exist
        self.assertEqual(code, 0)
        self.assertIn("Nothing to generate", text)
        opener = FakeOpener(body=mp3(10))
        self.call("--voice-id", "abcdefgh12345678", "--force", "--only", "arrival", opener=opener)
        self.assertEqual(len(opener.requests), 1)
        manifest = json.loads((self.out / "manifest.json").read_text())
        self.assertEqual([s["id"] for s in manifest["scenes"]], ["intro", "arrival"])
        self.assertEqual(manifest["scenes"][1]["durationMs"], round(10 * 576 / 22050 * 1000))

    def test_only_limits_the_plan_and_the_budget(self):
        self.write_key()
        opener = FakeOpener()
        code, _ = self.call("--voice-id", "abcdefgh12345678", "--only", "arrival", "--max-chars", "20",
                            opener=opener)
        self.assertEqual(code, 0)
        self.assertEqual(len(opener.requests), 1)
        manifest = json.loads((self.out / "manifest.json").read_text())
        self.assertEqual([s["id"] for s in manifest["scenes"]], ["arrival"])

    def test_http_error_is_reported_and_redacted(self):
        self.write_key()
        body = io.BytesIO(json.dumps({"detail": f"invalid api key {FAKE_KEY}"}).encode())
        error = urllib.error.HTTPError("https://api.elevenlabs.io", 401, "Unauthorized", {}, body)
        code, text = self.call("--voice-id", "abcdefgh12345678", opener=FakeOpener(error=error))
        self.assertEqual(code, 2)
        self.assertIn("HTTP 401", text)
        self.assertIn("[redacted]", text)
        self.assertFalse(any(p.suffix == ".mp3" for p in self.out.iterdir()))

    def test_network_error_and_non_audio_response_write_nothing(self):
        self.write_key()
        code, text = self.call("--voice-id", "abcdefgh12345678",
                               opener=FakeOpener(error=urllib.error.URLError("offline")))
        self.assertEqual(code, 2)
        self.assertIn("Network error", text)
        code, text = self.call("--voice-id", "abcdefgh12345678", opener=FakeOpener(body=b'{"detail":"quota"}'))
        self.assertEqual(code, 2)
        self.assertIn("not MP3", text)
        self.assertEqual([p.name for p in self.out.iterdir()], ["manifest.json"])

    def test_main_prints_refusals_to_stderr_with_exit_code_2(self):
        err = io.StringIO()
        with mock.patch.object(gen, "KEY_PATH", self.key), redirect_stderr(err):
            with mock.patch.object(gen, "run", side_effect=gen.ToolError("Key file missing: x")):
                self.assertEqual(gen.main([]), 2)
        self.assertIn("Key file missing", err.getvalue())


if __name__ == "__main__":
    unittest.main()


class CreditOpener(FakeOpener):
    """Answers the subscription GET with the given numbers (or an error) and every POST with MP3 audio."""

    def __init__(self, used=0, limit=10000, credit_error=None, **kwargs):
        super().__init__(**kwargs)
        self.used, self.limit, self.credit_error = used, limit, credit_error

    def __call__(self, request, timeout=None):
        if request.full_url == gen.SUBSCRIPTION_URL:
            self.requests.append(request)
            if self.credit_error:
                raise self.credit_error
            return FakeResponse(json.dumps({"tier": "free", "character_count": self.used,
                                            "character_limit": self.limit, "voice_limit": 3}).encode())
        return super().__call__(request, timeout)


class NarratorTests(Fixture):
    def setUp(self):
        super().setUp()
        self.lines = self.root / "lines.json"
        self.lines.write_text(json.dumps({"version": 1, "voice": "narrator", "lines": [
            {"id": "wave_won_1", "trigger": "wave_won", "priority": 3, "text": "Another wave beaten!"},
            {"id": "opening_1", "trigger": "game_opening", "priority": 1, "text": "The light went dark."},
            {"id": "wave_1", "trigger": "wave_start:1", "priority": 1, "text": "Here they come."},
            {"id": "heart_low_1", "trigger": "heart_low", "priority": 2, "text": "The heart!"},
        ]}))
        self.out.mkdir()
        (self.out / "manifest.json").write_text(json.dumps({"version": 1, "note": "cutscenes", "lines": {
            "lore_intro_01": {"file": "lore_intro_01.mp3", "seconds": 2.85}}}))

    def narrate(self, *argv, opener=refuse_network):
        return self.call("--narrator", "--lines", str(self.lines), *argv, opener=opener)

    def test_dry_run_lists_narrator_files_without_key_or_network(self):
        with mock.patch.object(gen, "read_key", side_effect=AssertionError("dry run read the key")):
            code, text = self.narrate("--dry-run")
        self.assertEqual(code, 0, text)
        self.assertIn("narrator-opening_1", text)
        self.assertIn("characters to send: 65", text)

    def test_checks_credits_then_generates_everything_and_merges_the_manifest(self):
        self.write_key()
        opener = CreditOpener(used=1000, limit=10000)
        code, text = self.narrate("--voice-id", "abcdefgh12345678", opener=opener)
        self.assertEqual(code, 0, text)
        self.assertEqual(opener.requests[0].full_url, gen.SUBSCRIPTION_URL)
        self.assertEqual(opener.requests[0].get_method(), "GET")
        self.assertEqual(len(opener.requests), 5)
        self.assertIn("remaining: 9000", text)
        manifest = json.loads((self.out / "manifest.json").read_text())
        self.assertEqual(manifest["lines"]["lore_intro_01"], {"file": "lore_intro_01.mp3", "seconds": 2.85})
        self.assertEqual(manifest["lines"]["narrator-opening_1"]["file"], "narrator-opening_1.mp3")
        self.assertAlmostEqual(manifest["lines"]["narrator-opening_1"]["seconds"], 50 * 576 / 22050, places=2)
        self.assertEqual(manifest["note"], "cutscenes")

    def test_short_credits_send_the_most_important_lines_first_and_stop(self):
        self.write_key()
        opener = CreditOpener(used=10000 - 50, limit=10000)  # 50 left: 41 characters fit with the 20% margin
        code, text = self.narrate("--voice-id", "abcdefgh12345678", opener=opener)
        self.assertEqual(code, 0, text)
        sent = [json.loads(request.data)["text"] for request in opener.requests[1:]]
        self.assertEqual(sent, ["The light went dark.", "Here they come."])
        self.assertIn("leaving 2 for later: heart_low_1, wave_won_1", text)
        self.assertFalse((self.out / "narrator-wave_won_1.mp3").exists())

    def test_a_key_without_the_credit_permission_sends_nothing_unless_asked(self):
        self.write_key()
        error = urllib.error.HTTPError(gen.SUBSCRIPTION_URL, 401, "Unauthorized", {},
                                       io.BytesIO(b'{"detail":{"status":"missing_permissions"}}'))
        opener = CreditOpener(credit_error=error)
        code, text = self.narrate("--voice-id", "abcdefgh12345678", opener=opener)
        self.assertEqual(code, 2)
        self.assertIn("HTTP 401 to the credit check", text)
        self.assertEqual(len(opener.requests), 1)
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):  # it needs --priority-max 1
            self.narrate("--voice-id", "abcdefgh12345678", "--without-credit-check")
        opener = CreditOpener(credit_error=urllib.error.HTTPError(gen.SUBSCRIPTION_URL, 401, "Unauthorized", {}, io.BytesIO(b"")))
        code, text = self.narrate("--voice-id", "abcdefgh12345678", "--without-credit-check", "--priority-max", "1",
                                  opener=opener)
        self.assertEqual(code, 0, text)
        self.assertEqual([json.loads(request.data)["text"] for request in opener.requests[1:]],
                         ["The light went dark.", "Here they come."])

    def test_credits_command_prints_numbers_only(self):
        self.write_key()
        out = io.StringIO()
        code = gen.run(["--credits"], key_path=self.key, out_dir=self.out, opener=CreditOpener(used=7, limit=10), out=out)
        self.assertEqual(code, 0)
        self.assertEqual(out.getvalue().strip(), "Characters used: 7, limit: 10, remaining: 3.")
        self.assertNotIn(FAKE_KEY, out.getvalue())

    def test_long_lines_and_bad_priorities_are_refused(self):
        data = json.loads(self.lines.read_text())
        data["lines"][0]["text"] = "x" * 221
        self.lines.write_text(json.dumps(data))
        code, text = self.narrate("--dry-run")
        self.assertEqual(code, 2)
        self.assertIn("longer than 220", text)
        data["lines"][0]["text"], data["lines"][0]["priority"] = "Fine.", 0
        self.lines.write_text(json.dumps(data))
        code, text = self.narrate("--dry-run")
        self.assertIn("bad priority", text)

    def test_the_real_lines_file_loads(self):
        _, scenes = gen.load_narrator()
        self.assertEqual(scenes[0]["id"], "narrator")
        self.assertTrue(50 <= len(scenes[0]["lines"]) <= 70)
