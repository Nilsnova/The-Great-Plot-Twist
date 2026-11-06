"""Fresh 4096×3072 canonical island painting with fine grass, shore and path material."""

from math import sin
from random import Random
from subprocess import check_output

import numpy as np
from common import blend
from PIL import Image, ImageDraw


def ground(root):
    width, height = 4096, 3072
    raw = check_output(["node", "scripts/hires_art/export-ground.mjs"], cwd=root)
    assert len(raw) == width * height
    classes = np.frombuffer(raw, dtype=np.uint8).reshape(height, width)
    kind = classes & 3
    land = kind != 0
    xx = np.arange(width, dtype=np.float32)[None, :]
    yy = np.arange(height, dtype=np.float32)[:, None]
    broad = (np.sin(xx / 201) + np.cos(yy / 173) + np.sin((xx + yy) / 311)) * 7 + 31
    indices = np.clip(broad, 0, 63).astype(np.uint8) + 32
    sand = (10 + ((xx // 23 + yy // 19) % 12)).astype(np.uint8)
    indices[kind == 1] = sand[kind == 1]
    indices[~land] = 255
    palette = []
    for i in range(256):
        if 32 <= i < 96:
            color = blend("#497b68", "#99b580", (i - 32) / 63)
        elif i < 32:
            color = blend("#a6ac89", "#d6c8a0", i / 31)
        else:
            color = (80, 128, 118)
        palette.extend(color)
    image = Image.fromarray(indices, "P")
    image.putpalette(palette)
    image.info["transparency"] = 255
    image = image.convert("RGBA")
    draw = ImageDraw.Draw(image)
    # Fine wet coastline bands follow newly sampled native land boundaries.
    coast = land & ~np.roll(land, -5, axis=0)
    rgba = np.asarray(image).copy()
    rgba[coast] = [100, 145, 130, 255]
    image = Image.fromarray(rgba)
    draw = ImageDraw.Draw(image)
    mask = Image.new("L", (width, height))
    md = ImageDraw.Draw(mask)

    def point(x, z):
        return (round(width / 2 + x * 64), round(height / 2 + z * 64 * 0.72))

    paths = [
        ([(-2, 18), (-2, 13), (-3, 9), (-4, 6), (0, 4), (3, 0), (4, -4), (6, -5), (9, -5.2)], 72),
        ([(-4, 6), (-5.5, 6.2), (-7, 5.2)], 64),
        ([(-2, 16.5), (-4.4, 17), (-7, 16.8)], 68),
    ]
    for route, radius in paths:
        for a, b in zip(route, route[1:], strict=False):
            p, q = point(*a), point(*b)
            steps = max(abs(q[0] - p[0]), abs(q[1] - p[1]), 1)
            for t in range(0, steps + 1, 3):
                x = p[0] + (q[0] - p[0]) * t / steps
                y = p[1] + (q[1] - p[1]) * t / steps
                r = radius + sin(x / 52 + y / 68) * 8
                md.ellipse(
                    (round(x - r), round(y - r * 0.72), round(x + r), round(y + r * 0.72)), fill=255
                )
    path = np.asarray(mask) > 0
    path &= land
    rgba = np.asarray(image).copy()
    # Seeded fine sand has no repeating screen-space weave or diagonal moiré.
    grain = np.random.default_rng(4732).integers(-4, 5, size=(height, width), dtype=np.int16)
    for channel, base in enumerate([190, 170, 132]):
        plane = rgba[:, :, channel]
        plane[path] = (base + grain[path]).clip(0, 255).astype(np.uint8)
    image = Image.fromarray(rgba)
    draw = ImageDraw.Draw(image)
    rng = Random(4732)
    # Actual sub-pixel blades and stalks; detail is drawn at 64px/world unit, not resized.
    for _ in range(62000):
        x = rng.randrange(8, width - 12)
        y = rng.randrange(8, height - 14)
        if kind[y, x] != 2 or path[y, x]:
            continue
        length = rng.randrange(2, 9)
        color = rng.choice(["#5b8d6b", "#8cad7b", "#9dbb87", "#467c64", "#6c9a72"])
        draw.line([(x, y + length), (x + rng.randrange(-2, 3), y)], fill=color, width=1)
        if _ % 4 == 0:
            draw.line([(x, y + length - 1), (x + 4, y + 2)], fill="#7ea778", width=1)
    # Irregular pebbles, little seed heads and worn path highlights are newly authored.
    for _ in range(19000):
        x = rng.randrange(8, width - 12)
        y = rng.randrange(8, height - 14)
        if not land[y, x]:
            continue
        if path[y, x]:
            if _ % 3:
                continue
            r = rng.randrange(1, 4)
            color = rng.choice(["#cfc09b", "#9c9982", "#b3ad8c", "#e0cfaa"])
            draw.ellipse((x - r, y - 1, x + r, y + 1), fill=color)
            draw.line((x - r, y, x + r - 1, y), fill="#aa9d7d")
        elif _ % 13 == 0:
            draw.line((x, y + 4, x + 1, y), fill="#d9ca8e")
            draw.ellipse((x - 1, y - 1, x + 2, y + 1), fill="#e4d8a3")
    # Canonical hill ledge, carved into stone courses rather than a blocky brown stripe.
    for x in range(0, width, 2):
        rows = np.where((classes[:, x] & 8) != 0)[0]
        if not len(rows):
            continue
        edge = int(rows[-1])
        depth = 68 + round(sin(x / 19) * 5)
        for offset in range(depth):
            color = blend("#a0a68b", "#36595a", offset / depth)
            draw.line((x, edge + offset, x + 1, edge + offset), fill=color)
        for offset in [14, 31, 48]:
            draw.line((x, edge + offset, x + 1, edge + offset), fill="#667f70")
        if x % 19 < 2:
            draw.line((x, edge + 3, x, edge + 54), fill="#3d5f5b")
        draw.line((x, edge, x + 1, edge + 1), fill="#b6bf91")
    # A compact indexed encoding preserves the authored transparent coast and dense detail.
    return image.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
