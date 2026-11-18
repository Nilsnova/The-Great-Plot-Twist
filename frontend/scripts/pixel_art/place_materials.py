"""Lay the original village materials into the existing regional ground colors."""
from PIL import Image, ImageChops

REGIONAL_MATERIALS = {
    'lighthouse_isle': ('sand', .46),
    'saltreach_harbor': ('path', .54),
    'smugglers_cove': ('sand', .50),
    'wreck_point': ('sand', .50),
    'the_teeth': ('sand', .36),
}
# Source rectangles and world periods match src/art/village/terrain-materials.js.
TILES = {
    'grass': ((1, 1, 626, 626), (128, 92), True),
    'path': ((628, 1, 1253, 626), (88, 63), False),
    'sand': ((628, 628, 1253, 1253), (128, 92), True),
}


def tile_surface(atlas, name, canvas_size):
    crop, period, mirror = TILES[name]
    width, height = period
    tile = atlas.crop(crop).resize(period, Image.Resampling.LANCZOS)
    flipped_x = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    flipped_y = tile.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    flipped_both = tile.transpose(Image.Transpose.ROTATE_180)
    tiles = ((tile, flipped_x), (flipped_y, flipped_both))
    surface = Image.new('RGB', canvas_size)
    for row, y in enumerate(range(0, surface.height, height)):
        for column, x in enumerate(range(0, surface.width, width)):
            surface.paste(tiles[row % 2][column % 2] if mirror else tile, (x, y))
    return surface


def color_mask(image, colors):
    return Image.frombytes('L', image.size, bytes(255 if pixel in colors else 0 for pixel in image.getdata()))


def paint_region(image, root, place, palette, additions=None):
    path_material, grass_strength = REGIONAL_MATERIALS[place]
    with Image.open(root / 'public' / 'village' / 'terrain-materials-v1.png') as source:
        atlas = source.convert('RGB')
    base = image.convert('RGB')
    output = base.copy()
    extra_base = additions.convert('RGB') if additions else None
    for name, material, strength in (
        ('grass', 'grass', grass_strength), ('path', path_material, .55), ('sand', 'sand', .52),
    ):
        colors = set(palette[name])
        mask = color_mask(image, colors)
        texture = tile_surface(atlas, material, base.size)
        # Limit palette size per surface so the old regions still ship as small PNGs.
        styled = Image.blend(base, texture, strength).quantize(colors=72, dither=Image.Dither.NONE)
        output.paste(styled.convert('RGB'), mask=mask)
        if extra_base:
            # Use the established color palette without changing existing regional pixels.
            extra = Image.blend(extra_base, texture, strength).quantize(palette=styled, dither=Image.Dither.NONE)
            output.paste(extra.convert('RGB'), mask=color_mask(additions, colors))
    alpha = image.getchannel('A')
    if additions:
        alpha = ImageChops.lighter(alpha, additions.getchannel('A'))
    output.putalpha(alpha)
    return index_region(output)


def index_region(image):
    """Store the baked palette without changing any of its RGBA pixels."""
    colors = sorted(color for _, color in image.getcolors(256))
    indices = {color: index for index, color in enumerate(colors)}
    indexed = Image.frombytes('P', image.size, bytes(indices[pixel] for pixel in image.getdata()))
    indexed.putpalette([channel for color in colors for channel in color[:3]])
    indexed.info['transparency'] = bytes(color[3] for color in colors)
    return indexed
