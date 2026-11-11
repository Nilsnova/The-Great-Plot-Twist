#!/usr/bin/env python3
"""Generate cutscene voice lines with the ElevenLabs text-to-speech API (Python standard library only).

Run from anywhere with `python3 -I scripts/voice/generate.py --dry-run` first, then with --voice-id.

* The API key is read ONLY from ~/.config/great-plot-twist/elevenlabs.key, which must be a regular
  file owned by you with no group/other permissions (chmod 600). The key is never printed, logged
  or written anywhere; a dry run does not read it at all.
* Lines come from frontend/src/cutscenes/scripts.json, or scripts/voice/sample_scripts.json while
  that file does not exist yet. Format: [{"id", "lines": [{"id", "text", "voice"}]}].
* Each line becomes frontend/public/audio/voice/<scene>-<line>.mp3; existing files are skipped
  unless --force. A character budget (default 4,000 per run) is checked before any network call.
* frontend/public/audio/voice/manifest.json lists every present file by scene and line id with its
  duration, read from the MP3 frame headers, for subtitle timing. Caption text stays in the scripts.
* --narrator reads the narrator's lines (frontend/src/narrator/lines.json, GAME-V3.md section 6) as
  one scene "narrator": files narrator-<id>.mp3, merged into the game's manifest format
  {version: 1, lines: {"narrator-<id>": {file, seconds}}} without touching the cutscene entries.
  Before any line is sent it asks ElevenLabs for the account's remaining characters
  (GET /v1/user/subscription, numbers only) and sends only what fits with a 20% margin, in priority
  order (priority 1 first). It never buys or changes anything on the account.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
KEY_PATH = Path.home() / ".config" / "great-plot-twist" / "elevenlabs.key"
SCRIPTS_PATH = REPO / "frontend" / "src" / "cutscenes" / "scripts.json"
SAMPLE_PATH = Path(__file__).resolve().with_name("sample_scripts.json")
NARRATOR_PATH = REPO / "frontend" / "src" / "narrator" / "lines.json"
NARRATOR_SCENE = "narrator"
NARRATOR_MAX_TEXT = 220  # one to three short sentences (GAME-V3.md section 6)
CREDIT_MARGIN = 0.2  # send only when the account has 20% more characters left than the run needs
SUBSCRIPTION_URL = "https://api.elevenlabs.io/v1/user/subscription"
OUT_DIR = REPO / "frontend" / "public" / "audio" / "voice"
PUBLIC_PREFIX = "audio/voice/"
API_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
DEFAULT_MODEL = "eleven_multilingual_v2"
DEFAULT_FORMAT = "mp3_22050_32"  # mono 22.05 kHz, 32 kbps: small and clear enough for speech
DEFAULT_MAX_CHARS = 4000  # the free plan allows 10,000 characters a month
CREDIT = "Voices by ElevenLabs"
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")
VOICE_ID_PATTERN = re.compile(r"^[A-Za-z0-9]{8,40}$")
KEY_PATTERN = re.compile(r"^[\x21-\x7e]{16,256}$")


class ToolError(Exception):
    """A refusal or failure with a message that is safe to print."""


# ---------------------------------------------------------------------------------------------
# Scripts and plan


def load_scripts(path: Path | None = None) -> tuple[Path, list[dict]]:
    if path is None:
        path = SCRIPTS_PATH if SCRIPTS_PATH.exists() else SAMPLE_PATH
    try:
        scenes = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ToolError(f"Scripts file not found: {path}") from None
    except json.JSONDecodeError as error:
        raise ToolError(f"Scripts file is not valid JSON: {path} ({error.msg}, line {error.lineno})") from None
    if not isinstance(scenes, list) or not scenes:
        raise ToolError("Scripts file must hold a non-empty list of scenes.")
    validate_scenes(scenes)
    return Path(path), scenes


def validate_scenes(scenes: list[dict]) -> None:
    seen = set()
    for scene in scenes:
        if not isinstance(scene, dict) or not ID_PATTERN.match(str(scene.get("id", ""))):
            raise ToolError(f"Bad scene id {scene.get('id') if isinstance(scene, dict) else scene!r}: use a-z, 0-9, _ or -.")
        lines = scene.get("lines")
        if not isinstance(lines, list) or not lines:
            raise ToolError(f"Scene {scene['id']} has no lines.")
        for line in lines:
            line_id = str(line.get("id", "")) if isinstance(line, dict) else ""
            if not ID_PATTERN.match(line_id):
                raise ToolError(f"Bad line id {line_id!r} in scene {scene['id']}.")
            name = f"{scene['id']}-{line_id}"
            if name in seen:
                raise ToolError(f"Duplicate line {name}.")
            seen.add(name)
            if not isinstance(line.get("text"), str) or not line["text"].strip():
                raise ToolError(f"Line {name} has no text.")
            if not ID_PATTERN.match(str(line.get("voice", "narrator"))):
                raise ToolError(f"Line {name} has a bad voice name.")


def build_plan(scenes: list[dict], out_dir: Path, only: list[str] | None, force: bool) -> list[dict]:
    known = {scene["id"] for scene in scenes}
    for name in only or []:
        if name not in known:
            raise ToolError(f"Unknown scene {name!r}. Scenes: {', '.join(sorted(known))}.")
    plan = []
    for scene in scenes:
        if only and scene["id"] not in only:
            continue
        for line in scene["lines"]:
            name = f"{scene['id']}-{line['id']}"
            path = out_dir / f"{name}.mp3"
            exists = path.is_file() and path.stat().st_size > 0
            plan.append({
                "scene": scene["id"], "line": line["id"], "name": name, "text": line["text"].strip(),
                "voice": line.get("voice", "narrator"), "path": path, "skip": exists and not force,
                "priority": line.get("priority", 2),
            })
    return plan


def load_narrator(path: Path | None = None) -> tuple[Path, list[dict]]:
    """The narrator's lines file as one scene "narrator" (lines keep their priority, default 2)."""
    path = Path(path or NARRATOR_PATH)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ToolError(f"Narrator lines not found: {path}") from None
    except json.JSONDecodeError as error:
        raise ToolError(f"Narrator lines are not valid JSON: {path} ({error.msg}, line {error.lineno})") from None
    lines = data.get("lines") if isinstance(data, dict) else None
    if not isinstance(lines, list) or not lines:
        raise ToolError("Narrator lines file must hold {\"lines\": [...]} with at least one line.")
    default_voice = data.get("voice", "narrator")
    scene_lines = []
    for line in lines:
        if not isinstance(line, dict):
            raise ToolError("Every narrator line must be an object.")
        text = line.get("text")
        if isinstance(text, str) and len(text.strip()) > NARRATOR_MAX_TEXT:
            raise ToolError(f"Narrator line {line.get('id')!r} is longer than {NARRATOR_MAX_TEXT} characters.")
        priority = line.get("priority", 2)
        if not isinstance(priority, int) or not 1 <= priority <= 9:
            raise ToolError(f"Narrator line {line.get('id')!r} has a bad priority (use 1 to 9).")
        scene_lines.append({"id": line.get("id"), "text": text, "voice": line.get("voice", default_voice),
                            "priority": priority})
    scenes = [{"id": NARRATOR_SCENE, "lines": scene_lines}]
    validate_scenes(scenes)
    return path, scenes


# ---------------------------------------------------------------------------------------------
# Key handling: status checks never read the content.


def key_problem(path: Path = KEY_PATH) -> str | None:
    """Return a printable reason the key file cannot be used, or None when it is safe to read."""
    try:
        info = os.stat(path)
    except FileNotFoundError:
        return (f"Key file missing: {path}\nCreate it with your ElevenLabs API key, then run "
                f"chmod 600 {path}")
    except OSError as error:
        return f"Key file cannot be checked: {path} ({error.strerror})"
    if not stat.S_ISREG(info.st_mode):
        return f"Key file is not a regular file: {path}"
    if hasattr(os, "getuid") and info.st_uid != os.getuid():
        return f"Key file is not owned by you: {path}"
    if info.st_mode & 0o077:
        return (f"Key file is readable by others (mode {stat.S_IMODE(info.st_mode):o}): {path}\n"
                f"Run chmod 600 {path} and try again.")
    return None


def read_key(path: Path = KEY_PATH) -> str:
    problem = key_problem(path)
    if problem:
        raise ToolError(problem)
    key = Path(path).read_text(encoding="utf-8", errors="replace").strip()
    if not KEY_PATTERN.match(key):
        raise ToolError(f"Key file does not hold a single API key on one line: {path}")
    return key


def redact(message: str, key: str | None) -> str:
    return message.replace(key, "[redacted]") if key else message


# ---------------------------------------------------------------------------------------------
# MP3 duration from frame headers


_BITRATES = {
    (1, 1): [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    (1, 2): [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    (1, 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    (2, 1): [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    (2, 2): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
_BITRATES[(2, 3)] = _BITRATES[(2, 2)]
_SAMPLE_RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def parse_frame_header(data: bytes, pos: int) -> dict | None:
    """Decode a 4-byte MPEG audio frame header at pos, or None if it is not one."""
    if pos + 4 > len(data) or data[pos] != 0xFF or (data[pos + 1] & 0xE0) != 0xE0:
        return None
    version_bits = (data[pos + 1] >> 3) & 3  # 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    layer_bits = (data[pos + 1] >> 1) & 3  # 3 = Layer I, 2 = II, 1 = III
    bitrate_index = data[pos + 2] >> 4
    rate_index = (data[pos + 2] >> 2) & 3
    if version_bits == 1 or layer_bits == 0 or bitrate_index in (0, 15) or rate_index == 3:
        return None
    layer = 4 - layer_bits
    family = 1 if version_bits == 3 else 2
    bitrate = _BITRATES[(family, layer)][bitrate_index] * 1000
    sample_rate = _SAMPLE_RATES[version_bits][rate_index]
    padding = (data[pos + 2] >> 1) & 1
    if layer == 1:
        length, samples = (12 * bitrate // sample_rate + padding) * 4, 384
    elif layer == 2:
        length, samples = 144 * bitrate // sample_rate + padding, 1152
    else:
        length = (144 if family == 1 else 72) * bitrate // sample_rate + padding
        samples = 1152 if family == 1 else 576
    return {"family": family, "layer": layer, "sample_rate": sample_rate, "length": length,
            "samples": samples, "mono": (data[pos + 3] >> 6) == 3}


def _skip_id3v2(data: bytes) -> int:
    if len(data) >= 10 and data[:3] == b"ID3":
        size = (data[6] & 0x7F) << 21 | (data[7] & 0x7F) << 14 | (data[8] & 0x7F) << 7 | (data[9] & 0x7F)
        return 10 + size + (10 if data[5] & 0x10 else 0)
    return 0


def _xing_frames(data: bytes, pos: int, header: dict) -> tuple[bool, int | None]:
    """Return (is_xing_or_info_frame, frame_count_if_present)."""
    if header["layer"] != 3:
        return False, None
    side = (17 if header["mono"] else 32) if header["family"] == 1 else (9 if header["mono"] else 17)
    at = pos + 4 + side
    if data[at:at + 4] not in (b"Xing", b"Info"):
        return False, None
    flags = int.from_bytes(data[at + 4:at + 8], "big")
    if flags & 1 and len(data) >= at + 12:
        return True, int.from_bytes(data[at + 8:at + 12], "big")
    return True, None


def mp3_duration(data: bytes) -> float:
    """Duration in seconds from MPEG frame headers (Xing/Info frame count when present)."""
    pos = _skip_id3v2(data)
    samples, rate, first = 0, None, True
    while pos + 4 <= len(data):
        header = parse_frame_header(data, pos)
        if header is None:
            if data[pos:pos + 3] == b"TAG" and len(data) - pos == 128:
                break
            pos += 1
            continue
        if first:
            first = False
            is_info, frames = _xing_frames(data, pos, header)
            if frames is not None:
                return frames * header["samples"] / header["sample_rate"]
            if is_info:
                pos += header["length"]
                continue
        rate = rate or header["sample_rate"]
        samples += header["samples"]
        pos += max(header["length"], 1)
    if not rate:
        raise ToolError("No MP3 audio frames found.")
    return samples / rate


def looks_like_mp3(data: bytes) -> bool:
    pos = _skip_id3v2(data)
    return parse_frame_header(data, pos) is not None or any(
        parse_frame_header(data, i) is not None for i in range(pos, min(len(data), pos + 4096)))


# ---------------------------------------------------------------------------------------------
# API call


def synthesize(text: str, voice_id: str, key: str, model: str, output_format: str,
               opener=None, timeout: float = 90) -> bytes:
    opener = opener or urllib.request.urlopen
    url = API_URL.format(voice_id=urllib.parse.quote(voice_id, safe="")) + "?" + urllib.parse.urlencode(
        {"output_format": output_format})
    body = json.dumps({"text": text, "model_id": model,
                       "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST", headers={
        "xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    try:
        with opener(request, timeout=timeout) as response:
            data = response.read()
    except urllib.error.HTTPError as error:
        try:
            detail = error.read(400).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001 - the detail is optional
            detail = ""
        raise ToolError(redact(f"ElevenLabs answered HTTP {error.code}: {detail.strip()}", key)) from None
    except urllib.error.URLError as error:
        raise ToolError(redact(f"Network error talking to ElevenLabs: {error.reason}", key)) from None
    if not looks_like_mp3(data):
        raise ToolError("ElevenLabs returned something that is not MP3 audio; nothing was written.")
    return data


# ---------------------------------------------------------------------------------------------
# Manifest


def write_manifest(scenes: list[dict], out_dir: Path, model: str) -> dict:
    manifest = {"generatedBy": "scripts/voice/generate.py", "credit": CREDIT, "model": model,
                "format": "mp3", "scenes": []}
    for scene in scenes:
        lines = []
        for line in scene["lines"]:
            name = f"{scene['id']}-{line['id']}"
            path = out_dir / f"{name}.mp3"
            if not path.is_file() or path.stat().st_size == 0:
                continue
            data = path.read_bytes()
            # Captions stay in the scripts file (one source of display copy); the manifest only times audio.
            lines.append({"id": line["id"], "voice": line.get("voice", "narrator"),
                          "file": f"{PUBLIC_PREFIX}{name}.mp3", "bytes": len(data),
                          "durationMs": round(mp3_duration(data) * 1000)})
        if lines:
            manifest["scenes"].append({"id": scene["id"], "complete": len(lines) == len(scene["lines"]),
                                       "durationMs": sum(item["durationMs"] for item in lines), "lines": lines})
    out_dir.mkdir(parents=True, exist_ok=True)
    temporary = out_dir / "manifest.json.part"
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, out_dir / "manifest.json")
    return manifest


# ---------------------------------------------------------------------------------------------
# Remaining characters on the account (read only)


def remaining_characters(key: str, opener=None, timeout: float = 30) -> dict:
    """{used, limit, remaining} from GET /v1/user/subscription. Only these numbers are kept."""
    opener = opener or urllib.request.urlopen
    request = urllib.request.Request(SUBSCRIPTION_URL, method="GET", headers={"xi-api-key": key, "Accept": "application/json"})
    try:
        with opener(request, timeout=timeout) as response:
            data = json.loads(response.read(200_000).decode("utf-8", "replace"))
    except urllib.error.HTTPError as error:
        try:
            detail = error.read(400).decode("utf-8", "replace").strip()
        except Exception:  # noqa: BLE001 - the detail is optional
            detail = ""
        raise ToolError(redact(f"ElevenLabs answered HTTP {error.code} to the credit check; nothing was sent. {detail}", key).strip()) from None
    except urllib.error.URLError as error:
        raise ToolError(redact(f"Network error during the credit check: {error.reason}", key)) from None
    except (ValueError, UnicodeDecodeError):
        raise ToolError("The credit check did not answer JSON; nothing was sent.") from None
    used, limit = (data.get("character_count"), data.get("character_limit")) if isinstance(data, dict) else (None, None)
    if not all(isinstance(value, int) and value >= 0 for value in (used, limit)):
        raise ToolError("The credit check did not include character_count and character_limit; nothing was sent.")
    return {"used": used, "limit": limit, "remaining": max(0, limit - used)}


def fit_to_credits(todo: list[dict], remaining: int, margin: float = CREDIT_MARGIN) -> tuple[list[dict], list[dict]]:
    """The lines to send now (priority order, then file order) so that remaining >= sent * (1 + margin)."""
    allowed = int(remaining / (1 + margin))
    if sum(len(item["text"]) for item in todo) <= allowed:
        return list(todo), []
    ordered = sorted(enumerate(todo), key=lambda pair: (pair[1].get("priority", 2), pair[0]))
    chosen, skipped, total = [], [], 0
    for _, item in ordered:
        # Stop at the first line that does not fit: the most important lines go first and nothing jumps ahead.
        if not skipped and total + len(item["text"]) <= allowed:
            chosen.append(item)
            total += len(item["text"])
        else:
            skipped.append(item)
    return chosen, skipped


def write_manifest_v1(scenes: list[dict], out_dir: Path, note: str | None = None) -> dict:
    """Merge the scenes' present files into the game's manifest {version: 1, lines: {name: {file, seconds}}}."""
    path = out_dir / "manifest.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        manifest = {}
    if not isinstance(manifest, dict) or manifest.get("version") != 1 or not isinstance(manifest.get("lines"), dict):
        manifest = {"version": 1, "note": note or f"Voice lines by id. {CREDIT}.", "lines": {}}
    lines = manifest["lines"]
    for scene in scenes:
        for line in scene["lines"]:
            name = f"{scene['id']}-{line['id']}"
            file = out_dir / f"{name}.mp3"
            if not file.is_file() or file.stat().st_size == 0:
                lines.pop(name, None)
                continue
            lines[name] = {"file": f"{name}.mp3", "seconds": round(mp3_duration(file.read_bytes()), 2)}
    out_dir.mkdir(parents=True, exist_ok=True)
    temporary = out_dir / "manifest.json.part"
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)
    return manifest


# ---------------------------------------------------------------------------------------------
# Command line


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Generate cutscene voice lines with ElevenLabs.")
    parser.add_argument("--dry-run", action="store_true", help="print the plan and character count; no key, no network")
    parser.add_argument("--voice-id", help="ElevenLabs voice id used for every line without a --voice mapping")
    parser.add_argument("--voice", action="append", default=[], metavar="NAME=ID",
                        help="voice id for one voice name in the scripts (repeatable)")
    parser.add_argument("--only", action="append", metavar="SCENE", help="generate only this scene (repeatable)")
    parser.add_argument("--force", action="store_true", help="regenerate lines whose MP3 already exists")
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS,
                        help=f"refuse a run that would send more characters (default {DEFAULT_MAX_CHARS})")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"model id (default {DEFAULT_MODEL})")
    parser.add_argument("--format", default=DEFAULT_FORMAT, help=f"ElevenLabs output_format (default {DEFAULT_FORMAT})")
    parser.add_argument("--scripts", type=Path, help="scripts JSON (default: cutscenes/scripts.json, else the sample)")
    parser.add_argument("--narrator", action="store_true",
                        help="the narrator's lines (src/narrator/lines.json) as scene 'narrator', with a credit check")
    parser.add_argument("--lines", type=Path, help="narrator lines JSON for --narrator (default: src/narrator/lines.json)")
    parser.add_argument("--priority-max", type=int, metavar="P",
                        help="with --narrator: only lines with priority P or lower (1 = the most important)")
    parser.add_argument("--without-credit-check", action="store_true",
                        help="with --narrator --priority-max 1: send when the key may not read the subscription; "
                             "stops at the first refusal (ElevenLabs refuses past the quota and charges nothing)")
    parser.add_argument("--credits", action="store_true",
                        help="print the account's used, limit and remaining characters (reads the key; sends no text)")
    args = parser.parse_args(argv)
    if not args.format.startswith("mp3_"):
        parser.error("--format must be an mp3_* output format")
    if args.max_chars < 1:
        parser.error("--max-chars must be positive")
    if (args.priority_max is not None or args.without_credit_check or args.lines) and not args.narrator:
        parser.error("--priority-max, --without-credit-check and --lines need --narrator")
    if args.without_credit_check and args.priority_max != 1:
        parser.error("--without-credit-check sends only the most important lines: add --priority-max 1")
    return args


def voice_map(args) -> dict:
    voices = {}
    for item in args.voice:
        name, _, voice_id = item.partition("=")
        if not ID_PATTERN.match(name) or not VOICE_ID_PATTERN.match(voice_id):
            raise ToolError(f"Bad --voice {item!r}: use NAME=VOICE_ID.")
        voices[name] = voice_id
    if args.voice_id is not None and not VOICE_ID_PATTERN.match(args.voice_id):
        raise ToolError("Bad --voice-id: expected the letters and digits shown in the ElevenLabs voice library.")
    return voices


def run(argv=None, *, key_path: Path = KEY_PATH, out_dir: Path = OUT_DIR, opener=None,
        out=sys.stdout) -> int:
    args = parse_args(argv)
    say = lambda text="": print(text, file=out)  # noqa: E731
    if args.credits and not args.narrator:
        key = read_key(key_path)
        try:
            credit = remaining_characters(key, opener=opener)
        finally:
            del key
        say(f"Characters used: {credit['used']}, limit: {credit['limit']}, remaining: {credit['remaining']}.")
        return 0
    source, scenes = load_narrator(args.lines) if args.narrator else load_scripts(args.scripts)
    if args.priority_max is not None:
        scenes = [{**scene, "lines": [line for line in scene["lines"] if line.get("priority", 2) <= args.priority_max]}
                  for scene in scenes]
        if not scenes[0]["lines"]:
            raise ToolError(f"No narrator line has priority {args.priority_max} or lower.")
    voices = voice_map(args)
    plan = build_plan(scenes, out_dir, args.only, args.force)
    todo = [item for item in plan if not item["skip"]]
    chars = sum(len(item["text"]) for item in todo)
    total_chars = sum(len(line["text"].strip()) for scene in scenes for line in scene["lines"])
    try:
        shown_source = source.resolve().relative_to(REPO)
    except ValueError:
        shown_source = source
    say(f"Scripts: {shown_source}")
    say(f"Output:  {out_dir}")
    for item in plan:
        state = "exists, skip" if item["skip"] else "generate"
        say(f"  {item['name']:<22} {item['voice']:<10} {len(item['text']):>4} chars  {state}")
    say(f"Lines: {len(plan)}, to generate: {len(todo)}, characters to send: {chars} "
        f"(budget {args.max_chars}); all scripts: {total_chars} characters.")
    if args.dry_run:
        problem = key_problem(key_path)
        say("Key file: " + ("present, owner-only permissions" if problem is None else problem.splitlines()[0]))
        say("Dry run: no key read, no network call, nothing written.")
        return 0
    if chars > args.max_chars:
        raise ToolError(f"Refusing: {chars} characters exceeds --max-chars {args.max_chars}. "
                        "Use --only SCENE or raise the budget deliberately.")
    if args.narrator:
        return run_narrator(args, scenes, todo, voices, key_path, out_dir, opener, say)
    if todo:
        missing = sorted({item["voice"] for item in todo if item["voice"] not in voices and not args.voice_id})
        if missing:
            raise ToolError(f"No voice id for {', '.join(missing)}: pass --voice-id ID or --voice NAME=ID.")
        key = read_key(key_path)
        out_dir.mkdir(parents=True, exist_ok=True)
        try:
            for item in todo:
                data = synthesize(item["text"], voices.get(item["voice"], args.voice_id), key, args.model,
                                  args.format, opener=opener)
                temporary = item["path"].with_suffix(".mp3.part")
                temporary.write_bytes(data)
                os.replace(temporary, item["path"])
                say(f"wrote {item['path'].name} ({mp3_duration(data):.1f} s, {len(data)} bytes)")
        finally:
            del key
            manifest = write_manifest(scenes, out_dir, args.model)
            say(f"Manifest: {out_dir / 'manifest.json'} ({sum(len(s['lines']) for s in manifest['scenes'])} lines)")
    else:
        manifest = write_manifest(scenes, out_dir, args.model)
        say(f"Nothing to generate. Manifest: {out_dir / 'manifest.json'} "
            f"({sum(len(s['lines']) for s in manifest['scenes'])} lines)")
    return 0


def run_narrator(args, scenes, todo, voices, key_path, out_dir, opener, say) -> int:
    """Credit check, then the lines that fit (priority first), then the merged v1 manifest."""
    if not todo:
        manifest = write_manifest_v1(scenes, out_dir)
        say(f"Nothing to generate. Manifest: {out_dir / 'manifest.json'} ({len(manifest['lines'])} lines)")
        return 0
    missing = sorted({item["voice"] for item in todo if item["voice"] not in voices and not args.voice_id})
    if missing:
        raise ToolError(f"No voice id for {', '.join(missing)}: pass --voice-id ID or --voice NAME=ID.")
    key = read_key(key_path)
    written = 0
    send = []
    try:
        needed = sum(len(item["text"]) for item in todo)
        try:
            credit = remaining_characters(key, opener=opener)
        except ToolError as error:
            if not args.without_credit_check:
                raise
            credit = None
            say(f"Credit check unavailable ({str(error).split(';')[0]}); sending the priority 1 lines in order "
                "and stopping at the first refusal.")
        if credit is not None:
            say(f"Characters used: {credit['used']}, limit: {credit['limit']}, remaining: {credit['remaining']}; "
                f"this run needs {needed} (+{round(CREDIT_MARGIN * 100)}% margin: {round(needed * (1 + CREDIT_MARGIN))}).")
            send, skipped = fit_to_credits(todo, credit["remaining"])
        else:
            send, skipped = sorted(todo, key=lambda item: item.get("priority", 2)), []
        if skipped:
            say(f"Not enough credits for every line: sending {len(send)} lines by priority, "
                f"leaving {len(skipped)} for later: {', '.join(item['line'] for item in skipped)}.")
        out_dir.mkdir(parents=True, exist_ok=True)
        try:
            for item in send:
                data = synthesize(item["text"], voices.get(item["voice"], args.voice_id), key, args.model,
                                  args.format, opener=opener)
                temporary = item["path"].with_suffix(".mp3.part")
                temporary.write_bytes(data)
                os.replace(temporary, item["path"])
                written += 1
                say(f"wrote {item['path'].name} ({mp3_duration(data):.1f} s, {len(data)} bytes)")
        finally:
            manifest = write_manifest_v1(scenes, out_dir)
            say(f"Manifest: {out_dir / 'manifest.json'} ({len(manifest['lines'])} lines in all)")
    finally:
        del key
    sent = sum(len(item["text"]) for item in send[:written])
    say(f"Narrator: {written} lines written, {sent} characters sent, {len(todo) - written} lines without audio.")
    return 0


def main(argv=None) -> int:
    try:
        return run(argv)
    except ToolError as error:
        print(f"generate.py: {error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("generate.py: interrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
