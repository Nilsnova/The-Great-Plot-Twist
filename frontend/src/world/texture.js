// Static assets fail with a bounded wait; a late result still releases its texture.
import * as THREE from 'three';
export function loadTexture(url, loader = new THREE.TextureLoader(), timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error(`Drawing timed out: ${url}`)); }, timeoutMs);
    loader.loadAsync(url).then(texture => {
      clearTimeout(timer);
      if (expired) texture.dispose(); else resolve(texture);
    }, error => { clearTimeout(timer); if (!expired) reject(error); });
  });
}
