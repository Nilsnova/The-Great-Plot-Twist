"""Original pirate-wave sprites: ships with three bob frames, shots, splashes, the wreck, the island
defenses, the flag trophy and the glowing build-spot marker. Drawn pixel by pixel on the 16 px grid
with the coastal palette; gold only for lights and the build marker. No downloaded artwork."""
from PIL import Image
from common import canvas, poly, shadow

INK = '#263a32'
HULL, HULL_LIT, HULL_DARK, TRIM = '#5a4331', '#7a5b3e', '#3f3026', '#b99d60'
SAIL, SAIL_LIT, SAIL_SHADE, PATCH = '#8f8a74', '#aba48a', '#6f6c5b', '#5c5a4b'  # salt-stained, patched
BLACK_SAIL = ('#3c423e', '#535b55', '#2c322f', '#6a3a30')  # the flagship's dark canvas
FLAG, FLAG_RED, BONE = '#1d2320', '#b0402f', '#e0d5b0'
IRON, IRON_LIT = '#353b37', '#6f7a72'
STONE, STONE_LIT, STONE_DARK = '#8e927d', '#b3b59c', '#646a5d'
WOOD, WOOD_LIT, WOOD_DARK = '#7a5d43', '#a48460', '#58432f'
FOAM, FOAM_DIM = '#e3efe6', '#a7cdc3'
GOLD, GOLD_LIT, GLOW = '#e9b94f', '#fff0a4', '#f0ca70'


def clip_below(image, waterline):
    """Everything under the waterline is sea: the world's water shows through."""
    pixels = image.load()
    for y in range(waterline, image.height):
        for x in range(image.width):
            pixels[x, y] = (0, 0, 0, 0)


def foam(d, x0, x1, y, frame):
    """A broken foam line where the hull meets the water, shifting with each frame."""
    for x in range(x0, x1):
        k = (x + frame * 3) % 7
        if k in (0, 1, 2, 4):
            d.point((x, y), fill=FOAM if k != 4 else FOAM_DIM)
    for x in range(x0 + 2 + frame, x1 - 2, 9):
        d.line((x, y + 1, x + 2, y + 1), fill=FOAM_DIM)


def pirate_flag(d, x, y, frame, w=10, h=7):
    """Black flag with a red slash and a bone-white star, flying right; the fly edge ripples."""
    ripple = [0, 1, -1][frame % 3]
    poly(d, [(x, y), (x + w, y + ripple), (x + w, y + h + ripple), (x, y + h)], FLAG, INK)
    d.line((x + 2, y + h - 1, x + w - 2, y + 1 + ripple), fill=FLAG_RED, width=2)
    cx, cy = x + w // 2, y + h // 2 + (ripple > 0)
    d.point((cx, cy), fill=BONE)
    d.point((cx - 1, cy), fill=BONE); d.point((cx + 1, cy), fill=BONE)
    d.point((cx, cy - 1), fill=BONE); d.point((cx, cy + 1), fill=BONE)


def gunports(d, x0, x1, y, step=7):
    for x in range(x0, x1, step):
        d.rectangle((x, y, x + 3, y + 2), fill=INK)
        d.line((x, y - 1, x + 3, y - 1), fill=FLAG_RED)


def square_sail(d, cx, top, w, h, patch=False, colors=(SAIL, SAIL_LIT, SAIL_SHADE, PATCH)):
    """A square sail on its yard, bellied forward; the lit half faces the light."""
    sail, lit, shade, mend = colors
    left, right = cx - w // 2, cx + w // 2
    d.line((left - 2, top, right + 2, top), fill=WOOD_DARK, width=2)
    poly(d, [(left, top + 1), (right, top + 1), (right + 2, top + h), (left - 2, top + h)], sail, INK)
    d.rectangle((left + 1, top + 2, cx - 1, top + h - 2), fill=lit)
    d.line((left + 1, top + h - 2, right - 1, top + h - 2), fill=shade)
    if patch:
        d.rectangle((cx + 2, top + 3, cx + 5, top + 6), fill=mend)
        d.point((cx + 1, top + 4), fill=INK)


def sloop(frame):
    im, d = canvas(64, 64)
    dy, water = [0, 1, 2][frame], 54
    hull = [(4, 39 + dy), (13, 38 + dy), (16, 43 + dy), (57, 41 + dy), (54, 49 + dy), (49, 56 + dy), (12, 56 + dy), (6, 47 + dy)]
    poly(d, hull, HULL, INK)
    d.line((15, 44 + dy, 55, 42 + dy), fill=TRIM)
    d.line((8, 48 + dy, 52, 47 + dy), fill=HULL_LIT)
    d.line((5, 40 + dy, 13, 39 + dy), fill=HULL_LIT)
    gunports(d, 20, 48, 46 + dy, 9)
    d.line((57, 41 + dy, 63, 37 + dy), fill=WOOD_DARK)  # bowsprit
    d.line((31, 8 + dy, 31, 42 + dy), fill=INK, width=2); d.line((31, 9 + dy, 31, 41 + dy), fill=WOOD_LIT)
    # Weathered gaff mainsail with a patch, and a small jib.
    poly(d, [(33, 11 + dy), (47, 16 + dy), (52, 38 + dy), (33, 38 + dy)], SAIL, INK)
    poly(d, [(34, 13 + dy), (45, 17 + dy), (47, 26 + dy), (34, 26 + dy)], SAIL_LIT)
    d.rectangle((40, 29 + dy, 44, 33 + dy), fill=PATCH); d.point((39, 31 + dy), fill=INK)
    d.line((34, 36 + dy, 50, 36 + dy), fill=SAIL_SHADE)
    poly(d, [(29, 12 + dy), (29, 38 + dy), (14, 38 + dy)], SAIL_SHADE, INK)
    d.line((27, 18 + dy, 19, 35 + dy), fill=SAIL)
    pirate_flag(d, 32, 3 + dy, frame)
    clip_below(im, water)
    foam(d, 8, 56, water, frame)
    return im


def brig(frame):
    im, d = canvas(96, 80)
    dy, water = [0, 1, 2][frame], 69
    hull = [(4, 50 + dy), (18, 49 + dy), (21, 55 + dy), (84, 53 + dy), (90, 50 + dy), (86, 62 + dy), (78, 71 + dy), (14, 71 + dy), (7, 61 + dy)]
    poly(d, hull, HULL, INK)
    d.rectangle((5, 46 + dy, 19, 50 + dy), fill=HULL_DARK); d.line((5, 46 + dy, 19, 46 + dy), fill=TRIM)  # stern castle
    d.line((20, 56 + dy, 86, 54 + dy), fill=TRIM)
    d.line((9, 63 + dy, 84, 61 + dy), fill=HULL_LIT)
    gunports(d, 24, 80, 58 + dy, 8)
    d.line((89, 51 + dy, 95, 44 + dy), fill=WOOD_DARK, width=2)
    for mast, top in [(34, 8), (64, 12)]:
        d.line((mast, top + dy, mast, 55 + dy), fill=INK, width=2); d.line((mast, top + 1 + dy, mast, 54 + dy), fill=WOOD_LIT)
    square_sail(d, 34, 15 + dy, 22, 14, patch=True)
    square_sail(d, 34, 32 + dy, 26, 15)
    square_sail(d, 64, 19 + dy, 20, 12)
    square_sail(d, 64, 34 + dy, 24, 14, patch=True)
    poly(d, [(66, 14 + dy), (92, 47 + dy), (68, 47 + dy)], SAIL_SHADE, INK)  # jib between foremast and bowsprit
    d.line((70, 22 + dy, 86, 45 + dy), fill=SAIL)
    pirate_flag(d, 35, 1 + dy, frame, 12, 8)
    clip_below(im, water)
    foam(d, 9, 86, water, frame)
    return im


def flagship(frame):
    im, d = canvas(128, 112)
    dy, water = [0, 1, 2][frame], 99
    hull = [(4, 70 + dy), (26, 69 + dy), (29, 76 + dy), (112, 74 + dy), (121, 70 + dy), (117, 86 + dy), (106, 101 + dy), (17, 101 + dy), (8, 88 + dy)]
    poly(d, hull, HULL_DARK, INK)
    # Tall stern castle with lit stern windows (the only gold on the ship).
    poly(d, [(3, 58 + dy), (27, 58 + dy), (29, 70 + dy), (4, 70 + dy)], HULL, INK)
    d.line((4, 59 + dy, 26, 59 + dy), fill=TRIM)
    for x in (8, 14, 20):
        d.rectangle((x, 62 + dy, x + 3, 66 + dy), fill=INK); d.rectangle((x + 1, 63 + dy, x + 2, 65 + dy), fill=GLOW)
    d.line((29, 77 + dy, 115, 75 + dy), fill=TRIM)
    d.line((10, 89 + dy, 113, 87 + dy), fill=HULL_LIT)
    d.line((14, 95 + dy, 108, 94 + dy), fill=TRIM)
    gunports(d, 32, 110, 80 + dy, 8)
    gunports(d, 30, 106, 90 + dy, 9)
    d.line((120, 71 + dy, 127, 60 + dy), fill=WOOD_DARK, width=2)
    for mast, top in [(40, 12), (70, 6), (98, 16)]:
        d.line((mast, top + dy, mast, 76 + dy), fill=INK, width=3); d.line((mast, top + 1 + dy, mast, 75 + dy), fill=WOOD_LIT)
    square_sail(d, 40, 22 + dy, 20, 13, colors=BLACK_SAIL)
    square_sail(d, 40, 38 + dy, 26, 17, patch=True, colors=BLACK_SAIL)
    square_sail(d, 70, 14 + dy, 24, 14, patch=True, colors=BLACK_SAIL)
    square_sail(d, 70, 31 + dy, 30, 17, colors=BLACK_SAIL)
    square_sail(d, 70, 51 + dy, 32, 16, colors=BLACK_SAIL)
    square_sail(d, 98, 24 + dy, 20, 12, colors=BLACK_SAIL)
    square_sail(d, 98, 39 + dy, 24, 15, patch=True, colors=BLACK_SAIL)
    # A red stripe across the main course marks the armada's flagship.
    d.line((57, 41 + dy, 83, 41 + dy), fill=FLAG_RED, width=2)
    d.line((59, 58 + dy, 81, 58 + dy), fill=FLAG_RED, width=2)
    pirate_flag(d, 71, 0 + dy, frame, 16, 9)
    pirate_flag(d, 41, 6 + dy, (frame + 1) % 3, 9, 6)
    clip_below(im, water)
    foam(d, 9, 118, water, frame)
    return im


def cannonball():
    im, d = canvas(16, 16)
    d.ellipse((4, 4, 11, 11), fill=INK)
    d.ellipse((5, 5, 10, 10), fill=IRON)
    d.point((6, 6), fill=IRON_LIT); d.point((7, 6), fill=IRON_LIT); d.point((6, 7), fill=IRON_LIT)
    return im


def splash(frame):
    im, d = canvas(32, 32)
    if frame == 0:
        d.ellipse((9, 24, 22, 29), outline=FOAM)
        d.rectangle((14, 18, 17, 25), fill=FOAM_DIM); d.rectangle((15, 16, 16, 24), fill=FOAM)
        for x, y in [(11, 20), (20, 19)]:
            d.point((x, y), fill=FOAM)
    elif frame == 1:
        d.ellipse((6, 23, 25, 30), outline=FOAM_DIM)
        poly(d, [(12, 27), (13, 12), (15, 5), (17, 5), (19, 12), (20, 27)], FOAM_DIM)
        poly(d, [(14, 26), (15, 9), (16, 6), (17, 9), (18, 26)], FOAM)
        for x, y in [(9, 13), (23, 11), (11, 7), (21, 16)]:
            d.rectangle((x, y, x + 1, y + 1), fill=FOAM)
    else:
        d.ellipse((3, 22, 28, 30), outline=FOAM_DIM)
        d.ellipse((8, 24, 23, 28), outline=FOAM)
        for x, y in [(6, 18), (25, 17), (10, 21), (21, 21), (15, 14), (16, 19)]:
            d.rectangle((x, y, x + 1, y + 1), fill=FOAM if y < 20 else FOAM_DIM)
    return im


def wreck():
    im, d = canvas(64, 48)
    water = 40
    # The broken hull lists to one side, its bow under water; a snapped mast and torn sail drape over it.
    poly(d, [(6, 26), (16, 27), (44, 33), (52, 42), (12, 44), (5, 35)], HULL_DARK, INK)
    d.line((8, 30, 43, 35), fill=HULL)
    d.line((15, 27, 44, 33), fill=TRIM)
    for x in (18, 27, 36):
        d.line((x, 31 + (x - 18) // 5, x + 1, 38), fill=INK)  # sprung planks
    d.line((24, 31, 42, 13), fill=INK, width=2); d.line((25, 30, 41, 14), fill=WOOD_LIT)
    poly(d, [(36, 18), (46, 22), (44, 31), (39, 27), (35, 30)], SAIL_SHADE, INK)
    d.point((41, 24), fill=PATCH); d.point((42, 25), fill=PATCH)
    poly(d, [(8, 20), (14, 21), (14, 25), (8, 24)], FLAG, INK)  # the flag hangs limp
    d.line((7, 18, 7, 28), fill=WOOD_DARK)
    d.line((50, 37, 60, 35), fill=WOOD, width=2); d.line((51, 36, 59, 34), fill=WOOD_LIT)  # floating plank
    clip_below(im, water)
    foam(d, 6, 54, water, 1)
    d.point((56, 38), fill=FOAM); d.point((49, 39), fill=FOAM_DIM)
    return im


def wall(state):
    """A short stone sea wall on the 3/4 grid: top face, front face, crenels. 0 intact, 1 damaged, 2 broken."""
    im, d = canvas(48, 48)
    shadow(d, 24, 42, 21, 4)
    if state < 2:
        poly(d, [(3, 18), (45, 18), (45, 42), (3, 42)], STONE, INK)
        d.rectangle((4, 19, 44, 23), fill=STONE_LIT)  # walk-way top
        for x in range(4, 44, 10):  # crenels
            d.rectangle((x, 12, x + 5, 18), fill=INK); d.rectangle((x + 1, 13, x + 4, 17), fill=STONE_LIT)
            d.line((x + 1, 17, x + 4, 17), fill=STONE)
        for row, y in enumerate(range(27, 42, 5)):
            d.line((4, y, 44, y), fill=STONE_DARK)
            for x in range(6 + (row % 2) * 5, 44, 10):
                d.line((x, y - 4, x, y - 1), fill=STONE_DARK)
        d.line((4, 41, 44, 41), fill=STONE_DARK)
        d.line((44, 19, 44, 41), fill=STONE_DARK)
    if state == 1:
        # Two crenels knocked off, a crack and fallen stones.
        d.rectangle((24, 11, 35, 18), fill=(0, 0, 0, 0))
        poly(d, [(24, 18), (28, 16), (31, 19), (35, 17), (35, 19), (24, 19)], STONE_DARK)
        d.line((29, 20, 27, 26), fill=INK); d.line((27, 26, 30, 31), fill=INK); d.line((30, 31, 28, 36), fill=INK)
        for x, y in [(36, 43), (40, 44), (8, 44)]:
            d.rectangle((x, y, x + 2, y + 1), fill=STONE_DARK); d.point((x, y), fill=STONE_LIT)
    if state == 2:
        # Rubble: two stubs of wall either side of a breach.
        for x0, x1 in [(3, 15), (33, 45)]:
            poly(d, [(x0, 30), (x0 + 4, 27), (x1 - 3, 29), (x1, 32), (x1, 42), (x0, 42)], STONE, INK)
            d.line((x0 + 1, 33, x1 - 1, 33), fill=STONE_LIT)
            d.line((x0 + 1, 38, x1 - 1, 38), fill=STONE_DARK)
        poly(d, [(14, 42), (18, 36), (24, 34), (30, 37), (34, 42)], STONE_DARK, INK)
        for x, y in [(18, 38), (24, 36), (27, 39), (21, 40)]:
            d.rectangle((x, y, x + 2, y + 1), fill=STONE); d.point((x, y), fill=STONE_LIT)
        for x, y in [(6, 44), (38, 44), (12, 45)]:
            d.rectangle((x, y, x + 2, y + 1), fill=STONE_DARK)
    return im


def cannon(fire=False):
    im, d = canvas(48, 32)
    shadow(d, 20, 27, 15, 3)
    recoil = 2 if fire else 0
    # Wooden carriage with two iron-rimmed wheels.
    poly(d, [(8 - recoil, 18), (30 - recoil, 16), (30 - recoil, 22), (8 - recoil, 24)], WOOD, INK)
    d.line((9 - recoil, 19, 29 - recoil, 17), fill=WOOD_LIT)
    for wx in (11, 24):
        x = wx - recoil
        d.ellipse((x - 4, 19, x + 4, 27), fill=INK); d.ellipse((x - 3, 20, x + 3, 26), fill=WOOD_DARK)
        d.point((x, 23), fill=WOOD_LIT)
    # Iron barrel aimed seaward, slightly raised.
    poly(d, [(6 - recoil, 12), (34 - recoil, 8), (35 - recoil, 14), (7 - recoil, 18)], IRON, INK)
    d.line((8 - recoil, 13, 33 - recoil, 9), fill=IRON_LIT)
    d.rectangle((34 - recoil, 7, 37 - recoil, 15), fill=INK); d.rectangle((35 - recoil, 8, 36 - recoil, 14), fill=IRON)
    d.ellipse((3 - recoil, 12, 8 - recoil, 18), fill=INK); d.point((5 - recoil, 14), fill=IRON_LIT)
    if fire:
        # Muzzle flash: a bright core with short rays, the one warm light of the shot.
        d.ellipse((37, 7, 44, 14), fill=GOLD)
        for ray in [(43, 10, 47, 10), (42, 7, 45, 4), (42, 13, 45, 16), (40, 6, 40, 3), (40, 15, 40, 17)]:
            d.line(ray, fill=GOLD)
        d.rectangle((38, 9, 41, 12), fill=GOLD_LIT)
        for x, y, r in [(31, 3, 3), (38, 1, 2), (26, 5, 2)]:
            d.ellipse((x - r, y - r + 2, x + r, y + r + 2), fill='#c9cbbd')
            d.point((x - 1, y + 1), fill='#eef0e3')
    return im


def watchtower():
    im, d = canvas(64, 128)
    shadow(d, 32, 121, 22, 5)
    # Four timber legs with cross bracing and a ladder.
    for x0, x1 in [(14, 22), (49, 41)]:
        d.line((x0, 120, x1, 46), fill=INK, width=4); d.line((x0, 119, x1, 47), fill=WOOD, width=2)
    d.line((24, 118, 26, 48), fill=WOOD_DARK, width=2); d.line((40, 118, 38, 48), fill=WOOD_DARK, width=2)
    for y in (66, 92):
        d.line((19, y, 45, y - 18), fill=WOOD_DARK, width=2); d.line((19, y - 18, 45, y), fill=WOOD_DARK, width=2)
        d.line((18, y, 46, y), fill=WOOD, width=2)
    for y in range(52, 120, 6):  # ladder rungs
        d.line((29, y, 35, y), fill=WOOD_LIT)
    d.line((29, 50, 29, 120), fill=WOOD_DARK); d.line((35, 50, 35, 120), fill=WOOD_DARK)
    # Platform with a railing and a lookout hut with a red-brown roof.
    poly(d, [(8, 40), (56, 40), (58, 48), (6, 48)], WOOD, INK)
    d.line((8, 41, 56, 41), fill=WOOD_LIT)
    d.rectangle((16, 24, 48, 40), fill=INK); d.rectangle((18, 26, 46, 39), fill='#b5a578')
    d.rectangle((24, 29, 33, 37), fill=INK); d.rectangle((25, 30, 32, 36), fill='#324c45')
    d.rectangle((37, 29, 43, 36), fill=INK); d.rectangle((38, 30, 42, 35), fill=GLOW)  # watch lamp
    d.point((39, 31), fill=GOLD_LIT)
    poly(d, [(10, 25), (22, 10), (42, 10), (54, 25)], '#925f47', INK)
    for y in range(14, 25, 4):
        inset = (25 - y) + 12
        d.line((inset, y, 64 - inset, y), fill='#b77f54')
    d.line((31, 2, 31, 10), fill=INK)
    poly(d, [(32, 2), (40, 3), (40, 7), (32, 6)], '#56644a', INK)  # island pennant (not a pirate flag)
    for x in range(9, 57, 6):
        d.line((x, 40, x, 44), fill=WOOD_DARK)
    return im


def cottage():
    im, d = canvas(64, 64)
    shadow(d, 32, 58, 26, 4)
    d.rectangle((10, 30, 54, 56), fill=INK); d.rectangle((12, 32, 52, 54), fill='#b5a578')
    d.rectangle((44, 32, 52, 54), fill='#9e9068')
    for y in (38, 46):
        d.line((13, y, 43, y), fill='#c8b68a')
    poly(d, [(5, 32), (16, 14), (48, 14), (59, 32), (56, 35), (8, 35)], '#925f47', INK)
    for y in range(18, 32, 4):
        inset = (32 - y) // 2 + 8
        d.line((inset, y, 64 - inset, y), fill='#b77f54')
        for x in range(inset + 3 + (y % 3) * 3, 64 - inset - 2, 9):
            d.line((x, y - 2, x + 1, y), fill='#704b38')
    d.rectangle((40, 6, 46, 18), fill=INK); d.rectangle((41, 7, 45, 17), fill='#8d8a77')
    d.rectangle((17, 40, 27, 54), fill=INK); d.rectangle((19, 42, 25, 54), fill='#4b6551'); d.point((24, 48), fill=TRIM)
    d.rectangle((32, 39, 41, 47), fill=INK); d.rectangle((33, 40, 40, 46), fill='#7a9b87'); d.line((36, 40, 36, 46), fill=INK)
    d.rectangle((31, 48, 42, 50), fill='#56644a'); d.point((34, 48), fill='#c9707a'); d.point((38, 48), fill='#e2c46f')
    return im


def flag_trophy():
    im, d = canvas(32, 48)
    shadow(d, 10, 44, 7, 2)
    d.rectangle((8, 41, 13, 44), fill=STONE_DARK); d.line((8, 41, 13, 41), fill=STONE_LIT)
    d.line((10, 3, 10, 41), fill=INK, width=2); d.line((10, 4, 10, 40), fill=WOOD_LIT)
    d.ellipse((9, 1, 12, 4), fill=TRIM)
    poly(d, [(12, 5), (24, 4), (28, 8), (24, 13), (28, 18), (12, 19)], FLAG, INK)  # swallowtail
    d.line((14, 17, 22, 7), fill=FLAG_RED, width=2)
    for x, y in [(19, 12), (18, 12), (20, 12), (19, 11), (19, 13)]:
        d.point((x, y), fill=BONE)
    return im


def build_spot(glow=False):
    """A ring of light on the ground marking a free build spot; the glow frame pulses brighter."""
    im, d = canvas(32, 24)
    outer = GOLD_LIT if glow else GLOW
    if glow:
        d.ellipse((1, 5, 30, 22), fill=(240, 202, 112, 70))
    d.ellipse((3, 7, 28, 20), fill=(240, 202, 112, 45 if glow else 30))
    d.ellipse((3, 7, 28, 20), outline=GOLD)
    for x, y in [(15, 7), (16, 7), (15, 20), (16, 20), (3, 13), (3, 14), (28, 13), (28, 14)]:
        d.point((x, y), fill=outer)
    d.line((15, 11, 16, 11), fill=outer); d.line((13, 13, 18, 13), fill=outer); d.line((15, 15, 16, 15), fill=outer)
    d.line((15, 12, 15, 14), fill=outer); d.line((16, 12, 16, 14), fill=outer)
    tile = Image.new('RGBA', (32, 32))  # keep the sprite on the 16 px grid; the ring sits on the ground
    tile.paste(im, (0, 8))
    return tile


def assets():
    out = {}
    for name, draw in [('sloop', sloop), ('brig', brig), ('flagship', flagship), ('splash', splash)]:
        for frame in range(3):
            out[f'pirate-{name}-{frame + 1}'] = draw(frame)
    out.update({
        'pirate-cannonball': cannonball(), 'pirate-wreck': wreck(),
        'island-wall': wall(0), 'island-wall-damaged': wall(1), 'island-wall-broken': wall(2),
        'island-cannon': cannon(), 'island-cannon-fire': cannon(True), 'island-watchtower': watchtower(),
        'island-house': cottage(), 'pirate-flag-trophy': flag_trophy(),
        'build-spot': build_spot(), 'build-spot-glow': build_spot(True),
    })
    return out


def contact_sheet(path, scale=3):
    """All pirate sprites on a sea-and-sand strip at an integer scale, for review."""
    from PIL import ImageDraw
    sprites = assets()
    pad, cols, cell_w = 8, 6, 136
    rows = (len(sprites) + cols - 1) // cols
    cell_h = 128 + 18
    sheet = Image.new('RGBA', (cols * cell_w, rows * cell_h), '#3f716c')
    draw = ImageDraw.Draw(sheet)
    for index, (name, image) in enumerate(sprites.items()):
        x, y = (index % cols) * cell_w, (index // cols) * cell_h
        land = not name.startswith('pirate-') or name == 'pirate-flag-trophy'
        if land:
            draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), fill='#6f8f55')
        draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), outline='#2b4a45')
        sheet.alpha_composite(image, (x + (cell_w - image.width) // 2, y + 4 + (128 - image.height)))
        draw.text((x + 3, y + cell_h - 13), name, fill='#f3ecd2')
    sheet = sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST)
    sheet.save(path)


if __name__ == '__main__':
    import sys
    contact_sheet(sys.argv[1] if len(sys.argv) > 1 else 'pirate-art.png')
