"""Draw the original four-density kit. Authoring only: Python Pillow/numpy and Node."""

import hashlib
import json
from pathlib import Path

from buildings import boathouse, cottage, lighthouse
from common import DENSITY
from ground import ground
from nature import flowers, rock, shrub, tree, undergrowth
from people import person
from props import SIZES, prop

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / "public/pixel/hd"
FOLDER.mkdir(parents=True, exist_ok=True)
assets = {
    "cottage": cottage(),
    "cottage-interior": cottage(True),
    "cottage-glow": cottage(glow=True),
    "boathouse": boathouse(),
    "lighthouse": lighthouse(),
    "birch": tree(),
    "oak": tree(variant=1),
    "birch-tall": tree(variant=2),
    "pine": tree(True),
    "rock": rock(),
    "shrub": shrub(),
    "flowers": flowers(),
}
for name in ["grass-tuft", "fern", "reeds", "mushrooms"]:
    assets[name] = undergrowth(name)
for view, name in [("front", "explorer"), ("back", "explorer-back"), ("side", "explorer-side")]:
    assets[name] = person(view)
    for step in [1, 2]:
        assets[f"{name}-walk-{step}"] = person(view, step)
for name in SIZES:
    assets[name] = prop(name)
manifest = {
    "density": DENSITY,
    "logicalPixelsPerUnit": 16,
    "source": "scripts/hires_art/generate.py",
    "assets": {},
}
for name, image in assets.items():
    path = FOLDER / f"{name}.png"
    image.save(path, optimize=True)
    manifest["assets"][name] = {
        "file": f"hd/{name}.png",
        "width": image.width,
        "height": image.height,
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
image = ground(ROOT)
path = FOLDER / "ground.png"
image.save(path, optimize=True)
manifest["ground"] = {
    "file": "pixel/hd/ground.png",
    "width": image.width,
    "height": image.height,
    "bytes": path.stat().st_size,
    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
}
(FOLDER / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Freshly drew {len(assets)} original sprites and {image.width}×{image.height} ground")
transfer = sum(row["bytes"] for row in manifest["assets"].values()) + manifest["ground"]["bytes"]
print(f"Transfer {transfer:,} bytes")
