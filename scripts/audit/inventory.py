#!/usr/bin/env python3
"""Build the G27 lockfile SBOM and licence inventory; never import the application.

Default operation is offline. --refresh-metadata reads only public npm/PyPI metadata.
No application URL, credential file, environment secret or installed app is inspected.
"""

import argparse
import base64
import hashlib
import json
import subprocess
import tomllib
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent


def read_inputs():
    npm = json.loads((ROOT / "frontend/package-lock.json").read_text())
    uv = tomllib.loads((ROOT / "backend/uv.lock").read_text())
    return npm, uv


def records(npm, uv):
    """Include dev and all-platform optional packages, not only this Linux install."""
    result = []
    for path, package in npm["packages"].items():
        if path:
            name = path.rsplit("node_modules/", 1)[-1]
            result.append(("npm", name, package["version"], package))
    for package in uv["package"]:
        if "registry" in package.get("source", {}):
            result.append(("pypi", package["name"], package["version"], package))
    return result


def key(ecosystem, name, version):
    return f"{ecosystem}:{name}@{version}"


def purl(ecosystem, name, version):
    return f"pkg:{ecosystem}/{quote(name, safe='/')}@{quote(version)}"


def refresh(rows):
    evidence = {}
    for ecosystem, name, version, _ in rows:
        if ecosystem == "npm":
            url = f"https://registry.npmjs.org/{quote(name, safe='')}/{version}"
        else:
            url = f"https://pypi.org/pypi/{quote(name)}/{version}/json"
        with urlopen(url, timeout=30) as response:
            payload = json.load(response)
        info = payload if ecosystem == "npm" else payload["info"]
        # Keep licence metadata only; never copy arbitrary descriptions or credentials.
        evidence[key(ecosystem, name, version)] = {
            "url": url,
            "name": info["name"],
            "version": info["version"],
            "license": info.get("license"),
            "license_expression": info.get("license_expression"),
            "license_classifiers": [c for c in info.get("classifiers", [])
                                    if c.startswith("License ::")],
        }
        if info["version"] != version:
            raise ValueError(f"Version mismatch for {name}")
    (OUT / "license-metadata.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return evidence


def runtime_python(uv):
    packages = {p["name"]: p for p in uv["package"]}
    todo = [d["name"] for d in packages["the-great-plot-twist"]["dependencies"]]
    names = set()
    while todo:
        name = todo.pop()
        if name not in names:
            names.add(name)
            todo.extend(d["name"] for d in packages[name].get("dependencies", []))
    return names


def license_name(metadata, package):
    value = metadata.get("license_expression") or metadata.get("license") or package.get("license")
    if isinstance(value, dict):
        value = value.get("type")
    if value and len(value) < 200:
        return value
    classifiers = metadata.get("license_classifiers", [])
    return "; ".join(c.removeprefix("License :: ") for c in classifiers) or "NOASSERTION"


def generate(npm, uv, rows, evidence):
    runtime = runtime_python(uv)
    root_ref = "the-great-plot-twist"
    components, dependencies, inventory = [], [], []
    by_npm_name = {}
    for ecosystem, name, version, _ in rows:
        if ecosystem == "npm":
            by_npm_name[name] = purl(ecosystem, name, version)
    for ecosystem, name, version, package in rows:
        ref = purl(ecosystem, name, version)
        metadata = evidence[key(ecosystem, name, version)]
        license_text = license_name(metadata, package)
        is_runtime = name in runtime if ecosystem == "pypi" else not package.get("dev", False)
        component = {
            "type": "library", "bom-ref": ref, "name": name, "version": version,
            "purl": ref, "licenses": [{"license": {"name": license_text}}],
            "properties": [
                {"name": "g27:ecosystem", "value": ecosystem},
                {"name": "g27:runtime", "value": str(is_runtime).lower()},
                {"name": "g27:optional", "value": str(package.get("optional", False)).lower()},
                {"name": "g27:license-evidence", "value": metadata["url"]},
            ],
        }
        hashes = []
        if ecosystem == "npm" and package.get("integrity"):
            algorithm, digest = package["integrity"].split("-", 1)
            hashes.append({"alg": algorithm.upper().replace("SHA", "SHA-"),
                           "content": base64.b64decode(digest).hex()})
        if hashes:
            component["hashes"] = hashes
        components.append(component)
        children = []
        if ecosystem == "pypi":
            versions = {p["name"]: p["version"] for p in uv["package"]}
            children = [purl("pypi", d["name"], versions[d["name"]])
                        for d in package.get("dependencies", [])]
        else:
            children = [by_npm_name[n] for n in package.get("dependencies", {}) if n in by_npm_name]
            children += [by_npm_name[n] for n in package.get("optionalDependencies", {})
                         if n in by_npm_name]
        dependencies.append({"ref": ref, "dependsOn": sorted(set(children))})
        inventory.append({"ecosystem": ecosystem, "name": name, "version": version,
                          "runtime": is_runtime, "license": license_text,
                          "evidence": metadata["url"]})
    # This lock has unique npm names. Refuse silent flattening if future nesting changes that.
    assert len(by_npm_name) == sum(r[0] == "npm" for r in rows), "Nested duplicate npm names"
    assert len({c["bom-ref"] for c in components}) == len(rows)
    commit = subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT, text=True).strip()
    lock_properties = [{"name": "g27:reviewed-commit", "value": commit}]
    for path in ("frontend/package-lock.json", "backend/uv.lock"):
        lock_properties.append({"name": f"g27:sha256:{path}",
                                "value": hashlib.sha256((ROOT / path).read_bytes()).hexdigest()})
    application = next(p for p in uv["package"] if p["name"] == root_ref)
    python_roots = {d["name"] for d in application["dependencies"]}
    for group in application.get("dev-dependencies", {}).values():
        python_roots.update(d["name"] for d in group)
    npm_roots = set(npm["packages"][""].get("dependencies", {}))
    npm_roots.update(npm["packages"][""].get("devDependencies", {}))
    root_dependencies = [purl(e, n, v) for e, n, v, _ in rows
                         if (e == "pypi" and n in python_roots)
                         or (e == "npm" and n in npm_roots)]
    dependencies.append({"ref": root_ref, "dependsOn": sorted(root_dependencies)})
    bom = {"bomFormat": "CycloneDX", "specVersion": "1.6", "version": 1,
           "metadata": {"component": {"type": "application", "name": root_ref,
                                        "bom-ref": root_ref, "version": commit},
                        "properties": lock_properties},
           "components": components, "dependencies": dependencies}
    (OUT / "sbom.cdx.json").write_text(json.dumps(bom, indent=2) + "\n")
    (OUT / "dependency-licenses.json").write_text(json.dumps(inventory, indent=2) + "\n")
    pins = [f"{n}=={v}" for e, n, v, _ in rows if e == "pypi"]
    (OUT / "python-requirements.txt").write_text("\n".join(pins) + "\n")
    print(f"Wrote {len(components)} components; {sum(r['runtime'] for r in inventory)} runtime")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-metadata", action="store_true")
    args = parser.parse_args()
    npm, uv = read_inputs()
    rows = records(npm, uv)
    evidence = refresh(rows) if args.refresh_metadata else json.loads((OUT / "license-metadata.json").read_text())
    generate(npm, uv, rows, evidence)
