"""Start/stop only this checkout's disposable development stack (stdlib only)."""

import argparse
import fcntl
import hashlib
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def clean_environment() -> dict[str, str]:
    """Keep tool/proxy configuration, discard all application and libpq bindings."""
    exact = {
        "DATABASE_URL",
        "APP_ENV",
        "DEMO_MODE",
        "FEATURE_FLAGS",
        "CRON_SECRET",
        "HOST_PLAYER_IDS",
        "UV_ENV_FILE",
        "NODE_OPTIONS",
        "G22_API_PORT",
    }
    prefixes = ("SUPABASE_", "VITE_", "PG", "WEATHER_", "MARKET_", "SPORTS_", "LLM_")
    return {
        key: value
        for key, value in os.environ.items()
        if key not in exact and not key.startswith(prefixes)
    }


def default_state() -> Path:
    digest = hashlib.sha256(str(ROOT).encode()).hexdigest()[:10]
    return Path(tempfile.gettempdir()) / f"plot-twist-g22-{os.getuid()}-{digest}"


def talk(state: Path, command: str) -> dict | None:
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(2)
            client.connect(str(state / "control.sock"))
            client.sendall(command.encode())
            return json.loads(client.recv(8192))
    except (OSError, ValueError):
        return None


def uv_command() -> list[str]:
    return [
        "uv",
        "run",
        "--project",
        str(ROOT / "backend"),
        "--frozen",
        "--no-env-file",
        "--with",
        "pgserver",
        "--with",
        "psycopg[binary]",
        "python",
        str(ROOT / "scripts/dev/supervisor.py"),
    ]


def show(result: dict, state: Path) -> None:
    print(f"Game: {result['gameUrl']}\nAPI docs: {result['apiUrl']}/api/docs")
    print(f"Scratch database URL: {state / 'database-url'}\nLog: {state / 'dev.log'}")
    print("Choose a demo player in the local sign-in panel. No real keys are used.")
    print(
        "Stop and delete the scratch database: scripts/dev/stop.sh"
        + (f" --state-dir {state}" if state != default_state() else "")
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["start", "stop"])
    parser.add_argument("--state-dir", type=Path, default=default_state())
    parser.add_argument("--api-port", type=int, default=8000)
    parser.add_argument("--web-port", type=int, default=5173)
    parser.add_argument(
        "--check-migrations",
        action="store_true",
        help="Apply all migrations twice to a fresh scratch DB, then delete it.",
    )
    args = parser.parse_args()
    state = args.state_dir.absolute()
    if state.is_symlink():
        parser.error("The state directory must not be a symlink.")
    env = clean_environment()
    if args.check_migrations:
        sys.exit(subprocess.call(uv_command() + ["--check-migrations"], cwd=ROOT, env=env))
    if args.api_port == args.web_port or not all(
        1 <= port <= 65535 for port in [args.api_port, args.web_port]
    ):
        parser.error("Choose two different ports between 1 and 65535.")
    if args.command == "stop" and not state.exists():
        print("No G22 stack is running.")
        return
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    owner = state / "checkout"
    if owner.exists() and owner.read_text() != str(ROOT):
        parser.error("This state directory belongs to another checkout.")
    if not owner.exists():
        if any(state.iterdir()):
            parser.error("Choose an empty state directory.")
        owner.write_text(str(ROOT))
    with (state / "lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        current = talk(state, "status")
        if args.command == "stop":
            if current is None:
                print("No responding G22 supervisor. No unrelated process was killed.")
                return
            talk(state, "stop")
            for _ in range(100):
                if not (state / "control.sock").exists():
                    print("Stopped API, Vite and scratch Postgres; scratch data deleted.")
                    return
                time.sleep(0.1)
            parser.exit(1, f"Cleanup is still pending; inspect {state / 'dev.log'}.\n")
        if current is not None:
            show(current, state)
            return
        for executable in ["uv", "node", "npm"]:
            if shutil.which(executable) is None:
                parser.error(f"Install {executable} first; see docs/DEVELOPING.md.")
        # Fail before installation if requested ports are already owned by another service.
        for port in [args.api_port, args.web_port]:
            with socket.socket() as probe:
                try:
                    probe.bind(("127.0.0.1", port))
                except OSError:
                    parser.error(f"Port {port} is busy; choose --api-port/--web-port.")
        subprocess.run(
            ["npm", "ci", "--include=dev", "--no-audit", "--no-fund"],
            cwd=ROOT / "frontend",
            env=env,
            check=True,
        )
        with (state / "dev.log").open("w") as log:
            process = subprocess.Popen(
                uv_command()
                + [
                    "--state-dir",
                    str(state),
                    "--api-port",
                    str(args.api_port),
                    "--web-port",
                    str(args.web_port),
                ],
                cwd=ROOT,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        try:
            for _ in range(1200):
                if process.poll() is not None:
                    parser.exit(1, f"Startup failed; inspect {state / 'dev.log'}.\n")
                result = talk(state, "status")
                if result is not None:
                    show(result, state)
                    return
                time.sleep(0.1)
            parser.exit(1, f"Startup timed out; inspect {state / 'dev.log'}.\n")
        except BaseException:
            # This process group was created above; never signal an arbitrary saved PID.
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=30)
            raise


if __name__ == "__main__":
    main()
