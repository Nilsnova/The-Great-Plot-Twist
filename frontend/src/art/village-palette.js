// Glazed blue roofs, honey-toned timber and a little sea light in the iron.
// The alpha channel, original painted shading and normalized frame stay intact.
const VILLAGE_BUILDING = /^(?:cabin|island_core(?:_(?:damaged|broken))?|island-(?:house|watchtower|bell|arsenal|techhub|harbor|cannon|mortar|harpoon|culverin|swivel)(?:-|$))/;
const HOME_LANDMARK = /^(?:(?:cabin|island_core(?:_damaged)?)$|island-(?:house|watchtower|bell|arsenal|techhub|harbor)(?:-|$))/;
const unit = value => Math.max(0, Math.min(value, 1));
const lumaOf = (red, green, blue) => (red * 53 + green * 184 + blue * 19) / 256;
const bend = value => {
  const t = unit(value);
  return t * t * (3 - 2 * t);
};

function paintPalette(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
    const luma = lumaOf(red, green, blue);
    const glaze = unit((blue - red - 4) / 44) * unit((blue - green + 5) / 33);
    const timber = unit((red - blue - 19) / 72) * unit((red - green + 7) / 55);
    const timberLight = unit((luma - 23) / 72) * unit((245 - luma) / 83);
    const metal = 1 - unit((Math.max(red, green, blue) - Math.min(red, green, blue) - 2) / 35);
    const reflected = metal * unit((149 - luma) / 112) * unit((luma - 7) / 30);
    pixels[i] = red - 2 * glaze + 13 * timber * timberLight - 3 * reflected;
    pixels[i + 1] = green + 12 * glaze + 7 * timber * timberLight + 3 * reflected;
    pixels[i + 2] = blue + 17 * glaze - 4 * timber * timberLight + 7 * reflected;
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

function lightLandmark(pixels, width, height) {
  const {tones, minX, minY, spanX, spanY} = surfaceSamples(pixels, width, height);
  // A roof gets more useful detail from a bevel a logical pixel away than from individual texels.
  const step = Math.max(1, Math.round(height / 110));
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

      // The upper-left key travels across roof faces, with cool skylight below the eaves.
      const key = bend((1.00 - .73 * right - .96 * down) / .73);
      const sky = bend((1.14 - .87 * right - .73 * down) / .78);
      const shade = bend((.41 * right + .71 * down - .36) / .65);
      const fromSun = p - step * (width + 1), awayFromSun = p + step * (width + 1);
      const samplesInside = x >= step && x + step < width && y >= step && y + step < height
        && pixels[fromSun * 4 + 3] > 224 && pixels[awayFromSun * 4 + 3] > 224;
      const relief = samplesInside ? (tones[awayFromSun] - tones[fromSun]) / 255 : 0;
      const tileLight = .30 * sky + .10 * bend((luma - 39) / 132) + .55 * relief;
      const faceLight = (.19 - .13 * roof) * key - .16 * shade;
      const exposure = 1 + coverage * (roof * tileLight + faceLight);
      pixels[i] = red * exposure + coverage * (7 * key + 13 * sky * roof - 5 * shade);
      pixels[i + 1] = green * exposure + coverage * (4 * key + 10 * sky * roof + 2 * shade);
      pixels[i + 2] = blue * exposure + coverage * (7 * sky * roof + 9 * shade);
    }
  }
}

// World sprites, the defense atlas and building cards all pass through the same prepared frames.
export function applyVillagePalette(id, canvas) {
  if (!VILLAGE_BUILDING.test(id)) return;
  const context = canvas.getContext('2d');
  if (!context.getImageData || !context.putImageData) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  paintPalette(image.data);
  if (HOME_LANDMARK.test(id)) lightLandmark(image.data, canvas.width, canvas.height);
  context.putImageData(image, 0, 0);
}
