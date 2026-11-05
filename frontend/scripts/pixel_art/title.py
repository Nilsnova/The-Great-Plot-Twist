"""A quiet title scene composed from our own native sprites. Used before WebGL loads."""
from PIL import Image, ImageDraw


def title_scene(assets, terrain):
    image = Image.new('RGBA', (480, 300), '#3d7371')
    image.alpha_composite(terrain, (-256, -300))
    draw = ImageDraw.Draw(image)
    for row in range(15):
        for col in range(17):
            x = col * 31 + row % 3 * 7
            y = row * 23 + 8
            if image.getpixel((min(x, 479), min(y, 299)))[:3] == (61, 115, 113):
                draw.line((x, y, x + 9, y), fill='#87aaa0')
    placements = [
        ('pine', 36, 73), ('birch', 104, 62), ('oak', 177, 52),
        ('oak', 318, 62), ('pine', 431, 83), ('birch', 468, 107),
        ('cottage', 87, 229), ('lighthouse', 402, 252),
        ('oak', 23, 202), ('pine', 42, 265), ('birch', 463, 257),
        ('rock', 352, 279), ('flowers', 72, 259), ('shrub', 118, 274),
        ('grass-tuft', 358, 238), ('flowers', 426, 277),
    ]
    for name, x, feet in sorted(placements, key=lambda item: item[2]):
        sprite = assets[name]
        image.alpha_composite(sprite, (x - sprite.width // 2, feet - sprite.height + 8))
    return image
