"""Small native-resolution drawing helpers. No smoothing or downloaded artwork."""
from PIL import Image, ImageDraw
from random import Random

def canvas(w, h):
    image = Image.new('RGBA', (w, h))
    return image, ImageDraw.Draw(image)

def shadow(draw, x, y, rx, ry):
    draw.ellipse((x-rx, y-ry, x+rx, y+ry), fill=(28, 45, 31, 90))

def poly(draw, points, fill, outline=None):
    draw.polygon(points, fill=fill)
    if outline:
        draw.line(points+[points[0]], fill=outline, width=1)

def save(image, name, folder):
    image.save(folder / (name+'.png'), optimize=True)
