// Grade the existing wall artwork with the village's warm daylight. Atlas size,
// source colour details, alpha and the renderer's placement and joins stay in the existing data.
const WALL_FRAME = /^(?:village-wall-(front|side|top)-l([1-5])|island-wall(?:-l([1-5]))?(?:-damaged)?)$/;
const clamp = value => Math.max(0, Math.min(value, 1));
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export function applyWallMaterials(id, canvas) {
  const match = WALL_FRAME.exec(id);
  if (!match) return;
  const [, face, surfaceTier, postTier] = match;
  const tier = Number(surfaceTier ?? postTier ?? 1);
  const context = canvas.getContext('2d');
  if (!context.getImageData || !context.putImageData) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const surface = Boolean(face), horizontal = face === 'top';
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
    const luma = (red * 54 + green * 183 + blue * 19) / 256;
    const warm = smooth((red - green - 6) / 48) * smooth((green - blue - 8) / 44);
    const light = smooth((luma - 125) / 83);
    if (tier === 1) {
      // Cut oak retains warm grain and lighter tips, with red-brown sides like the dock timbers.
      const timber = (surface ? 1 : .86) * warm;
      const grain = 1 - timber * (.26 - .11 * light);
      pixels[i] = red * grain - 9 * timber;
      pixels[i + 1] = green * grain + 2 * timber;
      pixels[i + 2] = blue * grain + 9 * timber;
      continue;
    }

    if (tier >= 4) {
      // Brass rims still catch sun. Age and dull the broad caps while retaining the heraldry on posts.
      const brass = (horizontal ? .90 : surface ? .60 : .47) * warm
        * smooth((luma - 91) / 73) * smooth((red - blue - 57) / 73);
      pixels[i] -= brass * (44 - 14 * light);
      pixels[i + 1] -= brass * (24 - 9 * light);
      pixels[i + 2] += brass * (21 + 12 * light);
    }

    if (tier === 2 || tier === 3) {
      // Bring pink highlights into the same pale limestone as the gun and house plinths.
      // The luma of the source still carries mortar, damage, and the individual joints.
      const stone = (surface ? .44 : .31) * smooth((luma - 38) / 84) * (1 - warm * .5);
      pixels[i] += stone * (luma + 7 - red);
      pixels[i + 1] += stone * (luma + 4 - green);
      pixels[i + 2] += stone * (luma - 4 - blue);
    }

    if (surface && (tier < 4 || !horizontal)) {
      // Cobalt in the highest course belongs to the pennants. Ash-blue stone bonds to the corner posts.
      const dye = tier === 5 ? .64 * smooth((blue - red - 5) / 50) : 0;
      const where = i / pixels.length;
      const toe = horizontal ? 0 : smooth((where - .56) / .37);
      const mortar = smooth((91 - luma) / 62);
      const depth = 1.03 + .12 * light - .11 * toe - .16 * mortar;
      pixels[i] = (pixels[i] + dye * (luma + 8 - red)) * depth + light * 4;
      pixels[i + 1] = (pixels[i + 1] + dye * (luma + 5 - green)) * depth;
      pixels[i + 2] = (pixels[i + 2] + dye * (luma + 12 - blue)) * depth + toe * 3;
    }
  }
  context.putImageData(image, 0, 0);
}
