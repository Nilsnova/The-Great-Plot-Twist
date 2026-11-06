"""Own the scratch Postgres handle, API thread and Vite process until stop.sh."""

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

import pgserver
import uvicorn

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from local_api import make_app  # noqa: E402

from tools.seed.database import apply_migrations, bootstrap, connect  # noqa: E402
from tools.seed.demo import seed  # noqa: E402


def prepare(pgdata: Path, *, twice: bool = False):
    server = pgserver.get_server(pgdata, cleanup_mode="delete")
    try:
        # The handle creates this Unix-socket-only Postgres; no caller-supplied remote URL.
        url = server.get_uri()
        with connect(url, scratch=True) as conn:
            bootstrap(conn)
            first = apply_migrations(conn)
            report = seed(conn)
            if twice:
                second = apply_migrations(conn)
                if second != first:
                    raise RuntimeError("Migration chain changed during validation.")
                seed(conn)
        return server, url, first, report
    except BaseException:
        server.cleanup()
        raise


def wait_http(url: str, stopped: threading.Event) -> None:
    # Loopback requests must not depend on a developer's HTTP proxy/no_proxy settings.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(200):
        if stopped.is_set():
            raise RuntimeError("Startup interrupted.")
        try:
            with opener.open(url, timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(0.1)
    raise RuntimeError("Local service did not become ready.")


def run(args: argparse.Namespace) -> None:
    state = args.state_dir
    stopped = threading.Event()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda *_: stopped.set())
    server = vite = api = thread = None
    control_path = state / "control.sock"
    try:
        server, url, migrations, report = prepare(state / "pgdata")
        (state / "database-url").write_text(url + "\n")
        os.chmod(state / "database-url", 0o600)
        app = make_app(url)
        api = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=args.api_port))
        thread = threading.Thread(target=api.run, daemon=True)
        thread.start()
        env = {**os.environ, "G22_API_PORT": str(args.api_port)}
        vite = subprocess.Popen(
            [
                "node",
                str(ROOT / "frontend/node_modules/vite/bin/vite.js"),
                "--config",
                str(ROOT / "scripts/dev/vite.config.mjs"),
                "--port",
                str(args.web_port),
            ],
            cwd=ROOT / "frontend",
            env=env,
        )
        api_url, game_url = f"http://127.0.0.1:{args.api_port}", f"http://127.0.0.1:{args.web_port}"
        wait_http(api_url + "/api/health", stopped)
        wait_http(game_url + "/api/content/intro-story", stopped)
        wait_http(game_url + "/", stopped)
        print(json.dumps({"migrations": migrations, "seed": report}), flush=True)
        info = {"apiUrl": api_url, "gameUrl": game_url}
        control_path.unlink(missing_ok=True)
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as control:
            control.bind(str(control_path))
            control.listen()
            control.settimeout(0.25)
            while not stopped.is_set():
                if not thread.is_alive() or vite.poll() is not None:
                    raise RuntimeError("A development service stopped unexpectedly.")
                try:
                    client, _ = control.accept()
                except TimeoutError:
                    continue
                with client:
                    client.settimeout(2)
                    if client.recv(64) == b"stop":
                        stopped.set()
                    client.sendall(json.dumps(info).encode())
    finally:
        if vite is not None and vite.poll() is None:
            vite.terminate()
            try:
                vite.wait(timeout=5)
            except subprocess.TimeoutExpired:
                vite.kill()
                vite.wait()
        if api is not None:
            api.should_exit = True
        if thread is not None:
            thread.join(timeout=10)
        if server is not None:
            server.cleanup()
        (state / "database-url").unlink(missing_ok=True)
        control_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", type=Path)
    parser.add_argument("--api-port", type=int, default=8000)
    parser.add_argument("--web-port", type=int, default=5173)
    parser.add_argument("--check-migrations", action="store_true")
    args = parser.parse_args()
    if args.check_migrations:
        with tempfile.TemporaryDirectory(prefix="g22-migrations-") as directory:
            server, _, migrations, report = prepare(Path(directory) / "pgdata", twice=True)
            server.cleanup()
        print(json.dumps({"migrationPasses": 2, "migrations": migrations, "seed": report}))
    else:
        run(args)


if __name__ == "__main__":
    main()
