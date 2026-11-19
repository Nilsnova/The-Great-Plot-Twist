"""Separate demo-enabled local API for genuine anonymous invitation acceptance."""

import argparse
import hashlib
import json
import os
import subprocess
from dataclasses import replace
from pathlib import Path

import uvicorn

from server.app import create_app
from tools.authenticated_economy.application import local_settings
from tools.authenticated_economy.config import load, private_json


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path("/tmp/mp505-provider/runtime.json"))
    args = parser.parse_args()
    runtime = load(args.runtime)
    root = Path(__file__).resolve().parents[3]
    source_module = (root / "frontend/scripts/authenticated-economy/source.mjs").as_uri()
    expression = (
        "import {sourceEvidence} from "
        + json.dumps(source_module)
        + ";process.stdout.write(JSON.stringify(sourceEvidence(process.argv[1])));"
    )
    evidence = json.loads(
        subprocess.check_output(
            ["node", "--input-type=module", "-e", expression, runtime["expectedCommit"]],
            text=True,
        )
    )
    os.environ["SSL_CERT_FILE"] = runtime["caFile"]
    settings = local_settings(runtime)
    settings = replace(settings, flags={**settings.flags, "demo": True})
    private_json(
        Path(runtime["directory"]) / "guest-api-source.json",
        {
            **evidence,
            "service": "guest-api",
            "processId": os.getpid(),
            "sourceRoot": str(root),
            "apiUrl": "http://127.0.0.1:58008",
            "demoFlag": True,
            "demoMode": settings.demo_mode,
            "wrapperSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        },
    )
    uvicorn.run(create_app(settings=settings), host="127.0.0.1", port=58008, access_log=False)


if __name__ == "__main__":
    main()
