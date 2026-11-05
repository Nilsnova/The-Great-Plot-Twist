// Emit only the canonical terrain's land classes for the offline art generator.
import { terrainHeight } from '../src/world/terrain.js';
const pixels = Buffer.alloc(1024 * 768);
for (let y = 0; y < 768; y++) for (let x = 0; x < 1024; x++) {
  const height = terrainHeight((x - 512) / 16, (y - 384) / (16 * .72));
  pixels[y * 1024 + x] = (height > 1 ? 2 : height > .03 ? 1 : 0) + (height > 6.2 ? 8 : 0);
}
process.stdout.write(pixels);
