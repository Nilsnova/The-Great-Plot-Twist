"""Original pirate tower-defense sprites, drawn as code on the 16 px grid in a clean pixel style:
flat colour areas, two or three shades per material lit from the top left, crisp one-pixel dark
outlines and detail made of shapes (planks, rigging, gun ports), never texture noise. Ships with
three bob frames, the warship boss, shots, splashes, effects, the wreck, the island defences in
three levels, crew, the captain's musket, the flag trophy and the build-spot marker. Gold only for
lights and interaction (lamps, flashes, fire, the build marker and the level pip). No downloaded art.

  python3 pirates.py --write          writes only these PNGs to public/pixel (no other art changes)
  python3 pirates.py sheet.png [old]  writes a 3x contact sheet; [old] = folder of previous PNGs"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageColor
from common import canvas, poly, shadow

INK = '#263a32'
ROPE = '#3b3229'
HULL3 = ('#7a5b3e', '#5a4331', '#3f3026')          # lit, base, dark
DARK_HULL3 = ('#5a4331', '#3f3026', '#2c221b')
WAR3 = ('#4a433d', '#322d2a', '#211e1d')
TRIM, TRIM_DARK = '#b99d60', '#8a7346'
SAIL3 = ('#b9b297', '#948e77', '#6f6c5b')
PATCH = '#77735f'
BLACK3 = ('#59625b', '#414843', '#2c322f')
TATTER3 = ('#5e5650', '#45403b', '#2f2b28')
RED, RED_DARK = '#b0402f', '#7a2c22'
FLAG, FLAG_FOLD, BONE = '#1d2320', '#323b36', '#e0d5b0'
IRON3 = ('#78837b', '#4d5650', '#2c322f')
STONE3 = ('#b9bba2', '#8e927d', '#666c5f')
WOOD3 = ('#a48460', '#7a5d43', '#58432f')
BRONZE3 = ('#cf9f5e', '#9c6f3d', '#674626')
BRASS3 = ('#e2c070', '#b48c45', '#7c5d2b')
MOSS = ('#86a35a', '#5f7d45')
PLASTER3 = ('#d2c497', '#b5a578', '#8f8160')
ROOF3 = ('#b77f54', '#925f47', '#6a4334')
SKIN, SKIN_DARK = '#d8ae78', '#b0855a'
FOAM, FOAM_DIM = '#e8f2ea', '#a7cdc3'
GOLD, GOLD_LIT, GLOW = '#e9b94f', '#fff0a4', '#f0ca70'
FIRE4 = ('#fff0a4', '#f3b54a', '#e0702f', '#a8382a')
SMOKE4 = ('#e2e4da', '#b8bcb1', '#8c928a', '#5f6862')
CLEAR = (0, 0, 0, 0)
_rgba = {}


def rgba(c):
    if isinstance(c, tuple):
        return c if len(c) == 4 else c + (255,)
    if c not in _rgba:
        _rgba[c] = ImageColor.getrgb(c) + (255,)
    return _rgba[c]


def fill_shape(im, pts, pick, outline=INK):
    """Fills a polygon pixel by pixel with pick(x, y, u, v) (u, v run 0..1 across its box), then inks the edge."""
    mask = Image.new('L', im.size)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    m, px = mask.load(), im.load()
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, y0, x1, y1 = max(0, min(xs)), max(0, min(ys)), min(im.width - 1, max(xs)), min(im.height - 1, max(ys))
    w, h = max(1, x1 - x0), max(1, y1 - y0)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if m[x, y]:
                c = pick(x, y, (x - x0) / w, (y - y0) / h)
                if c is not None:
                    px[x, y] = rgba(c)
    if outline:
        ImageDraw.Draw(im).line(list(pts) + [pts[0]], fill=outline)


def bands(ramp, top, bottom, lit=.3, dark=.72, seams=()):
    """Three flat horizontal bands (lit top, base, dark keel); plank seams are clean lines one shade darker."""
    def pick(x, y, u, v):
        t = (y - top) / max(1, bottom - top)
        i = 0 if t < lit else 1 if t < dark else 2
        return ramp[min(2, i + 1)] if y in seams else ramp[i]
    return pick


def cloth(tones, cut1=.42, cut2=.8):
    """Sail cloth: lit upper left, base, shaded lower right, as three clean diagonal areas."""
    def pick(x, y, u, v):
        s = .55 * u + .5 * v
        return tones[0] if s < cut1 else tones[1] if s < cut2 else tones[2]
    return pick


def ink_edges(layer):
    """Every opaque pixel touching transparency becomes outline ink (keeps torn edges crisp)."""
    src = layer.copy().load()
    px = layer.load()
    for y in range(layer.height):
        for x in range(layer.width):
            if src[x, y][3] == 0:
                continue
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if not (0 <= nx < layer.width and 0 <= ny < layer.height) or src[nx, ny][3] == 0:
                    px[x, y] = rgba(INK)
                    break


def tear(layer, notches=(), holes=()):
    """Cuts clean V notches into a sail's foot and small holes into its cloth, then re-inks the edges."""
    px = layer.load()
    for x, depth in notches:
        bottom = max((y for y in range(layer.height) if px[x, y][3]), default=None)
        if bottom is None:
            continue
        for k in range(depth):
            half = depth - 1 - k
            for xx in range(x - half, x + half + 1):
                if 0 <= xx < layer.width:
                    px[xx, bottom - k] = CLEAR
    for hx, hy, w, h in holes:
        for y in range(hy, hy + h):
            for x in range(hx, hx + w):
                px[x, y] = CLEAR
    ink_edges(layer)


def sail(im, pts, tones, patch=None, notches=(), holes=(), reef=None):
    layer = Image.new('RGBA', im.size)
    fill_shape(layer, pts, cloth(tones))
    d = ImageDraw.Draw(layer)
    if reef:
        x0, x1, y = reef
        d.line((x0, y, x1, y), fill=tones[2])
    if patch:
        x, y = patch
        d.rectangle((x, y, x + 3, y + 3), fill=PATCH)
        d.line((x, y, x + 3, y), fill=tones[2]); d.line((x, y, x, y + 3), fill=tones[2])
    if notches or holes:
        tear(layer, notches, holes)
    im.alpha_composite(layer)


def square_sail(im, d, cx, top, w, h, tones=SAIL3, patch=False, notches=(), holes=()):
    """A square sail on its yard, bellied forward; the yard is a two-row spar with inked ends."""
    left, right = cx - w // 2, cx + w // 2
    pts = [(left, top + 1), (right, top + 1), (right + 2, top + h), (cx + 2, top + h + 1), (left - 2, top + h)]
    sail(im, pts, tones, patch=(cx + 3, top + 4) if patch else None,
         notches=notches, holes=holes, reef=(left + 1, right - 1, top + 4))
    d.rectangle((left - 4, top - 1, right + 4, top), fill=INK)
    d.line((left - 3, top - 1, right + 3, top - 1), fill=WOOD3[1])


def mast(d, x, top, bottom, wide=False):
    d.rectangle((x - 1, top, x + (2 if wide else 1), bottom), fill=INK)
    d.line((x, top + 1, x, bottom), fill=WOOD3[0])
    if wide:
        d.line((x + 1, top + 1, x + 1, bottom), fill=WOOD3[1])


def nest(d, x, y):
    d.rectangle((x - 4, y, x + 5, y + 3), fill=INK)
    d.rectangle((x - 3, y + 1, x + 4, y + 2), fill=WOOD3[1])
    d.line((x - 3, y + 1, x + 4, y + 1), fill=WOOD3[0])


def shrouds(d, x, top, deck, spread):
    """Shrouds from the mast to both rails, with ratlines across the aft pair."""
    d.line((x, top, x - spread, deck), fill=ROPE)
    d.line((x + 1, top, x + 1 + spread, deck), fill=ROPE)
    for y in range(top + 4, deck - 1, 3):
        xa = round(x - spread * (y - top) / (deck - top))
        d.line((xa, y, x - 1, y), fill=ROPE)


def spar(d, a, b):
    d.line(a + b, fill=INK)
    d.line((a[0], a[1] - 1, b[0], b[1] - 1), fill=WOOD3[1])


def port(d, x, y, lid=RED_DARK):
    """An open gun port: dark square, a muzzle ring and the raised red lid above."""
    d.rectangle((x, y, x + 3, y + 2), fill=INK)
    d.rectangle((x + 1, y + 1, x + 2, y + 1), fill=IRON3[1])
    d.line((x, y - 1, x + 3, y - 1), fill=lid)


def sailor(d, x, y, cap=RED, shirt=BONE):
    """A small crew figure standing at the rail: y is the rail line."""
    d.rectangle((x - 1, y - 7, x + 2, y - 4), fill=INK)
    d.line((x, y - 6, x + 1, y - 6), fill=cap)
    d.line((x, y - 5, x + 1, y - 5), fill=SKIN)
    d.rectangle((x - 2, y - 4, x + 3, y - 1), fill=INK)
    d.rectangle((x - 1, y - 3, x + 2, y - 2), fill=shirt)
    d.line((x - 1, y - 2, x + 2, y - 2), fill='#3b4a5a')


def lantern(d, x, y, post=0):
    """A stern lantern; post = rows of iron bracket below it down to the rail."""
    if post:
        d.line((x, y + 3, x, y + 2 + post), fill=INK)
    d.rectangle((x - 1, y - 1, x + 1, y + 2), fill=INK)
    d.line((x, y, x, y + 1), fill=GLOW)
    d.point((x, y), fill=GOLD_LIT)


def windows(d, xs, y, glow=GLOW):
    for x in xs:
        d.rectangle((x, y, x + 3, y + 3), fill=INK)
        d.rectangle((x + 1, y + 1, x + 2, y + 2), fill=glow)
        d.point((x + 1, y + 1), fill=GOLD_LIT)


def pirate_flag(d, x, y, frame, w=10, h=7, skull=False):
    """Black flag flying right with a fold line; the fly edge ripples by frame."""
    ripple = [0, 1, -1][frame % 3]
    poly(d, [(x, y), (x + w, y + ripple), (x + w, y + h + ripple), (x, y + h)], FLAG, INK)
    fold = x + w * 2 // 3
    d.line((fold, y + 1 + (ripple > 0), fold, y + h - 1 + (ripple < 0) * 0), fill=FLAG_FOLD)
    cx, cy = x + w // 2 - 1, y + h // 2
    if skull:
        d.rectangle((cx - 1, cy - 2, cx + 2, cy), fill=BONE)
        d.point((cx - 1, cy - 1), fill=FLAG); d.point((cx + 2, cy - 1), fill=FLAG)  # rounded cranium
        d.point((cx, cy - 1), fill=FLAG); d.point((cx + 1, cy - 1), fill=BONE)
        d.line((cx, cy + 1, cx + 1, cy + 1), fill=BONE)
        d.line((cx - 2, cy + 2, cx + 3, cy + 4), fill=BONE); d.line((cx - 2, cy + 4, cx + 3, cy + 2), fill=BONE)
    else:
        d.line((x + 2, y + h - 2, x + w - 2, y + 1 + ripple), fill=RED)
        d.line((cx, cy - 1, cx, cy + 1), fill=BONE); d.line((cx - 1, cy, cx + 1, cy), fill=BONE)


def clip_below(image, waterline):
    """Everything under the waterline is sea: the world's water shows through."""
    px = image.load()
    for y in range(waterline, image.height):
        for x in range(image.width):
            px[x, y] = CLEAR


def wake(d, x0, x1, water, frame, bow):
    """Clean foam: dashes along the hull, a bow wave curling ahead and a trailing wake under the stern."""
    shift = frame * 2
    for x in range(x0 - 2, x1, 6):
        a = x + shift
        if a + 3 < x1:
            d.line((a, water, a + 3, water), fill=FOAM)
    for x in range(x0 - 4, x0 + (x1 - x0) // 2, 8):
        a = x + (shift + 3) % 8
        d.line((a, water + 1, a + 2, water + 1), fill=FOAM_DIM)
    for x in range(x0 - 6, x0 + 8, 7):
        d.line((x + shift, water + 2, x + shift + 1, water + 2), fill=FOAM_DIM)
    d.line((bow - 3, water, bow + 3, water), fill=FOAM)
    d.line((bow - 1, water - 1, bow + 2, water - 1), fill=FOAM)
    d.line((bow + 2, water + 1, bow + 5, water + 1), fill=FOAM_DIM)


def shift(pts, dy):
    return [(x, y + dy) for x, y in pts]


# ---------------------------------------------------------------- ships

def sloop(frame):
    im, d = canvas(64, 64)
    dy, water = [0, 1, 2][frame], 54
    mast(d, 34, 4 + dy, 43 + dy)
    d.line((34, 6 + dy, 61, 38 + dy), fill=ROPE)
    d.line((33, 7 + dy, 6, 39 + dy), fill=ROPE)
    shrouds(d, 34, 14 + dy, 42 + dy, 6)
    sail(im, shift([(32, 14), (16, 8), (10, 37), (32, 37)], dy), SAIL3, patch=(18, 26 + dy), reef=(12, 31, 30 + dy))
    sail(im, shift([(36, 11), (59, 37), (37, 37)], dy), SAIL3)
    spar(d, (33, 14 + dy), (14, 7 + dy)); spar(d, (33, 38 + dy), (7, 38 + dy))
    hull = shift([(4, 40), (12, 39), (15, 43), (56, 41), (53, 49), (48, 56), (12, 56), (6, 47)], dy)
    fill_shape(im, hull, bands(HULL3, 40 + dy, 56 + dy, seams={47 + dy, 51 + dy}))
    d.line((16, 44 + dy, 55, 42 + dy), fill=TRIM); d.line((5, 41 + dy, 12, 40 + dy), fill=TRIM)
    for x in (22, 31, 40):
        port(d, x, 46 + dy)
    d.line((55, 41 + dy, 63, 36 + dy), fill=INK); d.line((55, 40 + dy, 62, 35 + dy), fill=WOOD3[1])
    sailor(d, 23, 43 + dy); sailor(d, 46, 42 + dy, cap='#3b4a5a')
    lantern(d, 5, 35 + dy, 4)
    pirate_flag(d, 36, 2 + dy, frame)
    clip_below(im, water)
    wake(d, 8, 54, water, frame, 54)
    return im


def brig(frame):
    im, d = canvas(96, 80)
    dy, water = [0, 1, 2][frame], 69
    d.line((36, 6 + dy, 66, 11 + dy), fill=ROPE)
    d.line((66, 11 + dy, 94, 44 + dy), fill=ROPE)
    d.line((36, 6 + dy, 6, 44 + dy), fill=ROPE)
    mast(d, 36, 4 + dy, 55 + dy, wide=True); mast(d, 66, 9 + dy, 54 + dy)
    shrouds(d, 36, 16 + dy, 54 + dy, 9); shrouds(d, 66, 20 + dy, 53 + dy, 8)
    sail(im, shift([(68, 13), (92, 46), (70, 46)], dy), SAIL3)
    square_sail(im, d, 36, 17 + dy, 20, 12, patch=True)
    square_sail(im, d, 36, 32 + dy, 26, 16)
    square_sail(im, d, 66, 21 + dy, 18, 11)
    square_sail(im, d, 66, 35 + dy, 24, 14, patch=True)
    nest(d, 36, 13 + dy)
    hull = shift([(4, 50), (18, 49), (21, 55), (84, 53), (90, 50), (86, 62), (78, 71), (14, 71), (7, 61)], dy)
    fill_shape(im, hull, bands(HULL3, 50 + dy, 71 + dy, seams={56 + dy, 63 + dy, 66 + dy}))
    fill_shape(im, shift([(4, 43), (20, 43), (21, 50), (5, 50)], dy), bands(HULL3, 43 + dy, 50 + dy, .4, .9))
    d.line((5, 44 + dy, 19, 44 + dy), fill=TRIM)
    windows(d, (8, 14), 45 + dy)
    d.line((21, 56 + dy, 85, 54 + dy), fill=TRIM)
    for x in range(25, 82, 8):
        port(d, x, 58 + dy)
    d.line((88, 51 + dy, 95, 43 + dy), fill=INK); d.line((87, 51 + dy, 94, 43 + dy), fill=WOOD3[1])
    for x, y in [(28, 55), (52, 54), (76, 53)]:
        sailor(d, x, y + dy, cap=RED if x != 52 else '#3b4a5a')
    lantern(d, 4, 38 + dy, 3)
    pirate_flag(d, 38, 1 + dy, frame, 12, 8)
    clip_below(im, water)
    wake(d, 10, 86, water, frame, 86)
    return im


def flagship(frame):
    im, d = canvas(128, 112)
    dy, water = [0, 1, 2][frame], 99
    d.line((40, 12 + dy, 70, 5 + dy), fill=ROPE); d.line((70, 5 + dy, 98, 16 + dy), fill=ROPE)
    d.line((98, 16 + dy, 126, 59 + dy), fill=ROPE); d.line((40, 12 + dy, 4, 54 + dy), fill=ROPE)
    for x, top in [(40, 10), (70, 3), (98, 14)]:
        mast(d, x, top + dy, 76 + dy, wide=True)
    shrouds(d, 40, 26 + dy, 75 + dy, 9); shrouds(d, 70, 20 + dy, 75 + dy, 11); shrouds(d, 98, 28 + dy, 74 + dy, 9)
    sail(im, shift([(101, 17), (124, 60), (102, 60)], dy), BLACK3)
    square_sail(im, d, 40, 22 + dy, 20, 13, BLACK3)
    square_sail(im, d, 40, 38 + dy, 26, 17, BLACK3, patch=True)
    square_sail(im, d, 70, 14 + dy, 24, 14, BLACK3, patch=True)
    square_sail(im, d, 70, 31 + dy, 30, 17, BLACK3)
    square_sail(im, d, 70, 51 + dy, 32, 16, BLACK3)
    square_sail(im, d, 98, 24 + dy, 20, 12, BLACK3)
    square_sail(im, d, 98, 39 + dy, 24, 15, BLACK3, patch=True)
    d.rectangle((57, 40 + dy, 83, 41 + dy), fill=RED)   # the armada's red stripes
    d.rectangle((58, 59 + dy, 82, 60 + dy), fill=RED)
    hull = shift([(4, 70), (26, 69), (29, 76), (112, 74), (121, 70), (117, 86), (106, 101), (17, 101), (8, 88)], dy)
    fill_shape(im, hull, bands(DARK_HULL3, 70 + dy, 101 + dy, .25, .75, seams={84 + dy, 87 + dy, 96 + dy}))
    fill_shape(im, shift([(3, 56), (28, 56), (30, 70), (4, 70)], dy), bands(HULL3, 56 + dy, 70 + dy, .3, .85))
    d.line((4, 57 + dy, 27, 57 + dy), fill=TRIM); d.line((4, 68 + dy, 29, 68 + dy), fill=TRIM_DARK)
    windows(d, (7, 13, 19), 61 + dy)
    d.line((29, 77 + dy, 115, 75 + dy), fill=TRIM)
    d.line((12, 93 + dy, 110, 92 + dy), fill=TRIM_DARK)
    for x in range(33, 111, 8):
        port(d, x, 79 + dy)
    for x in range(31, 106, 9):
        port(d, x, 88 + dy)
    d.line((120, 71 + dy, 127, 58 + dy), fill=INK); d.line((119, 70 + dy, 126, 57 + dy), fill=WOOD3[1])
    d.rectangle((118, 69 + dy, 121, 72 + dy), fill=INK); d.rectangle((119, 70 + dy, 120, 71 + dy), fill=BONE)  # figurehead
    for x, y in [(36, 76), (58, 76), (84, 75), (106, 75)]:
        sailor(d, x, y + dy, cap=RED if x % 2 == 0 else '#3b4a5a')
    lantern(d, 4, 50 + dy, 4); lantern(d, 27, 50 + dy, 4)
    pirate_flag(d, 72, 0 + dy, frame, 16, 9)
    pirate_flag(d, 42, 4 + dy, (frame + 1) % 3, 9, 6)
    clip_below(im, water)
    wake(d, 10, 118, water, frame, 117)
    return im


def warship(frame):
    """The boss: a bigger, near-black hull with two gun decks, iron strakes, a ram and tattered dark sails."""
    im, d = canvas(160, 128)
    dy, water = [0, 1, 2][frame], 114
    d.line((46, 16 + dy, 84, 4 + dy), fill=ROPE); d.line((84, 4 + dy, 118, 13 + dy), fill=ROPE)
    d.line((118, 13 + dy, 158, 53 + dy), fill=ROPE); d.line((46, 16 + dy, 4, 50 + dy), fill=ROPE)
    for x, top in [(46, 14), (84, 2), (118, 11)]:
        mast(d, x, top + dy, 78 + dy, wide=True)
    shrouds(d, 46, 30 + dy, 77 + dy, 10); shrouds(d, 84, 22 + dy, 77 + dy, 13); shrouds(d, 118, 28 + dy, 72 + dy, 10)
    sail(im, shift([(121, 15), (155, 55), (122, 55)], dy), TATTER3, notches=[(130, 3), (141, 2)], holes=[(128, 40 + dy, 2, 2)])
    square_sail(im, d, 84, 11 + dy, 22, 10, TATTER3, notches=[(80, 2), (89, 3)])
    square_sail(im, d, 84, 24 + dy, 30, 16, TATTER3, patch=True, notches=[(74, 3), (86, 4), (95, 2)], holes=[(90, 29 + dy, 3, 2)])
    square_sail(im, d, 84, 43 + dy, 36, 18, TATTER3, notches=[(70, 2), (79, 4), (92, 3), (100, 2)], holes=[(76, 49 + dy, 2, 3), (95, 47 + dy, 3, 2)])
    square_sail(im, d, 46, 23 + dy, 20, 12, TATTER3, notches=[(42, 3), (51, 2)])
    square_sail(im, d, 46, 38 + dy, 26, 16, TATTER3, notches=[(38, 2), (47, 4), (56, 2)], holes=[(41, 44 + dy, 2, 2)])
    square_sail(im, d, 118, 19 + dy, 20, 12, TATTER3, notches=[(114, 2), (123, 3)])
    square_sail(im, d, 118, 34 + dy, 28, 17, TATTER3, patch=True, notches=[(108, 3), (120, 2), (129, 3)])
    hull = shift([(4, 72), (30, 71), (33, 78), (122, 77), (126, 70), (148, 69), (153, 67), (148, 90), (134, 116), (20, 116), (9, 98)], dy)
    fill_shape(im, hull, bands(WAR3, 70 + dy, 116 + dy, .22, .8, seams={89 + dy, 100 + dy, 104 + dy}))
    fill_shape(im, shift([(2, 52), (34, 52), (36, 72), (3, 72)], dy), bands(WAR3, 52 + dy, 72 + dy, .3, .85))
    d.line((3, 53 + dy, 33, 53 + dy), fill=IRON3[0]); d.line((3, 62 + dy, 35, 62 + dy), fill=RED_DARK)
    windows(d, (7, 14, 21, 28), 56 + dy, glow='#e0702f')
    windows(d, (10, 18, 26), 65 + dy, glow='#e0702f')
    d.line((126, 71 + dy, 148, 70 + dy), fill=IRON3[0])   # forecastle rail
    d.line((33, 79 + dy, 124, 78 + dy), fill=IRON3[0])
    d.line((14, 92 + dy, 140, 91 + dy), fill=IRON3[0])   # iron strakes between the gun decks
    d.line((22, 103 + dy, 136, 102 + dy), fill=IRON3[1])
    for x in range(36, 140, 8):
        port(d, x, 82 + dy)
    for x in range(30, 134, 8):
        port(d, x, 94 + dy)
    poly(d, shift([(148, 82), (157, 86), (148, 90)], dy), IRON3[1], INK)   # iron ram at the bow
    d.line((149, 84 + dy, 154, 86 + dy), fill=IRON3[0])
    d.line((151, 67 + dy, 159, 51 + dy), fill=INK); d.line((150, 66 + dy, 158, 50 + dy), fill=WOOD3[2])
    for x, y in [(42, 78), (64, 78), (100, 78), (132, 70), (140, 70)]:
        sailor(d, x, y + dy, cap=RED_DARK, shirt='#8c928a')
    lantern(d, 4, 46 + dy, 4); lantern(d, 32, 46 + dy, 4); lantern(d, 150, 62 + dy, 4)
    pirate_flag(d, 86, 0 + dy, frame, 18, 11, skull=True)
    pirate_flag(d, 48, 6 + dy, (frame + 2) % 3, 10, 7)
    clip_below(im, water)
    wake(d, 12, 148, water, frame, 150)
    return im


# ---------------------------------------------------------------- shots, splashes, wreck

def cannonball():
    im, d = canvas(16, 16)
    d.ellipse((4, 4, 11, 11), fill=INK)
    d.ellipse((5, 5, 10, 10), fill=IRON3[1])
    d.rectangle((6, 6, 7, 7), fill=IRON3[0])
    d.line((7, 10, 10, 7), fill=IRON3[2])
    return im


def splash(frame):
    im, d = canvas(32, 32)
    if frame == 0:
        d.ellipse((8, 24, 23, 29), outline=FOAM_DIM)
        poly(d, [(13, 26), (14, 18), (16, 15), (18, 18), (19, 26)], FOAM_DIM)
        poly(d, [(15, 25), (16, 17), (17, 25)], FOAM)
        for x, y in [(10, 20), (21, 19)]:
            d.rectangle((x, y, x + 1, y + 1), fill=FOAM)
    elif frame == 1:
        d.ellipse((5, 23, 26, 30), outline=FOAM_DIM)
        poly(d, [(11, 27), (13, 12), (15, 4), (17, 4), (19, 12), (21, 27)], FOAM_DIM)
        poly(d, [(14, 26), (15, 8), (16, 5), (17, 8), (18, 26)], FOAM)
        for x, y in [(8, 14), (23, 12), (10, 7), (21, 17)]:
            d.rectangle((x, y, x + 1, y + 1), fill=FOAM)
    else:
        d.ellipse((2, 22, 29, 30), outline=FOAM_DIM)
        d.ellipse((8, 24, 23, 28), outline=FOAM)
        for x, y in [(6, 17), (24, 16), (10, 20), (20, 20), (15, 13)]:
            d.rectangle((x, y, x + 1, y + 1), fill=FOAM if y < 19 else FOAM_DIM)
    return im


def wreck():
    im, d = canvas(64, 48)
    water = 40
    hull = [(6, 26), (16, 27), (44, 33), (52, 42), (12, 44), (5, 35)]
    fill_shape(im, hull, bands(DARK_HULL3, 26, 44, .35, .8, seams={33, 37}))
    d.line((15, 28, 43, 34), fill=TRIM)
    for x in (20, 29, 38):   # broken ribs standing out of the sprung planks
        d.line((x, 29 + (x - 18) // 5, x + 1, 22 + (x - 18) // 5), fill=INK)
        d.line((x + 1, 29 + (x - 18) // 5, x + 2, 23 + (x - 18) // 5), fill=WOOD3[0])
    d.line((24, 31, 42, 13), fill=INK); d.line((25, 31, 43, 13), fill=WOOD3[0]); d.line((26, 31, 43, 14), fill=INK)
    poly(d, [(42, 12), (45, 10), (44, 14)], WOOD3[0], INK)  # snapped top
    sail(im, [(35, 18), (47, 22), (45, 32), (40, 28), (35, 31)], SAIL3, holes=[(41, 23, 2, 2)])
    poly(d, [(8, 19), (15, 20), (14, 25), (8, 24)], FLAG, INK)  # the flag hangs limp
    d.line((7, 17, 7, 29), fill=INK); d.line((6, 17, 6, 29), fill=WOOD3[2])
    d.rectangle((46, 37, 54, 39), fill=INK); d.line((47, 38, 53, 38), fill=WOOD3[0])  # floating plank
    d.rectangle((56, 32, 62, 39), fill=INK); d.rectangle((57, 33, 61, 38), fill=WOOD3[1])  # floating barrel
    d.line((57, 34, 61, 34), fill=IRON3[2]); d.line((57, 37, 61, 37), fill=IRON3[2]); d.line((58, 33, 58, 38), fill=WOOD3[0])
    clip_below(im, water)
    wake(d, 8, 52, water, 1, 52)
    d.line((48, water + 1, 60, water + 1), fill=FOAM_DIM)
    return im


# ---------------------------------------------------------------- island defences

def stone_face(d, x0, y0, x1, y1, course=5, block=10):
    """Dressed stone: flat blocks with a lit top line and dark joints, offset every other course."""
    d.rectangle((x0, y0, x1, y1), fill=STONE3[1])
    for row, y in enumerate(range(y0, y1, course)):
        d.line((x0, y, x1, y), fill=STONE3[0])
        if y + course - 1 <= y1:
            d.line((x0, y + course - 1, x1, y + course - 1), fill=STONE3[2])
        for x in range(x0 + (row % 2) * (block // 2) + block - 1, x1, block):
            d.line((x, y, x, min(y1, y + course - 1)), fill=STONE3[2])


def moss(d, pts):
    for x, y, w in pts:
        d.rectangle((x, y - 1, x + w, y), fill=MOSS[1])
        d.line((x + 1, y - 2, x + w - 1, y - 2), fill=MOSS[0])


def merlons(d, xs, top, bottom, w=6, cap=None):
    for x in xs:
        d.rectangle((x, top, x + w - 1, bottom), fill=INK)
        d.rectangle((x + 1, top + 1, x + w - 2, bottom), fill=STONE3[1])
        d.line((x + 1, top + 1, x + w - 2, top + 1), fill=STONE3[0])
        d.line((x + w - 2, top + 2, x + w - 2, bottom), fill=STONE3[2])
        if cap:
            d.rectangle((x, top, x + w - 1, top + 1), fill=INK)
            d.line((x + 1, top + 1, x + w - 2, top + 1), fill=cap)


def iron_band(d, x0, x1, y, rivet=IRON3[0], band=IRON3, step=6):
    d.rectangle((x0, y, x1, y + 2), fill=INK)
    d.line((x0 + 1, y + 1, x1 - 1, y + 1), fill=band[1])
    for x in range(x0 + 3, x1 - 1, step):
        d.point((x, y + 1), fill=rivet)


def wall(state=0, level=1):
    """Stone sea wall on the 3/4 grid. state 0 intact, 1 damaged, 2 broken; level 2 and 3 add iron and brass."""
    im, d = canvas(48, 48)
    shadow(d, 24, 42, 22, 4)
    if state == 2:
        for x0, x1 in [(3, 15), (33, 45)]:
            poly(d, [(x0, 30), (x0 + 4, 27), (x1 - 3, 29), (x1, 32), (x1, 42), (x0, 42)], STONE3[1], INK)
            d.line((x0 + 1, 31, x1 - 4, 30), fill=STONE3[0])
            d.line((x0 + 1, 36, x1 - 1, 36), fill=STONE3[2])
            d.line((x0 + 6, 37, x0 + 6, 41), fill=STONE3[2])
        poly(d, [(14, 42), (18, 36), (24, 34), (30, 37), (34, 42)], STONE3[2], INK)
        for x, y in [(18, 37), (24, 35), (27, 38)]:
            d.rectangle((x, y, x + 3, y + 2), fill=INK); d.rectangle((x + 1, y + 1, x + 2, y + 1), fill=STONE3[0])
        for x, y in [(6, 43), (39, 43)]:
            d.rectangle((x, y, x + 3, y + 2), fill=INK); d.line((x + 1, y + 1, x + 2, y + 1), fill=STONE3[1])
        moss(d, [(4, 42, 4), (40, 42, 3)])
        return im
    top = {1: 18, 2: 16, 3: 14}[level]
    d.rectangle((3, top, 45, 42), fill=INK)
    d.rectangle((4, top + 1, 44, top + 5), fill=STONE3[0])          # walkway
    d.line((4, top + 5, 44, top + 5), fill=STONE3[2])
    stone_face(d, 4, top + 6, 43, 41, 5, 10 if level < 3 else 8)
    d.line((44, top + 6, 44, 41), fill=STONE3[2])
    m_top = top - 6
    if level == 1:
        merlons(d, range(4, 44, 10), m_top, top)
    elif level == 2:
        merlons(d, range(4, 44, 10), m_top - 1, top, cap=IRON3[0])
        iron_band(d, 3, 45, top + 13)
        iron_band(d, 3, 45, top + 21)
    else:
        merlons(d, range(3, 45, 9), m_top - 2, top, w=7, cap=IRON3[0])
        for x in range(3, 45, 9):  # iron shields with brass bosses on every merlon
            d.rectangle((x + 2, m_top + 1, x + 4, m_top + 4), fill=IRON3[1])
            d.point((x + 3, m_top + 2), fill=BRASS3[0])
        iron_band(d, 3, 45, top + 11, rivet=BRASS3[0], band=BRASS3)
        iron_band(d, 3, 45, top + 22, rivet=BRASS3[0])
        for x in (12, 34):  # arrow slits
            d.rectangle((x, top + 15, x + 1, top + 19), fill=INK)
        d.rectangle((20, top + 13, 27, 41), fill=INK)  # central buttress
        d.rectangle((21, top + 14, 26, 41), fill=STONE3[1])
        d.line((21, top + 14, 21, 41), fill=STONE3[0]); d.line((26, top + 14, 26, 41), fill=STONE3[2])
        d.line((46, 2, 46, m_top), fill=INK)
        poly(d, [(46, 2), (40, 3), (40, 6), (46, 7)], '#56644a', INK)  # island pennant
    moss(d, [(5, 42, 5), (30, 42, 4)])
    if state == 1:
        d.rectangle((24, m_top - 3, 35, top), fill=CLEAR)
        d.rectangle((24, top, 35, top + 1), fill=INK)
        poly(d, [(24, top + 1), (28, top - 1), (31, top + 1), (35, top - 1), (35, top + 2), (24, top + 2)], STONE3[2], INK)
        d.line((29, top + 3, 27, top + 9), fill=INK); d.line((27, top + 9, 30, top + 14), fill=INK)
        d.line((30, top + 14, 28, top + 19), fill=INK)
        d.ellipse((8, top + 9, 15, top + 14), fill='#55574b')  # scorch mark
        for x, y in [(36, 43), (8, 43)]:
            d.rectangle((x, y, x + 3, y + 2), fill=INK); d.line((x + 1, y + 1, x + 2, y + 1), fill=STONE3[1])
    return im


def wheel(d, x, y, r=4, rim=None):
    d.ellipse((x - r, y - r, x + r, y + r), fill=INK)
    d.ellipse((x - r + 1, y - r + 1, x + r - 1, y + r - 1), fill=WOOD3[1])
    if rim:
        d.ellipse((x - r + 1, y - r + 1, x + r - 1, y + r - 1), outline=rim)
    d.line((x - r + 2, y, x + r - 2, y), fill=WOOD3[2]); d.line((x, y - r + 2, x, y + r - 2), fill=WOOD3[2])
    d.rectangle((x, y, x, y), fill=IRON3[0])


def barrel(im, d, x0, y0, x1, y1, thick, tones, band, bands_at):
    """A cannon barrel from breech (x0, y0) to muzzle (x1, y1) along its top line, three flat shades."""
    slope = (y1 - y0) / (x1 - x0)
    top = lambda x: y0 + (x - x0) * slope
    pts = [(x0, y0), (x1, y1), (x1, y1 + thick - 1), (x0, y0 + thick + 1)]
    def pick(x, y, u, v):
        t = (y - top(x)) / max(1, thick + 1 - u * 2)
        return tones[0] if t < .34 else tones[1] if t < .75 else tones[2]
    fill_shape(im, pts, pick)
    for bx in bands_at:
        yt = round(top(bx))
        d.rectangle((bx, yt - 1, bx + 1, yt + thick + 1 - round(2 * (bx - x0) / (x1 - x0))), fill=band)
        d.line((bx, yt - 1, bx + 1, yt - 1), fill=INK)
    d.rectangle((x1 - 1, y1 - 2, x1 + 2, y1 + thick), fill=INK)        # muzzle swell
    d.rectangle((x1, y1 - 1, x1 + 1, y1 + thick - 1), fill=tones[1])
    d.line((x1, y1 - 1, x1 + 1, y1 - 1), fill=tones[0])
    d.ellipse((x0 - 5, y0 + thick // 2 - 2, x0, y0 + thick // 2 + 3), fill=INK)  # cascabel
    d.rectangle((x0 - 3, y0 + thick // 2, x0 - 2, y0 + thick // 2 + 1), fill=tones[0])


def puff(d, x, y, r, tones=SMOKE4):
    d.ellipse((x - r, y - r, x + r, y + r), fill=tones[3])
    d.ellipse((x - r + 1, y - r + 1, x + r - 1, y + r - 1), fill=tones[2])
    d.ellipse((x - r + 1, y - r + 1, x + r - 2, y + r - 2), fill=tones[1])
    if r > 2:
        d.ellipse((x - r + 2, y - r + 2, x, y), fill=tones[0])


def flash(d, x, y, big=True):
    """A muzzle flash pointing right: gold rays round a pale core (a light, so gold is allowed)."""
    d.ellipse((x, y - 3, x + 7, y + 4), fill=GOLD)
    for ray in [(x + 6, y, x + 10, y), (x + 5, y - 3, x + 8, y - 6), (x + 5, y + 3, x + 8, y + 6), (x + 3, y - 4, x + 3, y - 6), (x + 3, y + 4, x + 3, y + 6)]:
        d.line(ray, fill=GOLD)
    d.rectangle((x + 2, y - 1, x + 5, y + 1), fill=GOLD_LIT)


def cannon(fire=False, level=1):
    im, d = canvas(48, 32)
    shadow(d, 22, 27, 17, 3)
    k = 2 if fire else 0
    if level >= 2:  # a dressed stone slab under the gun
        d.rectangle((3, 23, 40, 28), fill=INK)
        d.rectangle((4, 24, 39, 27), fill=STONE3[1]); d.line((4, 24, 39, 24), fill=STONE3[0])
        for x in (13, 26):
            d.line((x, 25, x, 27), fill=STONE3[2])
        if level == 3:
            d.line((4, 26, 39, 26), fill=IRON3[1]); d.point((8, 26), fill=BRASS3[0]); d.point((32, 26), fill=BRASS3[0])
    base = 0 if level == 1 else -2
    poly(d, [(8 - k, 18 + base), (31 - k, 16 + base), (31 - k, 22 + base), (8 - k, 24 + base)], WOOD3[1], INK)
    d.line((9 - k, 19 + base, 30 - k, 17 + base), fill=WOOD3[0])
    d.line((9 - k, 22 + base, 30 - k, 21 + base), fill=WOOD3[2])
    for wx in (12, 25):
        wheel(d, wx - k, 23 + base, 4, IRON3[1] if level == 3 else None)
    thick = {1: 5, 2: 6, 3: 7}[level]
    tones = IRON3
    band = IRON3[2] if level == 1 else BRASS3[1]
    barrel(im, d, 7 - k, 13 - thick // 2 + base, 35 - k + level, 8 - thick // 2 + base, thick, tones, band,
           [13 - k, 22 - k, 29 - k] if level > 1 else [15 - k, 27 - k])
    if level == 3:  # a pyramid of shot beside the gun
        for x, y in [(38, 22), (42, 22), (40, 19)]:
            d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=INK); d.rectangle((x - 1, y - 1, x, y), fill=IRON3[1])
    if fire:
        flash(d, 38 + level - 1, 8 - thick // 2 + base + thick // 2)
        puff(d, 30, 4, 3); puff(d, 24, 6, 2)
    return im


def mortar(fire=False, level=1):
    """A squat bronze mortar on a stone base, tipped toward the sky; level 2 iron-bound, level 3 brass-banded."""
    import math
    im, d = canvas(48, 32)
    shadow(d, 24, 28, 18, 3)
    d.rectangle((9, 20, 39, 28), fill=INK)                       # stone base: lit top, block face
    d.rectangle((10, 21, 38, 22), fill=STONE3[0])
    stone_face(d, 10, 23, 38, 27, 3, 7)
    if level >= 2:
        for x in (9, 36):
            d.rectangle((x, 20, x + 3, 28), fill=INK); d.rectangle((x + 1, 21, x + 2, 27), fill=IRON3[1])
            d.point((x + 1, 21), fill=IRON3[0])
    if level == 3:
        iron_band(d, 12, 35, 24, rivet=BRASS3[0])
    d.rectangle((13, 16, 35, 20), fill=INK)                      # timber bed
    d.rectangle((14, 17, 34, 19), fill=WOOD3[1]); d.line((14, 17, 34, 17), fill=WOOD3[0])
    d.line((24, 17, 24, 19), fill=WOOD3[2])
    w, L = 6 + (level == 3), 9.0 + level
    A, (ax, ay) = (22.0, 16.0), (.55, -.835)
    nx, ny = -ay, ax                                              # perpendicular, pointing down-right
    P = lambda s, t: (round(A[0] + ax * s + nx * t), round(A[1] + ay * s + ny * t))
    body = [P(0, -w - 1), P(L, -w), P(L, w), P(0, w + 1), P(-3, w - 1), P(-5, 0), P(-3, -w + 1)]
    def pick(x, y, u, v):
        t = (x - A[0]) * nx + (y - A[1]) * ny
        return BRONZE3[0] if t < -w / 3 else BRONZE3[1] if t < w / 2.5 else BRONZE3[2]
    fill_shape(im, body, pick)
    bandc = BRONZE3[2] if level == 1 else IRON3[1] if level == 2 else BRASS3[0]
    for s_ in ([L * .45] if level == 1 else [L * .3, L * .7]) + ([L * .9] if level == 3 else []):
        d.line(P(s_, -w) + P(s_, w), fill=INK)
        d.line(P(s_ + 1, -w + 1) + P(s_ + 1, w - 1), fill=bandc)
    ring = [P(L + 2.4 * math.sin(k * math.pi / 8), (w + 1) * math.cos(k * math.pi / 8)) for k in range(16)]
    poly(d, ring, BRONZE3[0], INK)                                # lip of the muzzle
    hole = [P(L + 1.2 * math.sin(k * math.pi / 8), (w - 1) * math.cos(k * math.pi / 8)) for k in range(16)]
    poly(d, hole, '#1d1610')
    tx, ty = P(L * .35, w + 1)
    d.ellipse((tx - 2, ty - 2, tx + 2, ty + 2), fill=INK); d.rectangle((tx - 1, ty - 1, tx, ty), fill=BRONZE3[1])  # trunnion
    for x, y in [(41, 25)] + ([(45, 25), (43, 22)] if level >= 2 else []):   # shells waiting by the base
        d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=INK); d.rectangle((x - 1, y - 1, x, y), fill=IRON3[0])
    if fire:
        mx, my = P(L + 3, 0)
        d.ellipse((mx - 4, my - 5, mx + 4, my + 3), fill=GOLD)
        d.rectangle((mx - 2, my - 3, mx + 1, my), fill=GOLD_LIT)
        for dx, dy in [(0, -7), (5, -5), (-5, -4), (6, 0)]:
            d.line((mx, my - 1, mx + dx, my - 1 + dy), fill=GOLD)
        puff(d, 12, 8, 3); puff(d, 40, 10, 3)
    return im


def watchtower():
    im, d = canvas(64, 128)
    shadow(d, 32, 121, 24, 5)
    for x0, x1 in [(14, 22), (49, 41)]:  # outer legs
        d.line((x0, 120, x1, 46), fill=INK, width=4)
        d.line((x0 + (1 if x0 < 32 else -1), 119, x1, 47), fill=WOOD3[1], width=2)
        d.line((x0 + (0 if x0 < 32 else -1), 119, x1 - (1 if x0 < 32 else 0), 47), fill=WOOD3[0])
    for x0, x1 in [(24, 26), (40, 38)]:
        d.line((x0, 118, x1, 48), fill=INK, width=3); d.line((x0, 118, x1, 48), fill=WOOD3[2])
    for y in (68, 94):
        for a, b in [((19, y), (45, y - 20)), ((19, y - 20), (45, y))]:
            d.line(a + b, fill=INK, width=3); d.line(a + b, fill=WOOD3[1])
        d.rectangle((17, y - 1, 47, y + 1), fill=INK); d.line((18, y, 46, y), fill=WOOD3[0])
    d.rectangle((28, 49, 36, 120), fill=CLEAR)
    d.line((28, 49, 28, 120), fill=INK); d.line((36, 49, 36, 120), fill=INK)
    d.line((29, 49, 29, 120), fill=WOOD3[1]); d.line((35, 49, 35, 120), fill=WOOD3[2])
    for y in range(53, 120, 6):
        d.rectangle((29, y, 35, y + 1), fill=INK); d.line((30, y, 34, y), fill=WOOD3[0])
    for x in (12, 22, 40, 46):   # stone footings
        d.rectangle((x - 3, 117, x + 4, 122), fill=INK); d.rectangle((x - 2, 118, x + 3, 121), fill=STONE3[1])
        d.line((x - 2, 118, x + 3, 118), fill=STONE3[0])
    poly(d, [(6, 40), (58, 40), (58, 48), (6, 48)], WOOD3[1], INK)   # platform
    d.line((7, 41, 57, 41), fill=WOOD3[0]); d.line((7, 46, 57, 46), fill=WOOD3[2])
    for x in range(10, 56, 8):
        d.line((x, 42, x, 46), fill=WOOD3[2])
    d.rectangle((15, 23, 49, 40), fill=INK)   # hut of vertical boards
    d.rectangle((16, 24, 48, 39), fill=PLASTER3[1])
    for x in range(19, 48, 4):
        d.line((x, 24, x, 39), fill=PLASTER3[2])
    d.line((16, 24, 48, 24), fill=PLASTER3[0])
    d.rectangle((22, 28, 31, 37), fill=INK); d.rectangle((23, 29, 30, 36), fill='#324c45')
    d.line((26, 29, 26, 36), fill=INK); d.line((23, 32, 30, 32), fill=INK)
    d.rectangle((36, 28, 44, 36), fill=INK); d.rectangle((37, 29, 43, 35), fill=GLOW)  # watch lamp
    d.rectangle((38, 30, 40, 32), fill=GOLD_LIT)
    for x in range(8, 58, 6):   # railing
        d.line((x, 34, x, 40), fill=INK)
    d.rectangle((6, 33, 58, 34), fill=INK); d.line((7, 33, 57, 33), fill=WOOD3[0])
    poly(d, [(8, 25), (21, 9), (43, 9), (56, 25)], ROOF3[1], INK)   # shingled roof
    for y in range(12, 25, 3):
        inset = round(8 + (25 - y) * 13 / 16)
        d.line((inset + 1, y, 64 - inset - 1, y), fill=ROOF3[2])
        d.line((inset + 1, y - 1, (inset + 32) // 2, y - 1), fill=ROOF3[0])
    d.line((22, 10, 42, 10), fill=ROOF3[0])
    d.line((31, 1, 31, 9), fill=INK); d.line((32, 1, 32, 9), fill=WOOD3[0])
    poly(d, [(33, 1), (42, 2), (42, 6), (33, 6)], '#56644a', INK)   # island pennant (not a pirate flag)
    d.line((34, 3, 40, 3), fill='#7c8b5f')
    return im


def cottage():
    im, d = canvas(64, 64)
    shadow(d, 32, 58, 27, 4)
    d.rectangle((10, 30, 54, 56), fill=INK)
    d.rectangle((11, 31, 53, 55), fill=PLASTER3[1])
    d.rectangle((44, 31, 53, 55), fill=PLASTER3[2])
    d.line((11, 31, 43, 31), fill=PLASTER3[0])
    for x in (11, 27, 43):   # timber frame
        d.rectangle((x, 31, x + 1, 55), fill=WOOD3[2])
    d.rectangle((11, 42, 53, 43), fill=WOOD3[2])
    d.rectangle((10, 54, 54, 56), fill=STONE3[2]); d.line((10, 54, 54, 54), fill=STONE3[1])
    poly(d, [(4, 32), (16, 13), (48, 13), (60, 32), (57, 35), (7, 35)], ROOF3[1], INK)
    for y in range(17, 33, 4):
        inset = round(4 + (32 - y) * 12 / 19)
        d.line((inset + 1, y, 63 - inset - 1, y), fill=ROOF3[2])
        for x in range(inset + 4 + (y // 4 % 2) * 4, 63 - inset - 2, 8):
            d.line((x, y - 3, x, y - 1), fill=ROOF3[2])
        d.line((inset + 2, y - 3, 30, y - 3), fill=ROOF3[0])
    d.line((17, 14, 47, 14), fill=ROOF3[0])
    d.rectangle((40, 5, 47, 17), fill=INK); d.rectangle((41, 6, 46, 16), fill=STONE3[1])   # chimney
    d.line((41, 6, 46, 6), fill=STONE3[0]); d.line((41, 10, 46, 10), fill=STONE3[2]); d.line((46, 7, 46, 16), fill=STONE3[2])
    puff(d, 46, 2, 2)
    d.rectangle((16, 39, 25, 55), fill=INK); d.rectangle((17, 40, 24, 54), fill='#4b6551')   # door
    d.line((20, 40, 20, 54), fill='#3a5040'); d.line((17, 40, 24, 40), fill='#5f7d66')
    d.rectangle((22, 47, 23, 48), fill=TRIM)
    d.rectangle((31, 35, 40, 43), fill=INK); d.rectangle((32, 36, 39, 42), fill=GLOW)   # warm window
    d.line((35, 36, 35, 42), fill=INK); d.line((32, 39, 39, 39), fill=INK)
    d.rectangle((32, 36, 34, 38), fill=GOLD_LIT)
    d.rectangle((30, 44, 41, 47), fill=INK); d.rectangle((31, 45, 40, 46), fill=WOOD3[1])   # flower box
    for x, c in [(32, '#c9707a'), (35, BONE), (38, '#c9707a')]:
        d.rectangle((x, 42, x + 1, 44), fill=c)
    d.ellipse((47, 47, 55, 57), fill=INK); d.ellipse((48, 48, 54, 56), fill=WOOD3[1])   # rain barrel
    d.line((48, 50, 54, 50), fill=IRON3[2]); d.line((48, 54, 54, 54), fill=IRON3[2]); d.line((49, 49, 49, 55), fill=WOOD3[0])
    return im


def flag_trophy():
    im, d = canvas(32, 48)
    shadow(d, 11, 44, 8, 2)
    d.rectangle((6, 39, 15, 45), fill=INK); d.rectangle((7, 40, 14, 44), fill=STONE3[1])
    d.line((7, 40, 14, 40), fill=STONE3[0]); d.line((14, 41, 14, 44), fill=STONE3[2]); d.line((7, 42, 13, 42), fill=STONE3[2])
    d.rectangle((9, 3, 11, 39), fill=INK); d.line((10, 4, 10, 39), fill=WOOD3[0])
    d.ellipse((8, 0, 12, 4), fill=INK); d.rectangle((9, 1, 10, 2), fill=TRIM)
    poly(d, [(12, 5), (25, 4), (29, 8), (25, 13), (29, 18), (12, 19)], FLAG, INK)   # swallowtail
    d.line((20, 6, 20, 17), fill=FLAG_FOLD)
    d.rectangle((15, 8, 18, 10), fill=BONE)                                       # skull and bones
    d.point((15, 8), fill=FLAG); d.point((18, 8), fill=FLAG); d.point((16, 9), fill=FLAG); d.point((17, 9), fill=BONE)
    d.line((16, 11, 17, 11), fill=BONE)
    d.line((14, 13, 19, 16), fill=BONE); d.line((14, 16, 19, 13), fill=BONE)
    d.rectangle((23, 7, 24, 8), fill=CLEAR); d.rectangle((23, 7, 24, 8), fill=INK)   # shot hole
    d.line((11, 20, 13, 38), fill=ROPE)
    return im


def build_spot(glow=False):
    """A ring of light on the ground marking a free build spot; the glow frame pulses brighter."""
    im, d = canvas(32, 32)
    ring, mark = (GOLD_LIT, GOLD_LIT) if glow else (GOLD, GLOW)
    if glow:
        d.ellipse((0, 13, 31, 31), fill=(240, 202, 112, 70))
    d.ellipse((3, 15, 28, 28), fill=(240, 202, 112, 45 if glow else 30))
    d.ellipse((3, 15, 28, 28), outline=ring)
    for x0, y0, sx in [(5, 17, 1), (26, 17, -1)]:   # corner brackets
        d.line((x0, y0, x0 + 3 * sx, y0), fill=mark); d.line((x0, y0, x0, y0 + 2), fill=mark)
    for x0, y0, sx in [(5, 26, 1), (26, 26, -1)]:
        d.line((x0, y0, x0 + 3 * sx, y0), fill=mark); d.line((x0, y0, x0, y0 - 2), fill=mark)
    d.rectangle((15, 19, 16, 24), fill=mark); d.rectangle((12, 21, 19, 22), fill=mark)
    if glow:
        for x, y in [(7, 10), (24, 9), (16, 7)]:
            d.line((x - 1, y, x + 1, y), fill=GOLD_LIT); d.line((x, y - 1, x, y + 1), fill=GOLD_LIT)
    return im


# ---------------------------------------------------------------- crew and captain

def crew(role):
    """A small 16 x 24 crew figure (in a 16 x 32 tile, feet on the anchor), front view, explorer palette."""
    im, d = canvas(16, 32)
    shadow(d, 8, 29, 6, 2)
    ink = '#292d29'
    coat = {'gunner': ('#55697a', '#3b4a5a', '#2c3843'), 'carpenter': ('#a07b52', '#7e5f3f', '#5d4630'),
            'lookout': ('#5f7d58', '#476346', '#334a35')}[role]
    d.rectangle((4, 23, 7, 29), fill=ink); d.rectangle((8, 23, 11, 29), fill=ink)    # legs and boots
    d.rectangle((5, 23, 6, 26), fill='#546653'); d.rectangle((9, 23, 10, 26), fill='#546653')
    poly(d, [(3, 14), (12, 14), (13, 23), (2, 23)], coat[1], ink)                       # torso
    d.rectangle((4, 15, 5, 22), fill=coat[0]); d.line((11, 16, 11, 22), fill=coat[2])
    d.rectangle((3, 20, 12, 21), fill=ink); d.point((7, 20), fill=TRIM)                  # belt
    d.rectangle((0, 15, 2, 21), fill=ink); d.line((1, 16, 1, 20), fill=coat[0]); d.point((1, 21), fill=SKIN)  # left arm
    d.rectangle((4, 6, 11, 14), fill=ink); d.rectangle((5, 8, 10, 13), fill=SKIN)       # head
    d.line((10, 8, 10, 13), fill=SKIN_DARK)
    d.point((6, 10), fill=ink); d.point((9, 10), fill=ink); d.line((7, 12, 8, 12), fill='#9e6a48')
    if role == 'gunner':
        d.rectangle((5, 15, 10, 19), fill=BONE)                                        # striped shirt
        d.line((5, 16, 10, 16), fill=coat[1]); d.line((5, 18, 10, 18), fill=coat[1])
        d.rectangle((4, 5, 11, 8), fill=ink); d.rectangle((5, 6, 10, 7), fill=RED)      # red bandana
        d.rectangle((12, 6, 13, 8), fill=ink); d.point((12, 7), fill=RED)
        d.rectangle((13, 1, 15, 29), fill=CLEAR)                                        # the ramrod
        d.line((14, 6, 14, 28), fill=WOOD3[0]); d.line((15, 6, 15, 28), fill=ink)
        d.rectangle((13, 1, 15, 5), fill=ink); d.line((14, 2, 14, 4), fill='#6a5a48')   # sponge head
        d.rectangle((12, 15, 13, 19), fill=ink); d.point((13, 18), fill=SKIN)          # right arm on the rod
    elif role == 'carpenter':
        d.rectangle((5, 16, 10, 22), fill='#8e674c'); d.line((5, 16, 10, 16), fill='#bc9367')  # leather apron
        d.line((6, 21, 9, 21), fill=IRON3[0])
        d.rectangle((3, 4, 12, 8), fill=ink); d.rectangle((4, 5, 11, 7), fill=WOOD3[1])  # flat cap
        d.line((4, 5, 9, 5), fill=WOOD3[0]); d.line((12, 8, 13, 8), fill=ink)
        d.rectangle((12, 14, 13, 18), fill=ink); d.point((13, 17), fill=SKIN)           # arm raising the hammer
        d.line((14, 9, 14, 17), fill=WOOD3[0]); d.line((15, 9, 15, 17), fill=ink)
        d.rectangle((12, 6, 15, 9), fill=ink); d.line((13, 7, 15, 7), fill=IRON3[0])     # hammer head
    else:
        d.rectangle((5, 15, 10, 16), fill='#417c77')                                    # scarf
        poly(d, [(2, 7), (5, 3), (11, 3), (14, 7), (11, 8), (5, 8)], '#4c6549', ink)    # tricorn
        d.line((5, 4, 10, 4), fill='#77864e')
        d.rectangle((9, 8, 15, 11), fill=ink)                                           # brass spyglass to the eye
        d.line((10, 9, 15, 9), fill=BRASS3[0]); d.line((10, 10, 15, 10), fill=BRASS3[1])
        d.line((12, 9, 12, 10), fill=BRASS3[2])
        d.rectangle((11, 12, 13, 16), fill=ink); d.point((12, 12), fill=SKIN)           # arm holding it
    return im


def captain(firing=False):
    """The explorer in side view holding (1) or firing (2) a musket; body centred like the 24 x 32 explorer."""
    im, d = canvas(48, 32)
    ox = 12 - (1 if firing else 0)
    ink, skin, coat, light = '#292d29', '#d8ae78', '#b18a43', '#d0a555'
    P = lambda pts: [(x + ox, y) for x, y in pts]
    R = lambda x0, y0, x1, y1: (x0 + ox, y0, x1 + ox, y1)
    shadow(d, 12 + 12, 29, 8, 2)
    d.rectangle(R(7, 23, 10, 28), fill=ink); d.rectangle(R(14, 23, 17, 28), fill=ink)      # braced stance
    d.rectangle(R(7, 24, 9, 26), fill='#546653'); d.rectangle(R(14, 24, 16, 26), fill='#546653')
    d.rectangle(R(6, 28, 10, 29), fill='#34352a'); d.rectangle(R(14, 28, 18, 29), fill='#34352a')
    poly(d, P([(9, 14), (16, 14), (18, 24), (8, 25), (7, 19)]), coat, ink)
    d.rectangle(R(6, 16, 9, 23), fill='#40584b'); d.rectangle(R(7, 17, 8, 20), fill='#6a7d59')   # pack
    poly(d, P([(8, 6), (16, 5), (18, 9), (20, 12), (17, 14), (11, 14), (9, 11)]), skin, ink)
    d.rectangle(R(14, 9, 15, 10), fill=ink); d.point((18 + ox, 12), fill='#aa7a53')
    d.rectangle(R(8, 4, 15, 8), fill='#4e6549'); d.rectangle(R(7, 7, 19, 8), fill=ink); d.rectangle(R(9, 3, 14, 4), fill='#72804e')
    d.rectangle(R(10, 14, 16, 16), fill='#477e79'); d.rectangle(R(8, 16, 10, 19), fill='#35655f')
    lift = -1 if firing else 0
    # Musket: walnut stock at the shoulder, iron barrel to the right, a brass lock plate.
    poly(d, P([(11, 15 + lift), (20, 14 + lift), (20, 17 + lift), (14, 19 + lift), (11, 19 + lift)]), WOOD3[1], ink)
    d.line(R(12, 16 + lift, 19, 15 + lift), fill=WOOD3[0])
    d.rectangle(R(20, 13 + lift, 31, 15 + lift), fill=ink)
    d.line(R(20, 14 + lift, 31, 14 + lift), fill=IRON3[0])
    d.rectangle(R(18, 15 + lift, 19, 16 + lift), fill=BRASS3[1])
    d.rectangle(R(30, 12 + lift, 30, 12 + lift), fill=ink)                                  # front sight
    d.line(R(13, 17, 17, 18 + lift), fill=ink, width=3); d.line(R(14, 17, 17, 18 + lift), fill=light)   # trigger arm
    d.point((18 + ox, 18 + lift), fill=skin)
    d.line(R(14, 16, 22, 16 + lift), fill=ink, width=3); d.line(R(15, 16, 21, 16 + lift), fill=light)   # arm on the barrel
    d.rectangle(R(22, 15 + lift, 23, 16 + lift), fill=skin)
    if firing:
        flash(d, 32 + ox, 14 + lift)
        puff(d, 33 + ox, 9, 2)
    return im


# ---------------------------------------------------------------- effects

def smoke(frame):
    im, d = canvas(32, 32)
    if frame == 0:
        puff(d, 16, 20, 5); puff(d, 12, 23, 3); puff(d, 20, 22, 3)
    elif frame == 1:
        puff(d, 15, 16, 7); puff(d, 9, 21, 4); puff(d, 22, 20, 5); puff(d, 18, 9, 3)
    else:
        faded = ('#d6d9cf', '#b0b5ab', '#8f968e', '#6f7871')
        puff(d, 12, 12, 6, faded); puff(d, 21, 10, 5, faded); puff(d, 17, 19, 5, faded); puff(d, 8, 21, 3, faded)
        layer = im.copy(); layer.putalpha(layer.getchannel('A').point(lambda a: a * 3 // 4))
        return layer
    return im


def fire(frame):
    """Flames for a burning ship, flickering over three frames, with dark smoke above."""
    im, d = canvas(32, 32)
    dark = ('#5f6862', '#4a524d', '#3a403c', '#2c312e')
    puff(d, 13 + frame, 6, 4, dark); puff(d, 21 - frame, 9, 3, dark)
    sway = [-1, 1, 0][frame]
    tongues = [(9, [10, 15, 12][frame], 6), (17, [16, 11, 14][frame], 7), (24, [9, 12, 15][frame], 5)]
    for layer, tone in enumerate(FIRE4[::-1]):   # red outside, pale core inside
        for cx, h, r in tongues:
            r2, h2 = r - layer * 1.5, h - layer * 3
            if r2 < 1 or h2 < 3:
                continue
            base = 28 - layer
            d.ellipse((cx - r2, base - 2 * r2, cx + r2, base), fill=tone)
            poly(d, [(round(cx - r2), round(base - r2)), (cx + sway * (1 + layer // 2), base - h2 - r2 // 2), (round(cx + r2), round(base - r2))], tone)
    d.rectangle((2, 27, 29, 29), fill=INK)                          # charred timbers under the flames
    d.line((3, 28, 28, 28), fill=WOOD3[2])
    for x, y in [(5, 11 - frame), (27, 8 + frame), (20, 3 + frame * 2)]:
        d.rectangle((x, y, x + 1, y + 1), fill=FIRE4[1])
    return im


def explosion(frame):
    im, d = canvas(32, 32)
    if frame == 0:
        d.ellipse((10, 10, 21, 21), fill=GOLD)
        for ray in [(16, 3, 16, 28), (3, 16, 28, 16), (7, 7, 24, 24), (7, 24, 24, 7)]:
            d.line(ray, fill=GOLD)
        d.ellipse((12, 12, 19, 19), fill=GOLD_LIT)
    elif frame == 1:
        d.ellipse((4, 4, 27, 27), fill=FIRE4[3])
        d.ellipse((6, 6, 25, 25), fill=FIRE4[2])
        d.ellipse((9, 9, 21, 21), fill=FIRE4[1])
        d.ellipse((12, 11, 18, 17), fill=FIRE4[0])
        for x, y in [(2, 9), (28, 6), (26, 27), (4, 26)]:
            d.rectangle((x, y, x + 2, y + 1), fill=INK)
    elif frame == 2:
        for x, y, r in [(10, 12, 7), (21, 11, 7), (16, 20, 7)]:
            puff(d, x, y, r, ('#9aa098', '#6f766f', '#4f5650', '#323935'))
        for x, y in [(13, 13), (19, 17), (21, 10)]:
            d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=FIRE4[2]); d.rectangle((x - 1, y - 1, x, y), fill=FIRE4[1])
        for x0, y0, x1, y1 in [(1, 4, 4, 6), (27, 2, 30, 4), (28, 26, 30, 29), (2, 27, 5, 28)]:
            d.rectangle((x0, y0, x1, y1), fill=INK); d.line((x0 + 1, y0 + 1, x1 - 1, y0 + 1), fill=WOOD3[1])
    else:
        for x, y, r in [(9, 10, 6), (21, 9, 6), (15, 17, 7)]:
            puff(d, x, y, r)
        d.rectangle((15, 15, 16, 16), fill=FIRE4[2])
        layer = im.copy(); layer.putalpha(layer.getchannel('A').point(lambda a: a * 3 // 4))
        return layer
    return im


def musket_flash():
    im, d = canvas(16, 16)
    flash(d, 2, 8)
    return im


def mortar_shell():
    im, d = canvas(16, 16)
    d.ellipse((3, 5, 12, 14), fill=INK)
    d.ellipse((4, 6, 11, 13), fill=IRON3[1])
    d.rectangle((5, 7, 7, 8), fill=IRON3[0]); d.line((8, 12, 11, 9), fill=IRON3[2])
    d.rectangle((9, 4, 10, 5), fill=INK)                 # fuse cap
    d.line((11, 3, 12, 2), fill=WOOD3[0])
    d.rectangle((12, 0, 14, 2), fill=GOLD); d.point((13, 1), fill=GOLD_LIT)   # the burning fuse
    return im


def level_pip():
    im, d = canvas(16, 16)
    poly(d, [(8, 3), (13, 8), (8, 13), (3, 8)], BRASS3[1], INK)
    poly(d, [(8, 4), (12, 8), (8, 8), (4, 8)], BRASS3[0])
    d.line((9, 11, 11, 9), fill=BRASS3[2])
    d.rectangle((7, 6, 8, 7), fill=GOLD_LIT)
    return im


# ---------------------------------------------------------------- registry

def assets():
    out = {}
    for name, draw in [('sloop', sloop), ('brig', brig), ('flagship', flagship), ('warship', warship), ('splash', splash)]:
        for frame in range(3):
            out[f'pirate-{name}-{frame + 1}'] = draw(frame)
    out.update({
        'pirate-cannonball': cannonball(), 'pirate-wreck': wreck(),
        'island-wall': wall(0), 'island-wall-damaged': wall(1), 'island-wall-broken': wall(2),
        'island-wall-l2': wall(0, 2), 'island-wall-l3': wall(0, 3),
        'island-cannon': cannon(), 'island-cannon-fire': cannon(True),
        'island-cannon-l2': cannon(level=2), 'island-cannon-l3': cannon(level=3),
        'island-mortar': mortar(), 'island-mortar-fire': mortar(True),
        'island-mortar-l2': mortar(level=2), 'island-mortar-l3': mortar(level=3),
        'island-watchtower': watchtower(), 'island-house': cottage(), 'pirate-flag-trophy': flag_trophy(),
        'build-spot': build_spot(), 'build-spot-glow': build_spot(True),
        'crew-gunner': crew('gunner'), 'crew-carpenter': crew('carpenter'), 'crew-lookout': crew('lookout'),
        'captain-musket-1': captain(), 'captain-musket-2': captain(True),
        'fx-musket-flash': musket_flash(), 'fx-mortar-shell': mortar_shell(), 'fx-level-pip': level_pip(),
    })
    for frame in range(3):
        out[f'fx-smoke-{frame + 1}'] = smoke(frame)
        out[f'fx-fire-{frame + 1}'] = fire(frame)
    for frame in range(4):
        out[f'fx-explosion-{frame + 1}'] = explosion(frame)
    return out


def write():
    from common import save
    folder = Path(__file__).resolve().parents[2] / 'public' / 'pixel'
    sprites = assets()
    for name, image in sprites.items():
        save(image, name, folder)
    print(f'Saved {len(sprites)} pirate sprites to {folder}')


def contact_sheet(path, old=None, scale=3):
    """Every sprite on sea or grass at an integer scale; with a folder of old PNGs, each redone sprite
    is shown as 'old' then 'new' side by side."""
    from PIL import ImageDraw
    items = []
    for name, image in assets().items():
        before = Path(old) / f'{name}.png' if old else None
        if before and before.exists():
            items.append((f'old {name}', Image.open(before).convert('RGBA')))
        items.append((name, image))
    cols, cell_w, cell_h = 8, 168, 146
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell_w, rows * cell_h), '#3f716c')
    draw = ImageDraw.Draw(sheet)
    for index, (label, image) in enumerate(items):
        name = label.split(' ')[-1]
        x, y = (index % cols) * cell_w, (index // cols) * cell_h
        land = name.startswith(('island-', 'build-', 'crew-', 'captain-', 'fx-level')) or name == 'pirate-flag-trophy'
        if land:
            draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), fill='#6f8f55')
        if label.startswith('old '):
            draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), fill='#5c6b64' if not land else '#7d8a6a')
        draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), outline='#2b4a45')
        sheet.alpha_composite(image, (x + (cell_w - image.width) // 2, y + 2 + (128 - image.height)))
        draw.text((x + 3, y + cell_h - 13), label, fill='#f3ecd2')
    sheet = sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


if __name__ == '__main__':
    import sys
    if sys.argv[1:2] == ['--write']:
        write()
    else:
        contact_sheet(sys.argv[1] if len(sys.argv) > 1 else 'pirate-art.png', sys.argv[2] if len(sys.argv) > 2 else None)
