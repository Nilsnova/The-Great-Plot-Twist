// Glazed blue roofs, honey-toned timber and a little sea light in the iron.
// The alpha channel, original painted shading and normalized frame stay intact.
const VILLAGE_BUILDING = /^(?:cabin|island_core(?:_(?:damaged|broken))?|island-(?:house|watchtower|bell|arsenal|techhub|harbor|cannon|mortar|harpoon|culverin|swivel)(?:-|$))/;
const unit = value => Math.max(0, Math.min(value, 1));

function paintPalette(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
    const luma = (red * 53 + green * 184 + blue * 19) / 256;
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

// World sprites, the defense atlas and building cards all pass through the same prepared frames.
export function applyVillagePalette(id, canvas) {
  if (!VILLAGE_BUILDING.test(id)) return;
  const context = canvas.getContext('2d');
  if (!context.getImageData || !context.putImageData) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  paintPalette(image.data);
  context.putImageData(image, 0, 0);
}
