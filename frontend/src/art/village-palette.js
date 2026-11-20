// Painted slate, oiled timber and a little sea light in the iron.
// The alpha channel, original painted shading and normalized frame stay intact.
const VILLAGE_BUILDING = /^(?:cabin|island_core(?:_(?:damaged|broken))?|island-(?:house|watchtower|bell|arsenal|techhub|harbor|cannon|mortar|harpoon|culverin|swivel)(?:-|$))/;
const HOME_LANDMARK = /^(?:(?:cabin|island_core(?:_damaged)?)$|island-(?:house|watchtower|bell|arsenal|techhub|harbor)(?:-|$))/;
const WEAPON = /^island-(?:cannon|mortar|harpoon|culverin|swivel)(?:-|$)/;
const unit = value => Math.max(0, Math.min(value, 1));
const lumaOf = (red, green, blue) => (red * 53 + green * 184 + blue * 19) / 256;
const bend = value => {
  const t = unit(value);
  return t * t * (3 - 2 * t);
};

function paintPalette(pixels, weapon) {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
    const luma = lumaOf(red, green, blue);
    const glaze = unit((blue - red - 4) / 44) * unit((blue - green + 5) / 33);
    const timber = unit((red - blue - 19) / 72) * unit((red - green + 7) / 55);
    const timberLight = unit((luma - 23) / 72) * unit((245 - luma) / 83);
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const metal = 1 - unit((chroma - 2) / 35);
    const reflected = metal * unit((149 - luma) / 112) * unit((luma - 7) / 30);
    // Keep the cast barrels distinct from the warm carriage and the limestone below.
    const position = weapon ? i / pixels.length : 0;
    const barrel = weapon ? 1 - bend((position - .50) / .24) : 0;
    const steel = barrel * (1 - bend((chroma - 5) / 49)) * bend((luma - 18) / 41) * bend((210 - luma) / 72);
    const edge = steel * bend((luma - 89) / 83);
    const barrelShade = steel * (1 - bend((luma - 49) / 94));
    // The bright curl is the turning edge of the cylinder. Leave its belly matte and cool.
    pixels[i] = red - 2 * glaze + 13 * timber * timberLight - 3 * reflected - 13 * steel + 18 * edge - 9 * barrelShade;
    pixels[i + 1] = green + 12 * glaze + 7 * timber * timberLight + 3 * reflected + 6 * steel + 15 * edge - 12 * barrelShade;
    pixels[i + 2] = blue + 17 * glaze - 4 * timber * timberLight + 7 * reflected + 27 * steel + 10 * edge - 14 * barrelShade;
  }
}

function surfaceSamples(pixels, width, height) {
  const tones = new Uint8Array(width * height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0, p = 0; y < height; y++) {
    for (let x = 0; x < width; x++, p++) {
      const i = p * 4;
      if (pixels[i + 3] < 200) continue;
      tones[p] = lumaOf(pixels[i], pixels[i + 1], pixels[i + 2]);
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return {tones, minX, minY, spanX: maxX - minX, spanY: maxY - minY};
}

function lightLandmark(pixels, width, height, heart) {
  const {tones, minX, minY, spanX, spanY} = surfaceSamples(pixels, width, height);
  // A broader sample keeps the painted bevels visible after the sprite is scaled to the island.
  const step = Math.max(1, Math.round(height / 74));
  if (spanX < step * 2 || spanY < step * 2) return;
  for (let y = minY; y <= minY + spanY; y++) {
    const down = (y - minY) / spanY;
    for (let x = minX, p = y * width + minX; x <= minX + spanX; x++, p++) {
      const i = p * 4, alpha = pixels[i + 3];
      if (alpha < 224) continue;
      const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
      const right = (x - minX) / spanX, luma = tones[p];
      const roof = bend((blue - red - 10) / 40) * bend((blue - green + 5) / 32);
      const amberGlass = bend((red - 174) / 60) * bend((red - blue - 54) / 80);
      const plant = bend((green - red + 3) / 30) * bend((green - blue - 3) / 32);
      const coverage = bend((alpha - 223) / 32) * (1 - amberGlass) * (1 - plant);
      if (coverage <= 0) continue;
      const stone = (1 - roof) * bend((luma - 43) / 99)
        * bend((blue - red + 93) / 60) * bend((green - red + 50) / 35);
      const varnish = bend((red - green - 13) / 35) * bend((green - blue - 6) / 39)
        * bend((luma - 34) / 76) * (1 - stone);

      // A distinct warm left face and navy lee face give the roof readable volume in Fit.
      const key = bend((1.00 - .73 * right - .96 * down) / .73);
      const shade = bend((.41 * right + .71 * down - .36) / .65);
      const sunwardRoof = 1 - bend((right - .37) / .25);
      const leeRoof = bend((right - .48) / .36);
      const eave = bend((down - .21) / .32) * bend((.88 - down) / .23);
      // Follow the painted opening on both healthy and cracked Heart frames.
      // This runs on the opaque posts and arch only, so people are still visible through the entry.
      const arch = heart ? Math.hypot((right - .50) / .20, Math.min(0, down - .75) / .16) : 0;
      const reveal = heart ? (1 - bend(Math.abs(arch - 1) / .56)) * bend((.85 - down) / .12) : 0;
      const fromSun = p - step * (width + 1), awayFromSun = p + step * (width + 1);
      const samplesInside = x >= step && x + step < width && y >= step && y + step < height
        && pixels[fromSun * 4 + 3] > 224 && pixels[awayFromSun * 4 + 3] > 224;
      const relief = samplesInside ? (tones[awayFromSun] - tones[fromSun]) / 255 : 0;
      // Keep the hand-painted grain and joints legible when the sprite is minified.
      const grain = samplesInside ? (2 * luma - tones[fromSun] - tones[awayFromSun]) / 510 : 0;
      const edge = relief * (.93 * roof + .70 * stone + .47 * varnish);
      const texture = grain * (.54 * roof + .74 * stone + .53 * varnish);
      const tileLight = .23 * sunwardRoof - .30 * leeRoof - .10 * shade;
      const recess = varnish * eave * (1 - bend((luma - 57) / 104));
      const faceLight = (.18 - .12 * roof) * key - (.13 + .089 * stone) * shade - .32 * recess - .42 * reveal * varnish;
      const exposure = 1 + coverage * (roof * tileLight + faceLight + edge + texture);
      const plaster = key * stone;
      const slate = roof * sunwardRoof * (.65 + .35 * bend((luma - 39) / 117));
      const amber = varnish * bend((red - green - 26) / 51);
      const timberRim = varnish * key * bend((luma - 92) / 92);
      pixels[i] = red * exposure + coverage * (7 * key + 19 * plaster + 19 * slate + 12 * timberRim - 4 * shade - 7 * amber);
      pixels[i + 1] = green * exposure + coverage * (4 * key + 14 * plaster + 17 * slate + 6 * timberRim + 3 * shade + 6 * amber);
      pixels[i + 2] = blue * exposure + coverage * (8 * plaster + 9 * slate + 8 * roof * leeRoof + 9 * shade + 16 * amber);
    }
  }
}

// World sprites, the defense atlas and building cards all pass through the same prepared frames.
export function applyVillagePalette(id, canvas) {
  if (!VILLAGE_BUILDING.test(id)) return;
  const context = canvas.getContext('2d');
  if (!context.getImageData || !context.putImageData) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  paintPalette(image.data, WEAPON.test(id) && !id.endsWith('-broken'));
  if (HOME_LANDMARK.test(id)) lightLandmark(image.data, canvas.width, canvas.height, id.startsWith('island_core'));
  context.putImageData(image, 0, 0);
}
