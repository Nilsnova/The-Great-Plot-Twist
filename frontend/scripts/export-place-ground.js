// Export shared movement masks for the offline native-pixel background authoring tool.
import { surfaceClass } from '../src/world/places/surfaces.js';
const pixels = Buffer.alloc(1024 * 768), id = process.argv[2];
for (let y = 0; y < 768; y++) for (let x = 0; x < 1024; x++) {
  pixels[y * 1024 + x] = surfaceClass(id, (x - 512) / 16, (y - 384) / (16 * .72));
}
process.stdout.write(pixels);
