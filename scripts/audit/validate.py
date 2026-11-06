#!/usr/bin/env python3
"""Check local G27 evidence against locks, routes, documentation and tracked assets."""

import ast
import hashlib
import json
import re
import subprocess
from pathlib import Path

from inventory import OUT, ROOT, purl, read_inputs, records


def load(name):
    return json.loads((OUT / name).read_text())


def main():
    npm, uv = read_inputs()
    rows = records(npm, uv)
    expected = {purl(e, n, v) for e, n, v, _ in rows}
    sbom = load("sbom.cdx.json")
    assert {c["bom-ref"] for c in sbom["components"]} == expected
    assert len(sbom["components"]) == len(rows) == 90
    assert len(load("dependency-licenses.json")) == len(rows)
    for edge in sbom["dependencies"]:
        assert set(edge["dependsOn"]) <= expected
    graph = {edge["ref"]: edge["dependsOn"] for edge in sbom["dependencies"]}
    visited, todo = set(), ["the-great-plot-twist"]
    while todo:
        reference = todo.pop()
        if reference not in visited:
            visited.add(reference)
            todo.extend(graph.get(reference, []))
    assert expected <= visited, "Disconnected dependency components"
    receipt = load("audit-run.json")
    for path, digest in receipt["lockfile_sha256"].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest
        assert subprocess.check_output(["git", "show", f"origin/main:{path}"], cwd=ROOT) == (ROOT / path).read_bytes()
    assert load("npm-audit.json")["metadata"]["vulnerabilities"]["total"] == 0
    audit = load("pip-audit.json")["dependencies"]
    assert {(p["name"], p["version"]) for p in audit} == {(n, v) for e, n, v, _ in rows if e == "pypi"}
    assert all(not p.get("vulns") and not p.get("skip_reason") for p in audit)
    schema_receipt = load("sbom-schema-validation.json")
    assert schema_receipt["sbom_sha256"] == hashlib.sha256((OUT / "sbom.cdx.json").read_bytes()).hexdigest()

    threat = (ROOT / "docs/THREAT-MODEL.md").read_text()
    routes = []
    for path in (ROOT / "backend/server/routes").glob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute):
                    if isinstance(decorator.func.value, ast.Name) and decorator.func.value.id == "router":
                        route = ast.literal_eval(decorator.args[0])
                        entry = f'{decorator.func.attr.upper()} `/api{route}`'
                        assert entry in threat, f"Undocumented route: {entry}"
                        routes.append(entry)
    assert len(routes) == 20

    documents = [ROOT / "docs" / name for name in
                 ("SECURITY.md", "THREAT-MODEL.md", "LICENSES-THIRD-PARTY.md")]
    documents += sorted((ROOT / "docs/handoff").glob("g27-checkpoint-*.md"))
    documents += [OUT / "README.md"]
    for path in documents:
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", path.read_text()):
            if target.startswith(("http:", "https:", "#")):
                continue
            destination = (path.parent / target.split("#", 1)[0]).resolve()
            assert destination.exists(), f"Broken local link in {path}: {target}"
    # Validate full path:line references without accessing deployment or secret files.
    for path in documents:
        for target, line in re.findall(r"`((?:backend|frontend|docs|supabase)/[^`:]+):(\d+)`", path.read_text()):
            referenced = ROOT / target
            assert referenced.is_file(), f"Missing reference: {target}"
            assert 0 < int(line) <= len(referenced.read_text().splitlines()), (target, line)

    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    count = lambda prefix, suffix: sum(p.startswith(prefix) and p.endswith(suffix) for p in tracked)
    assert count("frontend/public/pixel/", ".png") == 186
    assert count("frontend/public/places/", ".png") == 9
    assert count("frontend/archive/paper/", ".svg") == 117
    assert count("frontend/captures/", ".png") == 149
    print("PASS: 90 SBOM/licence components, unchanged locks, 28 Python audit pins, 20 routes, local links/references, asset counts")


if __name__ == "__main__":
    main()
