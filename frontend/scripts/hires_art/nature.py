"""Fine original foliage, bark and shoreline plants, painted directly at four-density."""

from math import cos, pi, sin
from random import Random

import numpy as np
from common import DENSITY, Paint
from PIL import Image, ImageDraw


def tree(pine=False, variant=0):
    p = Paint(80, 112 if pine else 104)
    rng = Random(1190 + variant)
    floor = 104 if pine else 96
    p.shadow(40, floor, 29, 5.5)
    p.gradient(
        [
            (32, 54),
            (47, 54),
            (47, floor - 7),
            (58, floor),
            (46, floor - 2),
            (42, floor + 2),
            (34, floor - 2),
            (22, floor + 1),
            (31, floor - 10),
        ],
        "#897452",
        "#3b5350",
    )
    for x in [32.5, 35, 38.6, 42.4, 45]:
        p.line(
            [(x, 58), (x + 0.9, 73), (x - 0.5, floor - 8)], "#bd9b6c" if x < 39 else "#314b47", 0.5
        )
    for _ in range(90):
        x = rng.uniform(32, 46)
        y = rng.uniform(59, floor - 7)
        p.line(
            [(x, y), (x + rng.uniform(-0.6, 0.6), y + rng.uniform(1, 4))],
            rng.choice(["#6d6148", "#b49565", "#4d5645"]),
            0.25,
        )
    p.line([(35, 70), (23, 52)], "#6d624c", 1.2)
    p.line([(42, 65), (57, 47)], "#4c5848", 1.4)
    if pine:
        for cy, rx, ry in [(76, 33, 18), (63, 30, 18), (49, 26, 19), (35, 21, 17), (22, 14, 16)]:
            points = [
                (40, cy - ry),
                (40 - rx, cy + ry * 0.5),
                (43 - rx, cy + ry),
                (40, cy + ry - 4),
                (37 + rx, cy + ry),
                (40 + rx, cy + ry * 0.5),
            ]
            p.gradient(points, "#518a78", "#244c51")
            p.poly(points, None, "#254849", 0.4)
            for _ in range(round(rx * 6)):
                y = rng.uniform(cy - ry + 4, cy + ry - 1)
                span = rx * (y - (cy - ry)) / (2 * ry)
                x = rng.uniform(40 - span, 40 + span)
                p.line(
                    [(x, y), (x + rng.uniform(-2.5, 2.5), y + 1.3)],
                    rng.choice(["#5e967a", "#79a485", "#3c776b", "#2a5b59"]),
                    0.35,
                )
            p.line([(40, cy - ry + 2), (39, cy + 2), (42 - rx, cy + ry * 0.5)], "#88ad83", 0.45)
        return p.image
    mask = Image.new("L", p.image.size)
    md = ImageDraw.Draw(mask)
    centers = [
        (37, 30, 28, 24),
        (20, 39, 17, 21),
        (58, 40, 18, 23),
        (39, 54, 28, 21),
        (37, 16, 21, 13),
    ]
    yy, xx = np.mgrid[: p.image.height, : p.image.width] / DENSITY
    canopy = np.zeros((p.image.height, p.image.width, 4), dtype=np.uint8)
    for cx, cy, rx, ry in centers:
        cx += rng.uniform(-2, 2)
        cy += rng.uniform(-1.4, 1.4)
        md.ellipse(
            tuple(round(v * DENSITY) for v in (cx - rx, cy - ry, cx + rx, cy + ry)), fill=255
        )
        shape = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
        light = np.clip(0.55 + 0.28 * (xx - cx) / rx + 0.45 * (yy - cy) / ry + 0.13 * shape, 0, 1)
        bright = np.array([129, 163, 106] if variant != 1 else [153, 171, 105])
        dark = np.array([35, 83, 71] if variant != 1 else [56, 91, 63])
        colors = (
            bright[None, None, :] * (1 - light[:, :, None])
            + dark[None, None, :] * light[:, :, None]
        )
        canopy[shape <= 1, :3] = colors[shape <= 1].astype(np.uint8)
        canopy[shape <= 1, 3] = 255
    p.image.alpha_composite(Image.fromarray(canopy))
    p.d = ImageDraw.Draw(p.image)
    # Hundreds of distinct small leaf groups create real new silhouette/material information.
    for _ in range(1250):
        x = rng.uniform(3, 77)
        y = rng.uniform(4, 76)
        xx, yy = round(x * 4), round(y * 4)
        if not mask.getpixel((xx, yy)):
            continue
        base = p.image.getpixel((xx, yy))
        if base[3] == 0:
            continue
        factor = rng.choice([0.87, 0.94, 1.04, 1.1, 1.16])
        shade = tuple(min(255, round(channel * factor)) for channel in base[:3])
        rx = rng.uniform(0.6, 1.65)
        ry = rng.uniform(0.25, 0.75)
        p.ellipse((x - rx, y - ry, x + rx, y + ry), shade)
        if rng.randrange(6) == 0:
            p.line(
                [(x - rx, y), (x + rx * 0.3, y - 0.3)], tuple(min(255, c + 13) for c in shade), 0.25
            )
    for points in [
        [(8, 40), (18, 43), (29, 39)],
        [(18, 60), (28, 64), (39, 61)],
        [(44, 61), (55, 57), (67, 52)],
    ]:
        p.line(points, "#234f49", 0.7)
        p.line([(x, y - 0.6) for x, y in points], "#76a06d", 0.4)
    if variant == 2:
        p.line([(35, 73), (35, 90)], "#d3c9a1", 0.8)
        for y in [75, 81, 88]:
            p.line([(34, y), (38, y + 0.5)], "#4b5748", 0.4)
    return p.image


def rock():
    p = Paint(48, 36)
    p.shadow(24, 31, 19, 3.4)
    rng = Random(28)
    p.poly(
        [(5, 25), (9, 13), (19, 6), (29, 5), (40, 14), (44, 26), (35, 32), (15, 32)],
        "#344d51",
        "#233f42",
        0.6,
    )
    p.gradient([(10, 14), (19, 7), (28, 7), (33, 15), (22, 21), (8, 22)], "#a3b8ac", "#668984")
    p.poly([(23, 22), (34, 17), (40, 24), (33, 29), (23, 30)], "#496568")
    p.line([(17, 8), (26, 6), (31, 11)], "#d4d7bc", 0.5)
    p.line([(11, 22), (19, 18), (24, 19), (29, 15)], "#3a5e5c", 0.4)
    p.line([(20, 9), (18, 13), (21, 15), (20, 18)], "#607c76", 0.3)
    for _ in range(85):
        x = rng.uniform(12, 36)
        y = rng.uniform(12, 28)
        p.ellipse(
            (x, y, x + 0.8, y + 0.4), rng.choice(["#7c9d83", "#9daa82", "#b3bc91", "#52776a"])
        )
    return p.image


def shrub():
    p = Paint(40, 32)
    p.shadow(20, 27, 17, 3)
    rng = Random(98)
    for x, y, rx, ry in [(11, 19, 10, 8), (27, 20, 10, 8), (20, 12, 12, 8)]:
        p.ellipse((x - rx, y - ry, x + rx, y + ry), "#294e49")
        for _ in range(95):
            a = rng.uniform(0, 2 * pi)
            r = rng.random() ** 0.5
            xx = x + cos(a) * rx * r
            yy = y + sin(a) * ry * r
            p.ellipse(
                (xx - 0.8, yy - 0.4, xx + 0.9, yy + 0.6),
                rng.choice(["#527d57", "#749461", "#89a371", "#3d6b50"]),
            )
    for x, y in [(9, 20), (24, 11), (30, 22)]:
        p.ellipse((x - 1, y - 1, x + 1.4, y + 1.2), "#bd7258", "#634c3e", 0.25)
        p.ellipse((x - 0.7, y - 0.7, x + 0.3, y + 0.1), "#f2bd79")
    return p.image


def flowers():
    p = Paint(24, 24)
    for x, y in [(5, 11), (12, 6), (18, 13)]:
        p.line([(x, y + 3), (x, y + 8)], "#3d705c", 0.45)
        p.poly([(x, y + 6), (x - 3, y + 3), (x - 0.5, y + 4)], "#75a378")
        for n in range(6):
            a = n * pi / 3
            cx = x + cos(a) * 1.8
            cy = y + sin(a) * 1.6
            p.ellipse((cx - 1, cy - 0.7, cx + 1, cy + 0.8), "#f0e0b1" if n % 2 else "#dbcca0")
        p.ellipse((x - 0.65, y - 0.6, x + 0.65, y + 0.65), "#e2ad59")
    return p.image


def undergrowth(name):
    p = Paint(32, 40 if name == "reeds" else 32)
    h = p.image.height / 4
    rng = Random(sum(map(ord, name)))
    p.shadow(16, h - 4, 12, 2)
    if name == "mushrooms":
        for x, y, s in [(9, 17, 6), (21, 11, 7), (24, 23, 4)]:
            p.poly(
                [(x - 1, y + 2), (x + 1, y + 2), (x + 1.5, h - 7), (x - 1.3, h - 7)],
                "#c1b48b",
                "#746e50",
                0.3,
            )
            p.ellipse((x - s, y - s * 0.5, x + s, y + 3), "#a78657", "#435645", 0.4)
            p.ellipse((x - s + 0.6, y - s * 0.5 + 0.4, x + s - 0.7, y + 1), "#d5b77f")
            for _ in range(8):
                xx = x + rng.uniform(-s * 0.6, s * 0.6)
                yy = y + rng.uniform(-s * 0.3, 0.4)
                p.ellipse((xx, yy, xx + 0.5, yy + 0.4), "#eed6a0")
        return p.image
    for _ in range(26 if name == "grass-tuft" else 10):
        x = rng.uniform(5, 27)
        top = rng.uniform(4, h - 14)
        p.line(
            [(16 + rng.uniform(-4, 4), h - 5), (x, top + 4), (x + 1, top)],
            rng.choice(["#376e55", "#6e9c69", "#95b17a"]),
            0.4,
        )
        if name == "reeds":
            p.line([(x + 1, top), (x + 0.5, top - 3)], "#bca372", 0.8)
        if name == "fern":
            for y in range(round(top + 4), round(h - 7), 2):
                span = (h - 7 - y) * 0.12
                p.line([(x, y), (x - span - 1, y - 1.7)], "#91b477", 0.6)
                p.line([(x, y + 0.4), (x + span + 1.5, y - 1.2)], "#55885e", 0.5)
    return p.image
