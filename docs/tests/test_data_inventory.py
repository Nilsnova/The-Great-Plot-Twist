"""Check current table and column coverage after the ordered SQL migration chain.

Used by: G26 documentation review; run unittest discovery from the repository root.
This reads schema declarations only, not a live database or provider settings.
"""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TABLE = re.compile(
    r"^create\s+table\s+(?:if\s+not\s+exists\s+)?"
    r"(?P<name>[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\((?P<body>.*?)^\);",
    re.MULTILINE | re.DOTALL | re.IGNORECASE,
)
ADDED_COLUMN = re.compile(
    r"^alter\s+table\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+add\s+column\s+"
    r"(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s+",
    re.MULTILINE | re.IGNORECASE,
)


def declared_columns(body):
    """Split fields at outer commas, keeping quoted strings and checks together."""
    fields = [""]
    depth = 0
    for match in re.finditer(r"'(?:''|[^'])*'|[(),]|[^'(),]+", body):
        token = match[0]
        if token == "," and depth == 0:
            fields.append("")
            continue
        if token == "(":
            depth += 1
        elif token == ")":
            depth -= 1
        fields[-1] += token
    columns = set()
    for field in fields:
        name = re.match(r"\s*([a-z_][a-z0-9_]*)\b", field, re.IGNORECASE)
        if name is None:
            raise AssertionError("Review unsupported column syntax")
        if name[1].lower() not in {"constraint", "primary", "unique", "check", "foreign"}:
            columns.add(name[1].lower())
    return columns


def migration_columns():
    """Read this repo's CREATE TABLE and ALTER TABLE ADD COLUMN declarations."""
    schema = {}
    migrations = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    if not migrations:
        raise AssertionError("No migrations found: coverage must not pass vacuously")
    for migration in migrations:
        sql = re.sub(r"--[^\n]*", "", migration.read_text(encoding="utf-8"))
        for table in re.findall(
            r"^drop\s+table\s+(?:if\s+exists\s+)?(\w+\.\w+)\s*;",
            sql,
            re.MULTILINE | re.IGNORECASE,
        ):
            schema.pop(table.lower(), None)
        tables = list(TABLE.finditer(sql))
        # Fail rather than silently ignore a future declaration with unsupported syntax.
        declarations = re.findall(r"^create\s+table\b", sql, re.MULTILINE | re.IGNORECASE)
        if len(tables) != len(declarations):
            raise AssertionError(f"Review CREATE TABLE parsing in {migration.name}")
        for table in tables:
            columns = declared_columns(table["body"])
            if not columns:
                raise AssertionError(f"No columns parsed for {table['name']}")
            schema.setdefault(table["name"].lower(), set()).update(columns)
        additions = ADDED_COLUMN.findall(sql)
        declarations = re.findall(
            r"^alter\s+table\s+\S+\s+add\s+column\b", sql, re.MULTILINE | re.IGNORECASE
        )
        if len(additions) != len(declarations):
            raise AssertionError(f"Review ADD COLUMN parsing in {migration.name}")
        for table, column in additions:
            if table.lower() not in schema:
                raise AssertionError(f"Added column refers to unknown table {table}")
            schema[table.lower()].add(column.lower())
    return schema


def inventory_sections(text):
    """A mention in another paragraph must not count as a table's inventory."""
    sections = {}
    heading = re.compile(r"^### (public\.[a-z_][a-z0-9_]*)$", re.MULTILINE)
    headings = list(heading.finditer(text))
    for index, match in enumerate(headings):
        if match[1] in sections:
            raise AssertionError(f"Duplicate inventory section: {match[1]}")
        end = headings[index + 1].start() if index + 1 < len(headings) else len(text)
        sections[match[1]] = set(
            re.findall(r"^\| `([a-z_][a-z0-9_]*)` \|", text[match.end():end], re.MULTILINE)
        )
    return sections


class DataInventoryCoverage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = migration_columns()
        text = (ROOT / "docs/DATA-INVENTORY.md").read_text(encoding="utf-8")
        cls.inventory = inventory_sections(text)

    def test_every_migration_table_has_its_own_inventory_section(self):
        self.assertEqual(set(self.schema), set(self.inventory))

    def test_every_declared_or_added_column_is_documented(self):
        for table, columns in self.schema.items():
            with self.subTest(table=table):
                self.assertEqual(columns, self.inventory.get(table, set()))


if __name__ == "__main__":
    unittest.main()
