"""The five G29 cutscene compositions, painted at native pixel size (320 x 180, title layers 352 x 180)."""

from __future__ import annotations

from random import Random

import numpy as np

from paint import (Canvas, cliff, cloud_bank, cottage, lamp_post, lighthouse, mix, moon, rain, reflection, ridge,
                   rock_cluster, sea, sparks, stars)

W, H = 320, 180
TITLE_W = 352  # wider than the view so the layers can drift for parallax


def lore_intro():
    """(a) The dark lighthouse at night over a stormy sea, a faint beam still reaching out."""
    c = Canvas(W, H)
    horizon = 112
    c.vgradient([(0, "#05070f"), (40, "#0b1026"), (90, "#18214a"), (horizon, "#26325e")])
    stars(c, 11, 40, 40)
    moon(c, 262, 26, 8, phase=0.55)
    c.glow(70, 58, 60, "#8a7fd0", 0.22)  # far lightning inside the clouds
    cloud_bank(c, 3, 2, 30, "#141a36", rim="#2c3866", shadow="#0a0d20", puff=40)
    cloud_bank(c, 5, 40, 24, "#1b2346", rim="#3a4a80", shadow="#10142c", alpha=0.95, puff=34)
    cloud_bank(c, 8, 84, 14, "#24305a", rim="#3c4c84", alpha=0.85, puff=22)
    sea(c, horizon, [(horizon, "#14223e"), (140, "#0c182c"), (H, "#060c18")], 21, wave="#3d5f86", rough=1.2)
    # headland and cliff
    xs = np.arange(W, dtype=float)
    cliff_top = ridge(W, 31, 114, 4, octaves=3, period=24) + np.clip(232 - xs, 0, None) * 0.02
    slope = np.clip((xs - 160) / 44, 0, 1) ** 0.7
    cliff_top = np.where(xs < 160, H + 5, H - (H - cliff_top) * slope + ridge(W, 32, 0, 3, octaves=2, period=8) * (1 - slope))
    cliff_mask = cliff(c, cliff_top, 4, face=("#262c40", "#1c2132", "#131726"), rim="#3a4560", grass="#22382e")
    lx, ly = lighthouse(c, 240, 113, 90, lit=0.18, tone=0.55)
    c.glow(lx, ly, 14, "#ffb35a", 0.22)
    c.beam(lx - 2, ly, 172, 250, 4.5, "#ffd9a0", strength=0.16, core=0.2)
    c.beam(lx + 2, ly, 8, 90, 4.5, "#ffd9a0", strength=0.07, core=0.1)
    # surf breaking against the cliff foot
    rng = Random(9)
    for _ in range(90):
        x = rng.uniform(150, 215)
        y = 128 + (x - 150) * 0.25 + rng.uniform(-6, 30)
        if not cliff_mask[int(min(y, H - 1)), int(min(x, W - 1))]:
            c.paint(c.rect_mask(x, y, x + rng.uniform(2, 7), y + 1), "#c8dde8", rng.uniform(0.3, 0.8))
    rock_cluster(c, 2, -6, 120, H + 2, 26, light="#3a4258", mid="#232838", dark="#121522")
    rain(c, 17, 360, "#8ea4d0", angle=0.45, alpha=0.3)
    c.darken(np.clip((np.abs(c.xs - W / 2) / (W / 2)) ** 3, 0, 1), 0.35)
    return c


def arrival():
    """(b) Saltreach Harbor at dusk: lanterns lit, boats moored, the dark lighthouse far out."""
    c = Canvas(W, H)
    horizon = 104
    c.vgradient([(0, "#171b44"), (34, "#3a2c62"), (66, "#7d3f6e"), (88, "#d4766a"), (horizon, "#f6be78")])
    stars(c, 5, 18, 30)
    c.glow(96, horizon + 6, 90, "#ff9a5a", 0.35, squash=0.6)
    cloud_bank(c, 12, 20, 11, "#5a3a6e", rim="#e0906e", shadow="#3e2c5e", alpha=0.9, puff=18, x0=160, x1=W + 10)
    cloud_bank(c, 14, 44, 10, "#86486e", rim="#ffbe86", shadow="#6a3a66", alpha=0.85, puff=16, x0=-10, x1=150)
    cloud_bank(c, 15, 70, 7, "#b25a6e", rim="#ffd49a", alpha=0.75, puff=12, x0=196, x1=290)
    hills = ridge(W, 41, 98, 5, octaves=3, period=60)
    hills = np.where(np.arange(W) > 200, hills - 6, hills)
    c.paint(c.below(hills) * (c.ys < horizon + 1), "#4e3a68")
    c.paint(c.below(hills + 3) * (c.ys < horizon + 1), "#3f3160")
    lighthouse(c, 288, 99, 22, lit=0.0, tone=0.62, flag=False)
    sea(c, horizon, [(horizon, "#e09a7a"), (118, "#8a5a7a"), (140, "#3e3a68"), (H, "#1a2148")], 33,
        wave="#ffc48a", crest_rate=0.8)
    reflection(c, 96, horizon, "#ffd49a", width=7, strength=0.8, seed=7, bottom=150)
    # harbour bank with houses (left) and its stone wall
    bank = c.rect_mask(0, 118, 168, 128)
    c.paint(bank, "#3a3446")
    for x in range(0, 168, 6):
        c.paint(c.rect_mask(x, 121 + (x // 6 % 2) * 3, x + 1, 124 + (x // 6 % 2) * 3), "#2a2536")
    c.paint(c.rect_mask(0, 117, 168, 119), "#6a5a6a")
    houses = [(4, 30, 22, "#cbbf9e", "#3d4f5e"), (38, 26, 26, "#9fb4b0", "#6e3a34"),
              (70, 34, 20, "#c98b6e", "#2f4a3c"), (110, 28, 24, "#d6c9a8", "#4a3a5e"),
              (142, 22, 18, "#b6a0b8", "#3d4f5e")]
    for x, w, h, wall, roof in houses:
        cottage(c, x, 118, w, h, wall=wall, roof=roof, lit=1.0, tone=0.42)
    # a string of small lights strung along the house fronts
    rng = Random(19)
    for x0, x1 in ((6, 66), (66, 140), (140, 166)):
        for k in range(0, 31):
            t = k / 30
            x = x0 + (x1 - x0) * t
            y = 100 + 6 * 4 * t * (1 - t)
            c.pixel(x, y, "#3a2a2a", 0.8)
            if k % 3 == 1:
                col = rng.choice(["#ffd36b", "#ff9d5a", "#fff0b0", "#ffb0a0"])
                c.pixel(x, y + 1, col)
                c.glow(x, y + 1, 4, "#ffb35a", 0.25)
    # pier to the right
    c.paint(c.rect_mask(168, 121, W, 125), "#6e4728")
    c.paint(c.rect_mask(168, 121, W, 122), "#b88a54")
    for x in range(172, W, 14):
        c.paint(c.rect_mask(x, 125, x + 2, 134), "#3a2416")
    lamp_post(c, 300, 121, 14, tone=0.3)
    # moored boats and their reflections
    for bx, by, mast in ((200, 140, 26), (252, 146, 20)):
        hull = c.poly_mask([(bx - 14, by - 4), (bx + 14, by - 4), (bx + 10, by), (bx - 10, by)])
        c.paint(hull, "#7a3a34")
        c.paint(c.rect_mask(bx - 14, by - 5, bx + 14, by - 4), "#f0d0a0")
        c.paint(c.rect_mask(bx - 0.5, by - 4 - mast, bx + 0.5, by - 4), "#3a2a2a")
        c.paint(c.poly_mask([(bx + 1, by - 6 - mast * 0.9), (bx + 1, by - 7), (bx + mast * 0.45, by - 7)]), "#e8d8c0", 0.9)
        for k in range(1, 9, 2):
            c.paint(c.rect_mask(bx - 10 + k, by + k, bx + 10 - k, by + k + 1), "#5a2a34", 0.5)
    # foreground quay with lanterns
    quay_top, quay_face = 150, 166
    c.paint(c.rect_mask(0, quay_top, W, quay_face), "#4a4252")
    for row in range(quay_top, quay_face, 4):
        c.paint(c.rect_mask(0, row, W, row + 1), "#3a3344")
        for x in range((row // 4 % 2) * 7, W, 14):
            c.paint(c.rect_mask(x, row, x + 1, row + 4), "#3a3344")
    c.paint(c.rect_mask(0, quay_top, W, quay_top + 1), "#8a7a82")
    c.paint(c.rect_mask(0, quay_face, W, H), "#231e2e")
    for x in range(10, W, 12):
        c.paint(c.rect_mask(x, quay_face + 1, x + 1, H), "#181422")
    for x in (24, 92, 160, 228, 296):
        lx, ly = lamp_post(c, x, quay_top + 2, 20, tone=0.2)
        c.glow(lx, quay_top + 2, 26, "#ff9d3a", 0.18, squash=0.25)
    c.darken(np.clip((c.ys - 160) / 20, 0, 1), 0.3)
    return c


def keepers_lock():
    """(c) The Keeper's Lock turns and the door opens; warm light spills over the stones."""
    c = Canvas(W, H)
    c.fill("#17141f")
    rng = Random(6)
    for row in range(0, 142, 9):
        offset = rng.randrange(0, 18)
        for x in range(-offset, W, 18):
            tone = rng.uniform(0, 1)
            c.paint(c.rect_mask(x + 1, row + 1, x + 17, row + 8), mix("#2a2534", "#3a3444", tone))
            c.paint(c.rect_mask(x + 1, row + 1, x + 17, row + 2), "#4a4254", 0.6)
    floor_y = 142
    c.vgradient([(floor_y, "#2b2533"), (H, "#3a3240")], mask=c.rect_mask(0, floor_y, W, H), dither=0.5)
    for k, row in enumerate((146, 152, 160, 170)):
        c.paint(c.rect_mask(0, row, W, row + 1), "#1a1622")
        for i in range(-12, 13):
            x_top = 160 + i * (14 + k * 6)
            c.paint(c.rect_mask(x_top, row, x_top + 1, row + 6 + k * 3), "#1a1622", 0.8)
    cx, top, bottom, half = 160, 18, floor_y, 44
    spring = top + half
    arch = c.rect_mask(cx - half, spring, cx + half, bottom) + c.ellipse_mask(cx, spring, half, half) * (c.ys < spring)
    arch = np.clip(arch, 0, 1)
    frame = np.clip(c.rect_mask(cx - half - 7, spring, cx + half + 7, bottom) +
                    c.ellipse_mask(cx, spring, half + 7, half + 7) * (c.ys < spring), 0, 1)
    c.paint(frame, "#4e4858")
    for a in np.linspace(np.pi, 2 * np.pi, 12):
        x, y = cx + np.cos(a) * (half + 3.5), spring + np.sin(a) * (half + 3.5)
        c.paint(c.ellipse_mask(x, y, 1.2, 1.2), "#2a2534")
    c.paint(frame * (c.xs < cx - half) + frame * (c.ys < spring) * (c.xs < cx), "#5e5868", 0.5)
    # light beyond the doorway
    c.paint(arch, "#ffd36b")
    c.glow(cx + 18, 90, 70, "#fffbe8", 0.9)
    for gx, gy, r in ((150, 46, 14), (178, 38, 9), (196, 58, 11)):
        gear = c.ellipse_mask(gx, gy, r, r) * arch
        c.paint(gear, "#e09a3a", 0.85)
        for k in range(10):
            a = k * np.pi / 5
            c.paint(c.ellipse_mask(gx + np.cos(a) * r, gy + np.sin(a) * r, 2.2, 2.2) * arch, "#e09a3a", 0.85)
        c.paint(c.ellipse_mask(gx, gy, r * 0.35, r * 0.35) * arch, "#ffd36b")
    # left leaf, still closed, with the brass lock
    leaf = arch * (c.xs < cx)
    c.paint(leaf, "#5a3820")
    for x in range(cx - half, cx, 8):
        c.paint(leaf * (c.xs >= x) * (c.xs < x + 1), "#3a2414")
        c.paint(leaf * (c.xs >= x + 1) * (c.xs < x + 3), "#6e4728", 0.8)
    for y in (58, 118):
        c.paint(leaf * (c.ys >= y) * (c.ys < y + 4), "#2a2a33")
        for x in range(cx - half + 3, cx, 7):
            c.paint(c.ellipse_mask(x, y + 2, 0.8, 0.8), "#6a6a78")
    c.paint(leaf * (c.xs >= cx - 2), "#ffbe5a", 0.85)  # light catching the leaf's edge
    lock_x, lock_y, r = 128, 92, 17
    for k in range(16):
        a = k * np.pi / 8
        c.paint(c.ellipse_mask(lock_x + np.cos(a) * (r + 1), lock_y + np.sin(a) * (r + 1), 2.4, 2.4), "#8a6420")
    c.paint(c.ellipse_mask(lock_x, lock_y, r, r), "#c09632")
    c.paint(c.ellipse_mask(lock_x - 3, lock_y - 3, r - 4, r - 4) * c.ellipse_mask(lock_x, lock_y, r, r), "#e8c860", 0.7)
    c.paint(c.ellipse_mask(lock_x, lock_y, r - 6, r - 6), "#8a6420")
    c.paint(c.ellipse_mask(lock_x, lock_y, r - 7, r - 7), "#c09632")
    # four sky symbols around the dial: sun, cloud, rain, fog
    sx, sy = lock_x, lock_y - 11.5
    c.paint(c.ellipse_mask(sx, sy, 2.2, 2.2), "#fff0b0")
    for dx, dy in ((0, -3.5), (0, 3.5), (-3.5, 0), (3.5, 0)):
        c.pixel(sx + dx, sy + dy, "#fff0b0")
    kx, ky = lock_x + 11.5, lock_y
    c.paint(c.ellipse_mask(kx - 1.2, ky, 2, 1.6) + c.ellipse_mask(kx + 1.2, ky - 0.6, 2.2, 2), "#f4f0e0")
    rx, ry = lock_x, lock_y + 11.5
    c.paint(c.ellipse_mask(rx, ry - 1.5, 2.8, 1.4), "#9fc6e8")
    for dx in (-2, 0, 2):
        c.pixel(rx + dx, ry + 1, "#9fc6e8")
        c.pixel(rx + dx - 0.5, ry + 2.5, "#9fc6e8")
    fx, fy = lock_x - 11.5, lock_y
    for dy, w in ((-2, 3), (0, 4), (2, 3)):
        c.paint(c.rect_mask(fx - w, fy + dy, fx + w, fy + dy + 1), "#d8dce4")
    c.paint(c.ellipse_mask(lock_x, lock_y - 1.5, 2, 2), "#1a1006")
    c.paint(c.poly_mask([(lock_x - 1.5, lock_y - 1), (lock_x + 1.5, lock_y - 1), (lock_x + 2, lock_y + 4), (lock_x - 2, lock_y + 4)]), "#1a1006")
    c.glow(lock_x, lock_y, 30, "#ffbe5a", 0.25)
    # right leaf swung open toward the viewer
    hinge = cx + half
    leaf2 = c.poly_mask([(hinge, spring - 26), (hinge + 30, spring - 34), (hinge + 30, bottom + 10), (hinge, bottom)])
    c.paint(leaf2, "#3e2716")
    for k in range(1, 4):
        x = hinge + k * 7.5
        c.paint(leaf2 * (c.xs >= x) * (c.xs < x + 1), "#2a180c")
    c.paint(leaf2 * (c.xs < hinge + 2), "#7a5230")
    # light spilling across the floor and into the room
    for angle, strength in ((-75, 0.3), (-58, 0.26), (-42, 0.2), (-100, 0.24), (-118, 0.18), (-20, 0.12), (200, 0.1)):
        c.beam(cx + 20, 96, angle, 140, 7, "#ffcf7a", strength=strength, core=0.15)
    c.glow(cx + 14, floor_y + 8, 90, "#ffb24a", 0.5, squash=0.22)
    c.glow(cx + 14, floor_y + 4, 40, "#fff0b0", 0.4, squash=0.25)
    sparks(c, 3, cx + 16, 120, 34, 90, color="#fff0c8", rise=100)
    c.darken(np.clip(((c.xs - cx) / (W * 0.62)) ** 2 + ((c.ys - 92) / (H * 0.95)) ** 2, 0, 1), 0.75)
    return c


def lamps_relight():
    """(d) Three lamps ignite on the quay and the lighthouse beam sweeps the sea again."""
    c = Canvas(W, H)
    horizon = 112
    c.vgradient([(0, "#060a1e"), (60, "#101a42"), (100, "#1f2e64"), (horizon, "#2e3f7a")])
    stars(c, 2, 120, 100)
    cloud_bank(c, 22, 8, 12, "#1a2350", rim="#5a6aa8", shadow="#10183a", alpha=0.85, puff=20, x0=-10, x1=120)
    cloud_bank(c, 23, 26, 10, "#1d2756", rim="#6a7ab8", shadow="#10183a", alpha=0.8, puff=18, x0=236, x1=W + 10)
    hills = ridge(W, 9, 106, 4, octaves=3, period=50)
    c.paint(c.below(hills) * (c.ys <= horizon), "#1a2248")
    sea(c, horizon, [(horizon, "#22346a"), (150, "#0f1c40"), (H, "#081028")], 5, wave="#5a7ab0", crest_rate=0.9)
    xs = np.arange(W, dtype=float)
    mound = 118 - np.clip(1 - ((xs - 198) / 54) ** 2, 0, None) * 16 + ridge(W, 13, 0, 1.5, octaves=2, period=12)
    mound = np.where(np.abs(xs - 198) < 54, mound, H + 5)
    isl = cliff(c, mound, 13, face=("#262c42", "#1e2234", "#161a2a"), rim="#4a5470", grass="#2a4436") * (c.ys < 118)
    c.paint(c.rect_mask(0, 118, W, H) * c.below(mound), "#0f1c40")
    rng = Random(21)
    for _ in range(40):
        x = rng.uniform(140, 256)
        c.paint(c.rect_mask(x, 117 + rng.uniform(0, 3), x + rng.uniform(2, 6), 118 + rng.uniform(0, 3)), "#b8cce8", 0.35)
    lx, ly = lighthouse(c, 198, 104, 82, lit=1.0, tone=0.3)
    for angle, strength in ((150, 0.06), (160, 0.1), (171, 0.48)):
        c.beam(lx - 2, ly, angle, 320, 6.5, "#fff2c8", strength=strength, core=0.3)
    c.beam(lx + 2, ly, 12, 150, 6.5, "#fff2c8", strength=0.16, core=0.15)
    c.glow(lx, ly, 46, "#ffd36b", 0.55)
    c.glow(lx, ly, 12, "#fffbe8", 0.9)
    reflection(c, lx, horizon, "#ffe0a0", width=4, strength=0.9, seed=4, bottom=150)
    # stone terrace in the foreground
    top = 154
    c.paint(c.rect_mask(0, top, W, H), "#2e2a3a")
    for row in range(top, H, 5):
        c.paint(c.rect_mask(0, row, W, row + 1), "#221e2c")
        for x in range((row // 5 % 2) * 8, W, 16):
            c.paint(c.rect_mask(x, row, x + 1, row + 5), "#221e2c")
    c.paint(c.rect_mask(0, top, W, top + 1), "#6a6278")
    lamps = []
    for i, x in enumerate((70, 160, 250)):
        lamps.append(lamp_post(c, x, top + 4, 30, tone=0.1))
        c.glow(x, top + 4, 40, "#ff9d3a", 0.22, squash=0.22)
        sparks(c, 40 + i, x, top - 30, 4, 26, rise=34)
    # threads of light from each lamp to the lantern
    rng = Random(8)
    for sx, sy in lamps:
        for k in range(46):
            t = k / 46
            mx, my = (sx + lx) / 2, min(sy, ly) - 26
            x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * mx + t * t * lx
            y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * my + t * t * ly
            if rng.random() < 0.7:
                c.pixel(x + rng.uniform(-0.6, 0.6), y, "#ffe9a8", 0.35 + 0.5 * (1 - t))
    c.darken(np.clip((np.abs(c.xs - W / 2) / (W / 2)) ** 3, 0, 1), 0.3)
    return c


# ---------------------------------------------------------------------------------------------
# Title backdrop: five separate planes for parallax.

TITLE_HORIZON = 118
TITLE_LAMP = {}


def title_sky():
    c = Canvas(TITLE_W, H)
    c.vgradient([(0, "#070b22"), (50, "#121c48"), (92, "#26346c"), (110, "#4a4a86"), (TITLE_HORIZON + 4, "#8a6a9a"),
                 (H, "#8a6a9a")])
    stars(c, 77, 150, 96)
    moon(c, 92, 34, 9, phase=0.0)
    cloud_bank(c, 61, 48, 11, "#24305e", rim="#7a88c0", shadow="#1a2450", alpha=0.85, puff=18, x0=150, x1=290)
    cloud_bank(c, 63, 76, 9, "#3a3e74", rim="#a090c0", shadow="#2e3266", alpha=0.8, puff=15, x0=-10, x1=130)
    cloud_bank(c, 65, 12, 9, "#1a2350", rim="#5a6aa8", alpha=0.7, puff=15, x0=220, x1=TITLE_W + 10)
    return c


def title_far_cliffs():
    c = Canvas(TITLE_W, H, opaque=False)
    far = ridge(TITLE_W, 70, 108, 6, octaves=3, period=70)
    gap = np.clip(1 - np.abs(np.arange(TITLE_W) - 165) / 50, 0, 1)
    far = far + gap * 14
    c.paint(c.below(far) * (c.ys < TITLE_HORIZON + 2), "#3a3c72")
    near = ridge(TITLE_W, 71, 112, 5, octaves=3, period=40)
    near = np.where(np.arange(TITLE_W) < 110, near, TITLE_HORIZON + 2)
    c.paint(c.below(near) * (c.ys < TITLE_HORIZON + 2), "#2a2c5e")
    mist = np.clip(1 - np.abs(c.ys - (TITLE_HORIZON - 1)) / 5, 0, 1) * (c.ys < TITLE_HORIZON + 2) * c.below(far - 6)
    c.paint(mist, "#7a74a8", 0.45, alpha_dither=0.9)
    return c


def title_sea():
    c = Canvas(TITLE_W, H, opaque=False)
    sea(c, TITLE_HORIZON, [(TITLE_HORIZON, "#5a5a92"), (132, "#2e3c74"), (155, "#1a2858"), (H, "#0e1840")], 88,
        wave="#8aa0d0", crest_rate=0.9)
    reflection(c, 92, TITLE_HORIZON, "#dfe4f4", width=4, strength=0.55, seed=12, bottom=160)
    return c


def title_lighthouse():
    c = Canvas(TITLE_W, H, opaque=False)
    xs = np.arange(TITLE_W)
    top = ridge(TITLE_W, 90, 112, 3, octaves=3, period=30)
    top = np.where(xs < 236, H + 5, top)
    slope = np.clip((xs - 230) / 26, 0, 1)
    top = np.where(slope < 1, H - (H - top) * slope, top)
    cliff(c, top, 5, face=("#283048", "#1e2438", "#161a2a"), rim="#3e5a4a", grass="#4a6a50")
    cottage(c, 306, 114, 24, 16, wall="#b8b09a", roof="#2e3e4c", lit=1.0, tone=0.45)
    lx, ly = lighthouse(c, 284, 114, 96, lit=1.0, tone=0.38)
    TITLE_LAMP.update({"x": lx, "y": ly})
    c.glow(lx, ly, 10, "#ffe9a8", 0.6)
    return c


def title_foreground():
    c = Canvas(TITLE_W, H, opaque=False)
    rock_cluster(c, 101, -8, 96, H + 2, 30, light="#2e3448", mid="#1a1e2c", dark="#0c0e18", moss="#1e3428")
    rock_cluster(c, 103, 286, TITLE_W + 10, H + 2, 22, light="#2e3448", mid="#1a1e2c", dark="#0c0e18")
    rng = Random(7)
    for _ in range(40):
        x = rng.choice([rng.uniform(0, 90), rng.uniform(290, TITLE_W)])
        base = H - rng.uniform(0, 8)
        for k in range(3):
            h = rng.uniform(5, 12)
            c.line([(x + k, base), (x + k + rng.uniform(-2, 2), base - h)], "#14261c", 1)
    return c


SCENES = {
    "lore-intro": lore_intro,
    "arrival": arrival,
    "keepers-lock": keepers_lock,
    "lamps-relight": lamps_relight,
}
TITLE_LAYERS = [
    ("sky", title_sky, 0.0),
    ("far-cliffs", title_far_cliffs, 0.12),
    ("sea", title_sea, 0.3),
    ("lighthouse", title_lighthouse, 0.5),
    ("foreground", title_foreground, 1.0),
]
