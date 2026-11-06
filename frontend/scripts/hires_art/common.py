"""Original high-density drawing primitives; all coordinates use unchanged logical pixels."""

from random import Random

from PIL import Image, ImageColor, ImageDraw

DENSITY = 4


def rgb(color):
    return ImageColor.getrgb(color) if isinstance(color, str) else color


def blend(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(rgb(a)[:3], rgb(b)[:3], strict=True))


class Paint:
    def __init__(self, w, h):
        self.image = Image.new("RGBA", (w * DENSITY, h * DENSITY))
        self.d = ImageDraw.Draw(self.image)

    def points(self, values):
        return [(round(x * DENSITY), round(y * DENSITY)) for x, y in values]

    def box(self, values):
        return tuple(round(v * DENSITY) for v in values)

    def rect(self, box, fill, outline=None, width=0.4):
        self.d.rectangle(
            self.box(box), fill=fill, outline=outline, width=max(1, round(width * DENSITY))
        )

    def ellipse(self, box, fill, outline=None, width=0.4):
        self.d.ellipse(
            self.box(box), fill=fill, outline=outline, width=max(1, round(width * DENSITY))
        )

    def line(self, points, fill, width=0.4):
        self.d.line(
            self.points(points), fill=fill, width=max(1, round(width * DENSITY)), joint="curve"
        )

    def poly(self, points, fill, outline=None, width=0.5):
        values = self.points(points)
        if fill is not None:
            self.d.polygon(values, fill=fill)
        if outline:
            self.d.line(
                values + [values[0]],
                fill=outline,
                width=max(1, round(width * DENSITY)),
                joint="curve",
            )

    def gradient(self, points, top, bottom):
        mask = Image.new("L", self.image.size)
        md = ImageDraw.Draw(mask)
        values = self.points(points)
        md.polygon(values, fill=255)
        layer = Image.new("RGBA", self.image.size)
        ld = ImageDraw.Draw(layer)
        y0, y1 = min(y for _, y in values), max(y for _, y in values)
        for y in range(y0, y1 + 1):
            ld.line((0, y, layer.width, y), fill=blend(top, bottom, (y - y0) / max(1, y1 - y0)))
        self.image.alpha_composite(Image.composite(layer, Image.new("RGBA", layer.size), mask))
        self.d = ImageDraw.Draw(self.image)

    def shadow(self, x, y, rx, ry):
        for n in range(8, 0, -1):
            k = n / 8
            self.ellipse(
                (x - rx * k, y - ry * k, x + rx * k, y + ry * k),
                (17, 34, 32, round(10 + 36 * (1 - k))),
            )

    def grain(self, box, seed, base="#a68c60", count=120, vertical=False):
        rng = Random(seed)
        x0, y0, x1, y1 = box
        for _ in range(count):
            x = rng.uniform(x0, x1)
            y = rng.uniform(y0, y1)
            length = rng.uniform(0.5, 3)
            end = (x, min(y1, y + length)) if vertical else (min(x1, x + length), y)
            self.line([(x, y), end], base, rng.choice([0.25, 0.25, 0.5]))

    def save(self, path):
        self.image.save(path, optimize=True)
