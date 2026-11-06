"""CLI: uv run --with pgserver --with 'psycopg[binary]' python -m tools.seed ..."""

import argparse
import json

import psycopg

from tools.seed.database import connect
from tools.seed.demo import seed


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed only an explicitly marked local scratch DB.")
    parser.add_argument(
        "--database-url", required=True, help="Explicit local URL; never read .env."
    )
    parser.add_argument(
        "--scratch", action="store_true", help="Confirm this is disposable scratch."
    )
    parser.add_argument(
        "--reset", action="store_true", help="Replace G22 fixture users/crews only."
    )
    args = parser.parse_args()
    try:
        with connect(args.database_url, scratch=args.scratch) as conn:
            report = seed(conn, reset=args.reset)
    except (ValueError, psycopg.Error) as error:
        # libpq error strings can contain supplied URLs/passwords. Do not echo them.
        message = str(error) if isinstance(error, ValueError) else type(error).__name__
        parser.exit(1, f"Seed refused: {message}\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
