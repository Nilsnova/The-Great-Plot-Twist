import {canvas, ellipse, linear, stroke} from './paint.js';

const artPaths = new Set([
  'pixel/ground.png', 'places/saltreach_harbor.png', 'places/smugglers_cove.png',
  'places/wreck_point.png', 'places/the_teeth.png',
]);
export const isOutpostGround = path => artPaths.has(path);

function material(red, green, blue) {
  if (green >= red + 6 && green >= blue + 30) return 1;
  return red > green + 18 && green > blue + 38 ? 2 : 0;
}

/** Paint over the original ground art. The original alpha and path shapes also define the sea edge. */
export function paintOutpostGround(source, density, {muted = false} = {}) {
  const {width, height} = source;
  const original = canvas(width, height), sample = original.getContext('2d', {willReadFrequently: true});
  sample.drawImage(source, 0, 0);
  const image = sample.getImageData(0, 0, width, height), kind = new Uint8Array(width * height);
  for (let y = 0, tile = 0; y < height; y++) for (let x = 0; x < width; x++, tile++) {
    const i = tile * 4;
    if (!image.data[i + 3]) continue;
    const red = image.data[i], green = image.data[i + 1], blue = image.data[i + 2];
    const sun = Math.max(0, 1.25 - x / width * .72 - y / height * .92);
    kind[tile] = material(red, green, blue);
    if (kind[tile] === 1) {
      image.data[i] = red + sun * (muted ? 5 : 12);
      image.data[i + 1] = green + 7 + sun * 11;
      image.data[i + 2] = blue + 3 + sun * 5;
    } else if (kind[tile] === 2) {
      image.data[i] = red + 3 + sun * 6;
      image.data[i + 1] = green + 5 + sun * 8;
      image.data[i + 2] = blue + 7 + sun * 10;
    }
  }
  sample.putImageData(image, 0, 0);

  const art = canvas(Math.round(64 * density), Math.round(48 * density)), c = art.getContext('2d');
  c.scale(art.width / width, art.height / height);
  c.imageSmoothingQuality = 'high';
  c.drawImage(original, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = linear(c, width * .13, height * .08, width * .84, height * .95,
    [[0, '#ffe6a92a'], [.42, '#ffdc8810'], [.69, '#535d7805'], [1, '#3d63512c']]);
  c.fillRect(0, 0, width, height);

  let seed = 758791;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    const x = 2 + random() * (width - 4), y = 2 + random() * (height - 4);
    const at = Math.floor(y) * width + Math.floor(x), tone = random();
    if (kind[at] === 1 && kind[at - width * 2] === 1) {
      const stem = tone * 1.75 + .6;
      stroke(c, [[x - .6, y + .3], [x + .12, y + .58]], '#405d2d', .65, .32);
      stroke(c, [[x, y], [x + .3, y - stem], [x + 1.05, y - stem - .1]],
        tone > .56 ? '#c6d37a' : '#64873b', .49, .49);
    } else if (kind[at] === 2 && tone > .55) {
      c.fillStyle = tone > .76 ? '#fff2c85e' : '#8b613139';
      c.fill(ellipse(x, y, .48 + tone * .75, .34 + tone * .36));
    }
  }
  return art;
}
