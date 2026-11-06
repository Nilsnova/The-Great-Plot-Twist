"""Fresh four-density coastal buildings with individually drawn masonry, shingles and glass."""

from random import Random

from common import Paint


def window(p, x, y, w=16, h=20):
    p.rect((x - 0.7, y - 0.7, x + w + 0.7, y + h + 0.7), "#263e3d")
    p.gradient([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], "#86b9ba", "#315f6b")
    p.poly([(x + 0.8, y + 0.8), (x + w - 1, y + 0.8), (x + 2, y + h - 2)], "#b7d8cb")
    p.line([(x + w * 0.5, y), (x + w * 0.5, y + h)], "#e7d5a2", 0.8)
    p.line([(x, y + h * 0.49), (x + w, y + h * 0.49)], "#e7d5a2", 0.7)
    p.rect((x - 1.5, y + h, x + w + 1.5, y + h + 1.8), "#806b4c", "#344b42", 0.3)
    p.line([(x + 1, y - 1.4), (x + w - 1, y - 1.4)], "#e3d7ad", 0.55)


def cottage(interior=False, glow=False):
    p = Paint(128, 128)
    rng = Random(330)
    if glow:
        for x in [29, 85]:
            p.rect((x, 80, x + 13, 96), (249, 204, 111, 210))
        return p.image
    p.shadow(64, 115, 53, 7)
    if interior:
        p.rect((17, 32, 112, 114), "#334c48")
        p.gradient([(20, 35), (109, 35), (109, 111), (20, 111)], "#88734f", "#a58a5e")
        for y in range(36, 112, 4):
            p.line([(21, y), (109, y)], "#544e3c", 0.35)
            for x in range(24 + (y % 3) * 8, 109, 18):
                p.line([(x, y), (x, y + 4)], "#645338", 0.3)
        p.grain((22, 39, 107, 109), 34, "#c3a676", 700)
        p.rect((20, 33, 109, 39), "#e8d7a8")
        p.rect((20, 38, 25, 110), "#d6c396")
        p.rect((104, 38, 109, 110), "#b8a87c")
        p.rect((84, 72, 110, 90), "#37423c")
        p.gradient([(84, 71), (110, 71), (110, 85), (84, 85)], "#b48a52", "#7c603e")
        p.grain((85, 72, 109, 84), 40, "#d3b47b", 65)
        p.rect((88, 75, 98, 81), "#f3e5b9", "#b79e70", 0.3)
        for yy in [77, 78, 79]:
            p.line([(90, yy), (96, yy)], "#b5a27c", 0.25)
        p.ellipse((101, 74.8, 105, 79), "#405b55", "#243d3b", 0.3)
        p.ellipse((102, 75.8, 104, 78), "#adcca7")
        window(p, 102, 46, 7, 18)
        p.rect((29, 51, 51, 88), "#4d4638")
        p.rect((31, 50, 49, 68), "#c4c6a0")
        p.gradient([(31, 69), (49, 69), (49, 84), (31, 84)], "#9bb0a0", "#708e80")
        p.line([(32, 70), (48, 71)], "#d9d8b0", 0.6)
        return p.image
    p.gradient([(20, 60), (109, 60), (109, 112), (20, 112)], "#d9d7b9", "#a9b19b")
    p.poly([(20, 60), (109, 60), (109, 112), (20, 112)], None, "#2d4745", 0.8)
    # Individually jointed stone courses with a quiet lit upper face.
    for row, y in enumerate(range(64, 110, 4)):
        p.line([(22, y), (107, y)], "#9eaa96", 0.3)
        for x in range(23 + (row % 2) * 7, 108, 14):
            p.line([(x, y), (x, y + 3.8)], "#8b9d8c", 0.3)
            p.line([(x + 1, y + 0.6), (min(x + 11, 106), y + 0.6)], "#e3dfbd", 0.25)
    p.poly([(102, 62), (109, 60), (109, 112), (102, 108)], "#8c9e90")
    p.poly([(9, 59), (28, 25), (98, 25), (119, 59), (115, 65), (13, 65)], "#2e4141", "#293c3c", 0.8)
    p.gradient([(12, 57), (30, 27), (96, 27), (115, 57)], "#b46f51", "#694f48")
    # Hundreds of actual small slate/terracotta shingles, rather than enlarging old rows.
    for row, y in enumerate(range(29, 58, 3)):
        left = 30 - (y - 27) * 0.61
        right = 96 + (y - 27) * 0.61
        p.line([(left, y), (right, y)], "#3f4540", 0.3)
        for x in range(int(left) + 1 + (row % 2) * 4, int(right) - 2, 7):
            color = rng.choice(["#a86d50", "#ba7d56", "#95634e", "#7b594a"])
            p.poly([(x, y + 0.3), (x + 6, y + 0.3), (x + 5.5, y + 2.6), (x - 0.4, y + 2.6)], color)
            p.line([(x, y + 0.5), (x + 5.5, y + 0.5)], "#d39b70", 0.25)
            p.line([(x + 5.7, y + 0.7), (x + 5.2, y + 2.4)], "#584b43", 0.25)
    p.rect((12, 59, 116, 63), "#2b4341")
    p.line([(15, 59.5), (113, 59.5)], "#ca9e71", 0.7)
    for x in range(17, 114, 9):
        p.rect((x, 61, x + 1, 65), "#c1ab83")
    p.rect((87, 13, 98, 39), "#54665d", "#2a4140", 0.55)
    for y in range(16, 39, 3):
        p.line([(88, y), (97, y)], "#889183", 0.35)
        p.line([(91 + (y % 2) * 3, y), (91 + (y % 2) * 3, y + 3)], "#334c48", 0.3)
    p.rect((85.5, 11.5, 99.5, 16), "#c0b699", "#425650", 0.5)
    p.rect((88, 12.6, 97.4, 14), "#53645a")
    p.rect((53, 78, 75, 114), "#2c4542")
    p.gradient([(56, 80), (72, 80), (72, 111), (56, 111)], "#426e6b", "#2a4d50")
    for x in [58, 62, 66, 70]:
        p.line([(x, 81), (x, 110)], "#244447", 0.3)
        p.line([(x + 0.5, 82), (x + 0.5, 109)], "#638c7d", 0.3)
    p.poly([(56, 81), (72, 109), (72, 111), (56, 83)], "#547c70")
    p.ellipse((67, 94, 69.2, 96.2), "#e2bd68", "#8f753e", 0.3)
    p.rect((51, 112, 77, 116), "#7c8a79", "#344e48", 0.5)
    p.line([(52, 112.5), (76, 112.5)], "#d7cda8", 0.6)
    for x in [28, 84]:
        window(p, x, 78)
        p.rect((x - 2, 98, x + 18, 101), "#6e5f43", "#314b43", 0.3)
        for _ in range(34):
            xx = rng.uniform(x - 1, x + 17)
            yy = rng.uniform(98.8, 104)
            p.line([(xx, yy + 1), (xx - 0.5, yy - 1.5)], "#386f55", 0.35)
            p.ellipse(
                (xx - 0.45, yy - 0.4, xx + 0.55, yy + 0.5),
                rng.choice(["#e1b16f", "#f1d3a0", "#b46a75", "#8e9c69"]),
            )
    # Weathered moss along the roof and stone footing, plus a small lit brass lamp.
    for _ in range(64):
        x = rng.uniform(14, 115)
        y = rng.uniform(57, 60)
        p.ellipse(
            (x, y, x + rng.uniform(0.4, 1.6), y + 0.7),
            rng.choice(["#627d56", "#81935d", "#4d715b"]),
        )
    p.line([(78, 82), (81, 81), (81, 84)], "#294441", 0.7)
    p.rect((79.3, 84, 82.7, 89.7), "#38564d", "#2a4140", 0.35)
    p.gradient([(80, 84.5), (82, 84.5), (82, 88.8), (80, 88.8)], "#f2d393", "#bf8d4f")
    p.line([(79.5, 89), (82.5, 89)], "#d0b675", 0.3)
    return p.image


def boathouse():
    p = Paint(96, 96)
    p.shadow(48, 88, 40, 5)
    p.gradient([(13, 42), (83, 42), (83, 87), (13, 87)], "#6f9b8c", "#365d60")
    p.poly([(13, 42), (83, 42), (83, 87), (13, 87)], None, "#254747", 0.7)
    for x in range(16, 81, 3):
        p.line([(x, 44), (x, 85)], "#284f53", 0.35)
        p.line([(x + 0.6, 45), (x + 0.6, 83)], "#9bb19a", 0.3)
    p.grain((16, 47, 80, 83), 42, "#7ba18c", 260, True)
    p.poly([(8, 43), (25, 18), (70, 18), (88, 43), (84, 47), (12, 47)], "#293f41", "#243d3e", 0.7)
    p.gradient([(11, 42), (26, 20), (69, 20), (84, 42)], "#65847f", "#3c5d61")
    for row, y in enumerate(range(22, 44, 2)):
        left = 26 - (y - 20) * 0.68
        right = 69 + (y - 20) * 0.68
        p.line([(left, y), (right, y)], "#2c4c51", 0.3)
        for x in range(int(left) + (row % 2) * 3, int(right) - 3, 6):
            p.line([(x, y + 0.5), (x + 4, y + 0.5)], "#8fa59a", 0.25)
            p.line([(x + 5, y + 0.2), (x + 4.5, y + 2)], "#29494e", 0.25)
    p.rect((24, 57, 70, 86), "#233e40")
    p.gradient([(26, 59), (68, 59), (68, 84), (26, 84)], "#a18c61", "#6e7152")
    for x in range(28, 69, 4):
        p.line([(x, 59), (x, 84)], "#4d5b48", 0.4)
    p.line([(47, 59), (47, 84)], "#2b4944", 0.8)
    p.line([(28, 61), (45, 81)], "#cfb67f", 1.6)
    p.line([(66, 61), (49, 81)], "#cfb67f", 1.6)
    p.line([(29, 60), (45, 79)], "#5f6b4c", 0.35)
    p.line([(65, 60), (49, 79)], "#5f6b4c", 0.35)
    for x in [44, 50]:
        p.ellipse((x, 72, x + 1.5, 74), "#293e3b", "#c4ad70", 0.3)
    p.rect((38, 31, 54, 37), "#273f40", "#b6b491", 0.4)
    for x in [39, 44, 49]:
        p.line([(x, 33), (x + 3, 33)], "#a7c1b4", 0.35)
    # Mooring rope, hanging net and stones break the formerly plain wall.
    for x in range(16, 23, 2):
        p.line([(x, 57), (x + 6, 74)], "#9da789", 0.3)
    for y in range(60, 76, 3):
        p.line([(15, y), (24, y - 1)], "#adb592", 0.3)
    p.ellipse((74, 73, 82, 82), None, "#d0b680", 1)
    p.ellipse((75.5, 74.5, 80.5, 80.5), None, "#8b8b63", 0.7)
    p.rect((12, 85, 84, 89), "#6b8173", "#294b46", 0.4)
    for x in range(15, 83, 7):
        p.line([(x, 85.5), (x + 4, 85.5)], "#b1b79a", 0.5)
    return p.image


def lighthouse():
    p = Paint(96, 208)
    rng = Random(91)
    p.shadow(48, 192, 36, 7)
    shape = [(25, 190), (31, 65), (64, 65), (72, 190)]
    p.gradient(shape, "#e3e5cf", "#a2b9b0")
    p.poly(shape, None, "#2c4c4d", 0.65)
    p.poly([(52, 68), (64, 65), (72, 190), (58, 188)], "#84a1a0")
    for row, y in enumerate(range(72, 189, 4)):
        left = 31 - (y - 65) * 0.047
        right = 64 + (y - 65) * 0.063
        p.line([(left, y), (right, y)], "#8da6a0", 0.3)
        for x in range(int(left) + (row % 2) * 6, int(right) - 1, 10):
            p.line([(x, y), (x, y + 3.7)], "#9db2a6", 0.25)
            if x < 49:
                p.line([(x + 1, y + 0.6), (min(x + 8, 50), y + 0.6)], "#f0ebd4", 0.25)
    p.poly([(28.6, 124), (67.7, 124), (69, 145), (27.5, 145)], "#a45f4e")
    for y in [125, 129, 133, 137, 141, 144]:
        p.line([(29, y), (67, y)], "#bb7b61" if y % 2 else "#8a5b52", 0.3)
    p.line([(31, 124.6), (65.4, 124.6)], "#e0ac82", 0.5)
    p.rect((39.8, 165.5, 56.5, 192), "#2b4849")
    p.gradient([(43, 168), (53.5, 168), (53.5, 190), (43, 190)], "#597c73", "#344f51")
    for x in [45, 48, 51]:
        p.line([(x, 169), (x, 189)], "#2e4e4e", 0.3)
    p.line([(43.4, 169), (53, 187)], "#829585", 0.6)
    p.ellipse((51.2, 180, 52.8, 181.8), "#d6bc75")
    for x, y, w, h in [(43, 95, 8, 13), (42, 150, 9, 12)]:
        window(p, x, y, w, h)
    p.rect((26, 42, 69, 68), "#314e50", "#254246", 0.7)
    p.gradient([(30, 45), (65, 45), (65, 64), (30, 64)], "#dfcc93", "#6d9793")
    for x in [31, 43, 55]:
        p.rect((x, 46, x + 7, 61), "#97b8ae")
        p.poly([(x + 0.3, 46), (x + 6.3, 46), (x + 0.4, 58)], "#d5dfbd")
        p.line([(x, 46), (x, 63)], "#335657", 0.5)
    p.rect((45, 48, 51, 61), "#e6b667")
    p.ellipse((46.3, 51, 49.5, 56), "#fff1b2")
    p.rect((24, 64, 71, 70), "#3e5a58", "#253f43", 0.6)
    for x in range(25, 72, 4):
        p.line([(x, 62), (x, 70)], "#a6b8a5", 0.4)
    p.line([(23, 61), (72, 61)], "#d2d4b1", 0.7)
    p.poly([(23, 42), (46, 25), (50, 25), (72, 42)], "#28484b", "#203b40", 0.6)
    p.gradient([(27, 40), (47, 28), (67, 40)], "#77988d", "#3a6365")
    for x in range(31, 67, 5):
        p.line([(48, 28), (x, 40)], "#a6b4a0", 0.3)
    p.line([(48, 24), (48, 10)], "#2d4a4c", 0.7)
    p.poly([(49, 10), (63, 14), (49, 18)], "#cc945b", "#526b5d", 0.35)
    p.rect((21, 191, 75, 195), "#718e83", "#34544e", 0.5)
    p.line([(23, 191.5), (73, 191.5)], "#d8dbc1", 0.8)
    for _ in range(70):
        y = rng.uniform(145, 189)
        x = rng.uniform(28, 39)
        p.line([(x, y), (x + rng.uniform(0.3, 1), y - 0.7)], "#6f8a75", 0.3)
    return p.image
