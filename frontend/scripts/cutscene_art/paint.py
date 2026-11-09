"""Native-resolution pixel painter for the cutscene art. Authoring only (Pillow + NumPy).

Scenes are painted in floating-point RGB at native pixel size (one pixel = one art pixel), then
ordered-dithered, quantised to a small adaptive palette and enlarged 4x with nearest sampling,
which matches the game's crisp pixel style.
"""

from __future__ import annotations

import math
from random import Random

import numpy as np
from PIL import Image, ImageColor, ImageDraw

SCALE = 4
_BAYER = np.array([
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
], float)
BAYER = (_BAYER + 0.5) / 64 - 0.5


def rgb(color):
    if isinstance(color, str):
        return np.array(ImageColor.getrgb(color)[:3], float)
    return np.array(color, float)


def mix(a, b, t):
    return rgb(a) * (1 - t) + rgb(b) * t


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def ridge(width, seed, base, amp, octaves=4, period=80.0):
    """Smooth 1-D height line (value noise) for hills, cliffs and cloud tops."""
    rng = Random(seed)
    xs = np.arange(width, dtype=float)
    out = np.full(width, float(base))
    a, p = amp, period
    for _ in range(octaves):
        knots = [rng.uniform(-1, 1) for _ in range(int(width / p) + 3)]
        k = xs / p
        i = np.floor(k).astype(int)
        f = k - i
        f = f * f * (3 - 2 * f)
        out += a * (np.array(knots)[i] * (1 - f) + np.array(knots)[i + 1] * f)
        a *= 0.5
        p /= 2.2
    return out


class Canvas:
    def __init__(self, w, h, opaque=True):
        self.w, self.h, self.opaque = w, h, opaque
        self.rgb = np.zeros((h, w, 3))
        self.alpha = np.ones((h, w)) if opaque else np.zeros((h, w))
        self.dither = np.zeros((h, w))
        self.alpha_dither = np.zeros((h, w))
        self.ys, self.xs = np.mgrid[0:h, 0:w].astype(float)

    # -- masks ---------------------------------------------------------------------------------
    def mask(self, fn):
        image = Image.new("L", (self.w, self.h), 0)
        fn(ImageDraw.Draw(image))
        return np.asarray(image, float) / 255

    def poly_mask(self, points):
        return self.mask(lambda d: d.polygon([(round(x), round(y)) for x, y in points], fill=255))

    def rect_mask(self, x0, y0, x1, y1):
        """Half-open pixel rectangle; always at least one pixel wide and tall."""
        ax, ay = math.floor(x0 + 0.5), math.floor(y0 + 0.5)
        bx, by = max(ax + 1, math.floor(x1 + 0.5)), max(ay + 1, math.floor(y1 + 0.5))
        return ((self.xs >= ax) & (self.xs < bx) & (self.ys >= ay) & (self.ys < by)).astype(float)

    def ellipse_mask(self, cx, cy, rx, ry):
        return (((self.xs - cx) / rx) ** 2 + ((self.ys - cy) / ry) ** 2 <= 1).astype(float)

    def below(self, line):
        """Mask of pixels at or below a per-column height line."""
        return (self.ys >= np.asarray(line)[None, :]).astype(float)

    # -- painting ------------------------------------------------------------------------------
    def paint(self, mask, color, alpha=1.0, dither=None, alpha_dither=None):
        a = np.clip(mask * alpha, 0, 1)
        rows, cols = np.flatnonzero(a.any(axis=1)), np.flatnonzero(a.any(axis=0))
        if not rows.size:
            return
        box = (slice(rows[0], rows[-1] + 1), slice(cols[0], cols[-1] + 1))
        a = a[box]
        color = rgb(color) if not isinstance(color, np.ndarray) or color.ndim == 1 else color[box]
        under = self.alpha[box]
        out_a = a + under * (1 - a)
        safe = np.where(out_a > 1e-6, out_a, 1)
        self.rgb[box] = (color * a[..., None] + self.rgb[box] * (under * (1 - a))[..., None]) / safe[..., None]
        self.alpha[box] = out_a
        hit = np.asarray(mask)[box] > 0.5 if np.ndim(mask) else np.ones_like(a, bool)
        if dither is not None:
            self.dither[box] = np.where(hit, dither, self.dither[box])
        if alpha_dither is not None:
            self.alpha_dither[box] = np.where(hit, alpha_dither, self.alpha_dither[box])

    def add(self, amount, color):
        """Additive light (glows, beams). amount is a float map."""
        self.rgb = self.rgb + rgb(color) * np.clip(amount, 0, None)[..., None] * (self.alpha > 0)[..., None]
        self.dither = np.maximum(self.dither, np.clip(amount * 3, 0, 1) * 0.9)

    def fill(self, color):
        self.paint(np.ones((self.h, self.w)), color)

    def vgradient(self, stops, mask=None, dither=1.0):
        """stops: [(y, color), ...] in native pixel rows."""
        ys = np.array([s[0] for s in stops], float)
        cols = np.array([rgb(s[1]) for s in stops])
        rows = np.stack([np.interp(np.arange(self.h), ys, cols[:, c]) for c in range(3)], axis=1)
        image = np.repeat(rows[:, None, :], self.w, axis=1)
        self.paint(np.ones((self.h, self.w)) if mask is None else mask, image, dither=dither)

    def glow(self, cx, cy, radius, color, strength=1.0, squash=1.0):
        d = np.sqrt((self.xs - cx) ** 2 + ((self.ys - cy) / squash) ** 2) / radius
        self.add(strength * np.clip(1 - d, 0, 1) ** 2.2, color)

    def beam(self, ox, oy, angle, length, spread, color, strength=0.5, core=0.35):
        """Additive light cone from (ox, oy); angle in degrees (0 = right, 90 = up)."""
        dx, dy = self.xs - ox, oy - self.ys
        ang = math.radians(angle)
        along = dx * math.cos(ang) + dy * math.sin(ang)
        across = -dx * math.sin(ang) + dy * math.cos(ang)
        width = 1.2 + along * math.tan(math.radians(spread))
        t = np.clip(np.abs(across) / np.maximum(width, 1e-3), 0, 1)
        fall = np.clip(1 - along / length, 0, 1) ** 1.3 * (along > 0)
        shape = (1 - t) ** 1.5 + core * (t < 0.25)
        self.add(strength * fall * shape * (t < 1), color)

    def line(self, points, color, width=1, alpha=1.0):
        pts = [(round(x), round(y)) for x, y in points]
        self.paint(self.mask(lambda d: d.line(pts, fill=255, width=width)), color, alpha)

    def pixel(self, x, y, color, alpha=1.0):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            a = alpha
            self.rgb[y, x] = rgb(color) * a + self.rgb[y, x] * (1 - a)
            self.alpha[y, x] = max(self.alpha[y, x], a)

    def darken(self, mask, amount, toward="#070b1c"):
        """Shade already-painted pixels (night tint, shadows)."""
        a = np.clip(mask * amount, 0, 1)[..., None]
        self.rgb = self.rgb * (1 - a) + rgb(toward) * a

    # -- output --------------------------------------------------------------------------------
    def finish(self, colors=48, scale=SCALE, spread=26.0):
        tile = np.tile(BAYER, (self.h // 8 + 1, self.w // 8 + 1))[: self.h, : self.w]
        image = np.clip(self.rgb + (tile * self.dither * spread)[..., None], 0, 255)
        if not self.opaque:
            solid = (self.alpha + tile * self.alpha_dither) > 0.5
            image[~solid] = 0
        rgb_image = Image.fromarray(image.round().astype(np.uint8), "RGB")
        quant = rgb_image.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        out = quant.convert("RGB")
        if not self.opaque:
            out = out.convert("RGBA")
            out.putalpha(Image.fromarray((solid * 255).astype(np.uint8), "L"))
        return out.resize((self.w * scale, self.h * scale), Image.Resampling.NEAREST)


# ---------------------------------------------------------------------------------------------
# Reusable motifs


def stars(c, seed, count, y_max, colors=("#cfd8ff", "#fff6d8", "#9fb0e8"), mask=None):
    rng = Random(seed)
    for _ in range(count):
        x, y = rng.randrange(c.w), rng.randrange(int(y_max))
        if mask is not None and mask[y, x] < 0.5:
            continue
        col = rng.choice(colors)
        big = rng.random() < 0.08
        c.pixel(x, y, col, 1.0 if big else rng.uniform(0.35, 0.9))
        if big:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c.pixel(x + dx, y + dy, col, 0.45)


def moon(c, cx, cy, r, phase=0.0, light="#f4f0d8", shade="#b9bfd0"):
    c.glow(cx, cy, r * 5, "#6f7fb8", 0.25)
    c.glow(cx, cy, r * 2.2, "#c9d2f0", 0.25)
    c.paint(c.ellipse_mask(cx, cy, r, r), light)
    if phase:
        c.paint(c.ellipse_mask(cx + phase * r, cy - r * 0.15, r, r) * c.ellipse_mask(cx, cy, r, r), shade)
    for ox, oy, rr in ((-0.35, -0.2, 0.22), (0.2, 0.3, 0.16), (-0.05, 0.45, 0.1)):
        c.paint(c.ellipse_mask(cx + ox * r, cy + oy * r, rr * r, rr * r), shade, 0.6)


def cloud_bank(c, seed, y, height, color, rim=None, shadow=None, alpha=1.0, x0=-20, x1=None, puff=14):
    """Pixel cloud bank: a union of puffs that taper toward both ends, a flat base, a lit top rim
    and a shaded underside."""
    x1 = c.w + 20 if x1 is None else x1
    rng = Random(seed)
    base = y + height
    body = np.zeros((c.h, c.w), bool)
    x = x0 + rng.uniform(0, puff * 0.5)
    while x < x1:
        t = (x - x0) / max(1, x1 - x0)
        taper = max(0.25, math.sin(math.pi * min(1, max(0, t))) ** 0.6)
        r = puff * rng.uniform(0.45, 0.85) * taper
        ry = min(height * rng.uniform(0.7, 1.15) * taper, r * 1.1)
        body |= (((c.xs - x) / (r * 1.4)) ** 2 + ((c.ys - (base - ry * 0.55)) / ry) ** 2) <= 1
        x += r * rng.uniform(0.9, 1.5)
    base_line = base + ridge(c.w, seed + 3, 0, max(1.5, height * 0.35), octaves=2, period=puff * 1.5)
    body &= c.ys <= base_line[None, :]
    body = body.astype(float)
    c.paint(body, color, alpha, dither=0.35)
    if rim is not None:
        above = np.vstack([np.zeros((2, c.w)), body[:-2]])
        c.paint(body * (above < 0.5), rim, alpha * 0.9)
    if shadow is not None:
        c.paint(body * (c.ys > base_line[None, :] - max(2, height * 0.3)), shadow, alpha * 0.7, dither=0.8)
    return body


def cliff(c, top, seed, face=("#2a3044", "#20253a", "#171b2c"), rim="#3a4258", grass=None, fade="#0d1020"):
    """Rock face below a height line: faceted columns, strata cracks, lit rim, darker toward the base."""
    rng = Random(seed)
    body = c.below(top)
    tones = np.zeros(c.w, int)
    x = 0
    while x < c.w:
        w = rng.randint(4, 12)
        tones[x:x + w] = rng.choice([0, 1, 1, 2])
        x += w
    palette = np.array([rgb(f) for f in face])
    image = np.repeat(palette[tones][None, :, :], c.h, axis=0)
    c.paint(body, image)
    for _ in range(int(c.w * 0.5)):
        cx, cy = rng.uniform(0, c.w), rng.uniform(0, c.h)
        if body[int(cy), int(min(cx, c.w - 1))] and cy > top[int(min(cx, c.w - 1))] + 3:
            c.line([(cx, cy), (cx + rng.uniform(3, 10), cy + rng.uniform(-1.5, 1.5))], face[2], 1, 0.9)
    edge = np.asarray(top)[None, :]
    c.paint(body * (c.ys < edge + 2), rim)
    if grass:
        c.paint(body * (c.ys < edge + 1.2), grass)
        for _ in range(int(c.w * 0.3)):
            gx = rng.uniform(0, c.w - 1)
            gy = top[int(gx)]
            if gy < c.h - 2:
                c.line([(gx, gy), (gx + rng.uniform(-1, 1), gy - rng.uniform(1, 3))], grass, 1)
    c.darken(body * np.clip((c.ys - edge) / 70, 0, 1), 0.6, toward=fade)
    return body


def sea(c, horizon, stops, seed, wave="#8fc6cc", crest_rate=1.0, rough=0.0):
    water = (c.ys >= horizon).astype(float)
    c.vgradient(stops, mask=water, dither=0.6)
    rng = Random(seed)
    for row in range(int(horizon) + 1, c.h):
        depth = (row - horizon) / max(1, c.h - horizon)
        n = int((2 + 10 * depth) * crest_rate * (1 + rough))
        for _ in range(n):
            x = rng.uniform(-10, c.w)
            length = rng.uniform(2, 4 + 18 * depth) * (1 + rough * 0.5)
            alpha = 0.18 + 0.5 * depth * rng.random()
            c.paint(c.rect_mask(x, row, x + length, row + 1), wave, alpha)
            if rough and rng.random() < rough * 0.25 * depth:
                c.paint(c.rect_mask(x + 1, row - 1, x + length * 0.5, row), "#d9ecea", 0.6)
    return water


def reflection(c, x, horizon, color, width=6, strength=0.8, seed=3, bottom=None):
    rng = Random(seed)
    bottom = c.h if bottom is None else bottom
    for row in range(int(horizon) + 1, int(bottom)):
        if rng.random() < 0.55:
            depth = (row - horizon) / max(1, bottom - horizon)
            half = width * (0.4 + depth * 1.4) * rng.uniform(0.3, 1.0)
            jitter = rng.uniform(-2, 2) * (1 + depth * 3)
            c.paint(c.rect_mask(x + jitter - half, row, x + jitter + half, row + 1), color,
                    strength * (1 - depth * 0.6) * rng.uniform(0.4, 1))


def rain(c, seed, count, color="#9fb3d8", angle=0.35, length=(4, 8), alpha=0.35, y_max=None):
    rng = Random(seed)
    y_max = c.h if y_max is None else y_max
    for _ in range(count):
        x, y, n = rng.uniform(-20, c.w), rng.uniform(-10, y_max), rng.uniform(*length)
        c.line([(x, y), (x - n * angle, y + n)], color, 1, alpha * rng.uniform(0.5, 1))


def rock_cluster(c, seed, x0, x1, base, height, light="#8e96a3", mid="#545b6b", dark="#2b303e", moss=None):
    """Rounded boulders: lit top-left faces, dark right faces, rim highlight."""
    rng = Random(seed)
    x = x0
    while x < x1:
        w = rng.uniform(22, 42)
        h = height * rng.uniform(0.4, 0.8)
        cx = x + w / 2
        pts = []
        for k in range(10):
            a = math.pi + math.pi * k / 9
            rr = rng.uniform(0.85, 1.08)
            pts.append((cx + math.cos(a) * w / 2 * rr, base + math.sin(a) * h * rr))
        body = c.poly_mask(pts)
        c.paint(body, mid)
        c.paint(body * (c.xs > cx + w * 0.12), dark)
        c.paint(body * (c.xs < cx - w * 0.05) * (c.ys < base - h * 0.45), light)
        above = np.vstack([np.zeros((1, c.w)), body[:-1]])
        c.paint(body * (above < 0.5) * (c.xs < cx + w * 0.2), light)
        if moss:
            c.paint(body * (above < 0.5), moss, 0.9)
        x += w * rng.uniform(0.5, 0.8)


def lighthouse(c, cx, base, height, lit=0.0, tone=0.0, flag=True):
    """The game's lighthouse (pale stone, red band, teal lantern room). Returns the lamp centre."""
    night = "#0b1230"
    pale, shade, joint = mix("#e2e5d1", night, tone), mix("#93a8a4", night, tone), mix("#c3c8b3", night, tone)
    red, red_dark = mix("#b0574a", night, tone), mix("#7c3a34", night, tone)
    teal, teal_light = mix("#2c4a4c", night, tone * 0.8), mix("#4a7470", night, tone * 0.8)
    wb, wt = height * 0.30, height * 0.19
    top = base - height * 0.70
    body = c.poly_mask([(cx - wb / 2, base), (cx + wb / 2, base), (cx + wt / 2, top), (cx - wt / 2, top)])
    rel = (c.xs - cx) / np.maximum(1, (wb / 2) + (wt - wb) / 2 * (base - c.ys) / (base - top))
    c.paint(body, pale)
    c.paint(body * (rel > 0.28), shade)
    c.paint(body * (rel < -0.82), mix(pale, "#ffffff", 0.3 * (1 - tone)))
    for row in range(int(top) + 2, int(base), 3):
        c.paint(body * (c.ys == row), joint, 0.7)
        offset = 0 if (row // 3) % 2 else 2
        c.paint(body * ((c.ys > row) & (c.ys < row + 3)) * ((np.round(c.xs) + offset) % 5 == 0), joint, 0.5)
    band_top, band_bottom = base - height * 0.38, base - height * 0.27
    band = body * (c.ys >= band_top) * (c.ys < band_bottom)
    c.paint(band, red)
    c.paint(band * (rel > 0.28), red_dark)
    for wy in (base - height * 0.52, base - height * 0.16):
        win = c.rect_mask(cx - 1.5, wy - 2.5, cx + 1.5, wy + 2.5)
        c.paint(win, teal)
        if lit > 0:
            c.paint(c.rect_mask(cx - 0.5, wy - 1.5, cx + 0.5, wy + 1.5), "#ffd36b", min(1, lit))
    c.paint(c.rect_mask(cx - 2.5, base - height * 0.08, cx + 2.5, base), teal)
    # gallery and railing
    gw = wt * 1.55
    c.paint(c.rect_mask(cx - gw / 2, top - 2, cx + gw / 2, top + 1), teal)
    c.paint(c.rect_mask(cx - gw / 2, top - 2, cx + gw / 2, top - 1), teal_light)
    for x in np.arange(cx - gw / 2, cx + gw / 2 + 0.1, 2):
        c.paint(c.rect_mask(x, top - 5, x + 1, top - 2), teal)
    c.paint(c.rect_mask(cx - gw / 2, top - 6, cx + gw / 2, top - 5), teal_light)
    # lantern room
    lw, lh = wt * 0.95, height * 0.12
    ly0, ly1 = top - 2 - lh, top - 2
    c.paint(c.rect_mask(cx - lw / 2, ly0, cx + lw / 2, ly1), teal)
    glass = c.rect_mask(cx - lw / 2 + 1, ly0 + 1, cx + lw / 2 - 1, ly1 - 1)
    c.paint(glass, mix("#1d2c48", "#0a1028", tone))
    c.paint(glass * (c.xs < cx - lw / 4), "#3a5478", 0.6)
    if lit > 0:
        c.paint(glass, "#ffe9a8", min(1, lit))
        c.paint(c.ellipse_mask(cx, (ly0 + ly1) / 2, lw * 0.22, lh * 0.32), "#fffbe8", min(1, lit))
    for x in (cx - lw / 6, cx + lw / 6):
        c.paint(c.rect_mask(x, ly0, x + 1, ly1), teal)
    # roof
    roof = c.poly_mask([(cx - lw / 2 - 2, ly0 + 1), (cx + lw / 2 + 2, ly0 + 1), (cx, ly0 - lh * 0.75)])
    c.paint(roof, teal)
    c.paint(roof * (c.xs < cx), teal_light)
    c.paint(c.rect_mask(cx - 0.5, ly0 - lh * 0.75 - 4, cx + 0.5, ly0 - lh * 0.75), teal)
    if flag:
        fy = ly0 - lh * 0.75 - 4
        c.paint(c.poly_mask([(cx + 1, fy), (cx + 6, fy + 1.5), (cx + 1, fy + 3)]), mix("#c98b4e", night, tone * 0.7))
    return cx, (ly0 + ly1) / 2


def cottage(c, x, base, w, h, wall="#cbbf9e", roof="#3d4f5e", lit=1.0, tone=0.0, door=True, chimney=True):
    night = "#0b1230"
    wall_c, roof_c = mix(wall, night, tone), mix(roof, night, tone)
    c.paint(c.rect_mask(x, base - h, x + w, base), wall_c)
    c.paint(c.rect_mask(x + w * 0.65, base - h, x + w, base), mix(wall_c, night, 0.35))
    c.paint(c.poly_mask([(x - 2, base - h + 1), (x + w + 2, base - h + 1), (x + w * 0.5, base - h - h * 0.8)]), roof_c)
    c.paint(c.poly_mask([(x - 2, base - h + 1), (x + w * 0.5, base - h - h * 0.8), (x + w * 0.5, base - h + 1)]),
            mix(roof_c, "#ffffff", 0.08))
    if chimney:
        c.paint(c.rect_mask(x + w * 0.7, base - h - h * 0.65, x + w * 0.7 + 3, base - h - h * 0.2), mix("#7a4a3a", night, tone))
    for wx in (x + w * 0.2, x + w * 0.62):
        c.paint(c.rect_mask(wx, base - h * 0.7, wx + 3, base - h * 0.35), "#1b2338")
        if lit:
            c.paint(c.rect_mask(wx, base - h * 0.7, wx + 3, base - h * 0.35), "#ffc85a", lit)
            c.glow(wx + 1.5, base - h * 0.5, 9, "#ff9d3a", 0.18 * lit)
    if door:
        c.paint(c.rect_mask(x + w * 0.42, base - h * 0.55, x + w * 0.42 + 3, base), mix("#4a2e1c", night, tone))


def lamp_post(c, x, base, height, flame=1.0, tone=0.0, glow=True):
    iron = mix("#2a2f3a", "#05070f", tone * 0.5)
    c.paint(c.rect_mask(x - 0.5, base - height, x + 1.5, base), iron)
    c.paint(c.rect_mask(x - 2, base - 1, x + 3, base), iron)
    hy = base - height
    c.paint(c.rect_mask(x - 2, hy - 6, x + 3, hy), iron)
    c.paint(c.poly_mask([(x - 3, hy - 6), (x + 4, hy - 6), (x + 0.5, hy - 9)]), iron)
    if flame > 0:
        c.paint(c.rect_mask(x - 1, hy - 5, x + 2, hy - 1), "#ffd36b", min(1, flame))
        c.paint(c.rect_mask(x, hy - 4, x + 1, hy - 2), "#fffbe8", min(1, flame))
        if glow:
            c.glow(x + 0.5, hy - 3, 22 * flame, "#ff9d3a", 0.42 * flame)
            c.glow(x + 0.5, hy - 3, 7 * flame, "#ffe9a8", 0.5 * flame)
    else:
        c.paint(c.rect_mask(x - 1, hy - 5, x + 2, hy - 1), "#1b2338")
    return x + 0.5, hy - 3


def sparks(c, seed, cx, cy, spread, count, color="#ffd36b", rise=40):
    rng = Random(seed)
    for _ in range(count):
        t = rng.random()
        x = cx + rng.gauss(0, spread) * (0.4 + t)
        y = cy - t * rise + rng.uniform(-2, 2)
        c.pixel(x, y, color, 1 - t * 0.6)
        if rng.random() < 0.3:
            c.pixel(x, y + 1, "#ff9d3a", 0.5 * (1 - t))
