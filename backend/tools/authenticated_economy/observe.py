"""Independent committed-state observer and explicit disposable installer operations."""

import argparse
import json
import re
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from tools.authenticated_economy.config import load


def encode(value: object) -> str:
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(type(value).__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path("/tmp/mp505-provider/runtime.json"))
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()
    runtime = load(args.runtime)
    request = json.load(sys.stdin)
    statement, parameters = request["statement"], request.get("parameters", [])
    indices = [int(value) - 1 for value in re.findall(r"\$([1-9][0-9]*)", statement)]
    if indices:
        statement = re.sub(r"\$[1-9][0-9]*", "%s", statement)
        parameters = [parameters[index] for index in indices]
    if args.install and not request.get("purpose"):
        raise RuntimeError("Explicit disposable installer purpose is required")
    with psycopg.connect(
        host="127.0.0.1",
        port=54422,
        dbname="postgres",
        user="postgres",
        password=runtime["databasePassword"],
        row_factory=dict_row,
    ) as connection:
        if not args.install:
            connection.execute("set transaction read only")
        cursor = connection.execute(statement, parameters)
        result = cursor.fetchall() if cursor.description else []
    print(json.dumps(result, default=encode))


if __name__ == "__main__":
    main()
