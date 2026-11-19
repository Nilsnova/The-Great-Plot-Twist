"""Prepare only a separate official anonymous-enabled Auth service on loopback."""

import argparse
import subprocess
from copy import deepcopy
from pathlib import Path

from tools.authenticated_economy.config import compose, load, private_json


def guest_compose(runtime: dict) -> dict:
    """Reuse the real local project without changing its primary Auth configuration."""
    auth = deepcopy(compose(runtime)["services"]["auth"])
    auth["ports"] = ["127.0.0.1:54426:9999"]
    auth["environment"]["GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED"] = "true"
    auth["networks"] = ["provider"]
    return {
        "services": {"guest-auth": auth},
        "networks": {"provider": {"external": True, "name": "mp505_default"}},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("up", "down"))
    parser.add_argument("--runtime", type=Path, default=Path("/tmp/mp505-provider/runtime.json"))
    args = parser.parse_args()
    runtime = load(args.runtime)
    location = Path(runtime["directory"]) / "guest-compose.json"
    private_json(location, guest_compose(runtime))
    command = ["docker", "compose", "-p", "mp505-guest", "-f", str(location)]
    command.extend(["up", "-d"] if args.action == "up" else ["down", "--volumes"])
    subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
