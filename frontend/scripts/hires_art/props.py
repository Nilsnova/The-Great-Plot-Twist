"""New high-density dock furniture and nautical props, retaining all original anchors."""

from common import Paint

SIZES = {
    "jetty": (48, 112),
    "boat": (64, 40),
    "crate": (24, 24),
    "barrel": (24, 32),
    "rope-coil": (32, 20),
    "lantern": (16, 24),
    "bench": (48, 32),
    "buoy": (24, 32),
    "driftwood": (40, 24),
    "gull": (24, 24),
    "sign": (32, 40),
}


def prop(name):
    w, h = SIZES[name]
    p = Paint(w, h)
    ink = "#29494a"
    if name == "jetty":
        p.shadow(24, 108, 21, 3)
        p.rect((7, 5, 12, 109), "#3c5a53")
        p.rect((36, 5, 41, 109), "#3c5a53")
        for y in range(6, 108, 7):
            p.gradient([(4, y), (44, y), (44, y + 6), (4, y + 6)], "#b8a074", "#756b51")
            p.rect((4, y, 44, y + 6), None, ink, 0.45)
            p.grain((5, y + 0.5, 43, y + 5.5), y, "#c9b587", 30)
            for x in [8, 40]:
                p.ellipse((x, y + 2, x + 0.8, y + 2.8), "#425a51")
        for x, y in [(5, 13), (42, 42), (5, 78), (42, 105)]:
            p.rect((x - 2, y - 5, x + 2, y + 3), "#74694e", ink, 0.5)
            p.ellipse((x - 2, y - 6, x + 2, y - 3), "#c7b48d", ink, 0.3)
    elif name == "boat":
        p.shadow(32, 34, 29, 3)
        p.poly([(3, 15), (10, 8), (48, 8), (61, 20), (48, 32), (11, 30)], "#305a61", ink, 0.65)
        p.poly([(7, 15), (13, 11), (47, 11), (55, 20), (46, 27), (14, 26)], "#c3a475", ink, 0.5)
        for y in range(14, 27, 3):
            p.line([(12, y), (48, y)], "#8e7856", 0.4)
        p.poly([(3, 15), (11, 24), (47, 27), (61, 20), (48, 32), (11, 30)], "#a05244", ink, 0.4)
        p.line([(5, 17), (13, 26), (47, 29), (58, 21)], "#edc391", 0.5)
        for x in [20, 35, 46]:
            p.rect((x, 11, x + 3, 27), "#826d4e", ink, 0.4)
            p.line([(x + 0.7, 12), (x + 0.7, 26)], "#d5bb86", 0.4)
        p.line([(24, 20), (43, 3)], "#5a6555", 1)
        p.line([(24, 20), (43, 3)], "#d9c59a", 0.45)
        p.poly([(41, 3), (44, 2), (47, 4), (44, 7)], "#9a7f55", ink, 0.3)
    elif name == "crate":
        p.shadow(12, 21, 10, 2)
        p.gradient([(3, 5), (21, 5), (21, 21), (3, 21)], "#bc9b63", "#7e6b49")
        p.rect((3, 5, 21, 21), None, ink, 0.55)
        for x in [8, 14]:
            p.line([(x, 6), (x, 20)], "#6b6446", 0.4)
        p.line([(4, 6), (20, 20)], "#d4b17c", 1.8)
        p.line([(20, 6), (4, 20)], "#d4b17c", 1.8)
        for x, y in [(4, 6), (20, 6), (4, 20), (20, 20)]:
            p.ellipse((x - 0.4, y - 0.4, x + 0.4, y + 0.4), "#334c44")
    elif name == "barrel":
        p.shadow(12, 28, 10, 2)
        p.gradient(
            [(5, 7), (19, 7), (21, 14), (20, 26), (17, 29), (7, 29), (4, 25), (3, 15)],
            "#ba955c",
            "#756044",
        )
        for x in [6, 10, 14, 18]:
            p.line([(x, 8), (x - 1, 15), (x, 27)], "#5d5e43", 0.4)
        p.ellipse((5, 4, 19, 10), "#c2a572", ink, 0.6)
        p.ellipse((7, 5.2, 17, 8.6), "#8b7855", ink, 0.3)
        for y in [12, 23]:
            p.rect((4, y, 20, y + 2), "#4c6a62", ink, 0.4)
            p.line([(5, y + 0.5), (19, y + 0.5)], "#a3b09a", 0.35)
    elif name == "rope-coil":
        p.shadow(16, 16, 14, 2)
        for n in range(6):
            rx = 13 - n * 1.55
            ry = 6 - n * 0.67
            p.ellipse((16 - rx, 10 - ry, 16 + rx, 10 + ry), None, "#c8b480", 0.8)
            p.ellipse(
                (16 - rx + 0.4, 10 - ry + 0.4, 16 + rx - 0.3, 10 + ry - 0.3), None, "#816f4b", 0.25
            )
        p.line([(17, 10), (25, 13), (29, 10)], "#d8c595", 0.8)
    elif name == "lantern":
        p.shadow(8, 21, 6, 1.3)
        p.ellipse((5, 2, 11, 9), None, ink, 0.8)
        p.poly([(3, 8), (5, 6), (11, 6), (13, 8)], "#547469", ink, 0.4)
        p.gradient([(4, 9), (12, 9), (12, 18), (4, 18)], "#f3d8a1", "#c48a4e")
        p.rect((3, 8, 13, 20), None, ink, 0.6)
        for x in [4, 8, 12]:
            p.line([(x, 9), (x, 18)], "#577669", 0.45)
        p.ellipse((6.4, 12, 9.4, 17), "#fff2bd")
        p.rect((3, 19, 13, 21), "#48695f", ink, 0.4)
    elif name == "bench":
        p.shadow(24, 28, 21, 2.2)
        for x in [9, 38]:
            p.rect((x, 12, x + 2, 29), "#3b5850", ink, 0.5)
        for y in [7, 12, 19, 23]:
            p.rect((3, y, 45, y + 3), "#a58c5c", ink, 0.5)
            p.line([(4, y + 0.6), (44, y + 0.6)], "#d1ba83", 0.35)
            p.grain((5, y + 1, 43, y + 2.4), y, "#796c4b", 25)
    elif name == "buoy":
        p.shadow(12, 27, 10, 2)
        p.poly([(9, 4), (15, 4), (20, 22), (17, 28), (7, 28), (4, 22)], "#e1d1a2", ink, 0.6)
        p.poly([(7, 13), (17, 13), (19, 21), (5, 21)], "#ad6652")
        p.line([(10, 5), (7, 24)], "#f3e0b3", 0.7)
        p.ellipse((9, 2, 15, 7), None, "#57766c", 0.8)
        p.line([(4, 28), (20, 28)], "#7d9e91", 0.7)
    elif name == "driftwood":
        p.shadow(20, 19, 18, 2)
        p.poly([(3, 14), (13, 9), (35, 12), (38, 16), (26, 20), (10, 20)], "#88764f", ink, 0.45)
        for y in [13, 15, 17]:
            p.line([(7, y), (17, y - 1), (31, y + 1)], "#bea77a", 0.35)
        p.poly([(14, 12), (18, 4), (21, 3), (19, 12)], "#a18a5f", ink, 0.4)
    elif name == "gull":
        p.shadow(12, 20, 10, 1.5)
        p.ellipse((7, 9, 18, 18), "#dce3c8", ink, 0.4)
        p.poly([(8, 12), (2, 8), (1, 10), (8, 16)], "#9fb9b3", ink, 0.3)
        p.ellipse((13, 6, 19, 12), "#e8e7c9", ink, 0.4)
        p.poly([(18, 9), (23, 10), (18, 11)], "#d3ab61", ink, 0.25)
        p.ellipse((16, 8, 16.8, 8.8), "#223f43")
        p.line([(10, 17), (9, 20), (12, 20)], "#bc9859", 0.45)
    elif name == "sign":
        p.shadow(16, 36, 9, 1.5)
        p.rect((14, 13, 17, 36), "#8d7852", ink, 0.5)
        p.line([(15, 15), (15, 35)], "#c6ac77", 0.4)
        p.poly([(3, 6), (24, 6), (29, 11), (24, 16), (3, 16)], "#c4ae77", ink, 0.6)
        p.line([(5, 7), (23, 7), (27, 10)], "#e1d1a0", 0.5)
        p.line([(7, 10), (19, 10)], "#807451", 0.6)
        p.line([(7, 12), (16, 12)], "#807451", 0.5)
    return p.image
