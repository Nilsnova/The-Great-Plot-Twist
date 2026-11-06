#!/usr/bin/env python3
"""Validate the SBOM against fixed public CycloneDX schemas and record exact evidence.

Used manually with isolated jsonschema/referencing tools, not application dependencies.
"""

import hashlib
import json
from importlib.metadata import version
from urllib.request import urlopen

from inventory import OUT
from jsonschema import Draft7Validator
from referencing import Registry, Resource

BASE = "https://raw.githubusercontent.com/CycloneDX/specification/1.6/schema/"
NAMES = ("bom-1.6.schema.json", "spdx.schema.json", "jsf-0.82.schema.json")


def main():
    registry, schemas, evidence = Registry(), {}, {}
    for name in NAMES:
        with urlopen(BASE + name, timeout=30) as response:
            raw = response.read()
        schema = json.loads(raw)
        schemas[name] = schema
        evidence[name] = {"source": BASE + name, "sha256": hashlib.sha256(raw).hexdigest()}
        resource = Resource.from_contents(schema)
        for uri in (schema["$id"], "http://cyclonedx.org/schema/" + name, BASE + name):
            registry = registry.with_resource(uri, resource)
    raw = (OUT / "sbom.cdx.json").read_bytes()
    Draft7Validator(schemas[NAMES[0]], registry=registry).validate(json.loads(raw))
    receipt = {
        "result": "passed",
        "standard": "CycloneDX 1.6 JSON",
        "sbom_sha256": hashlib.sha256(raw).hexdigest(),
        "validator": "jsonschema Draft7Validator with referencing.Registry; public schemas only",
        "schemas": evidence,
        "jsonschema_version": version("jsonschema"),
        "referencing_version": version("referencing"),
    }
    (OUT / "sbom-schema-validation.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("PASS: official CycloneDX 1.6 schemas; receipt refreshed")


if __name__ == "__main__":
    main()
