// Flat painted shapes and brush lines used by the illustrated map.
import * as THREE from 'three';

export function polygon(group, points, color, order = 0, opacity = 1) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({
    // One transparent queue preserves painted layer order, including solid colours.
    color, transparent: true, opacity, depthTest: false, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  }));
  mesh.renderOrder = order; group.add(mesh); return mesh;
}
export function paintedBlob(group, x, y, width, height, color, order, opacity = 1) {
  const points = [];
  for (let i = 0; i < 44; i++) {
    const angle = i / 44 * Math.PI * 2;
    const edge = 1 + Math.sin(angle * 5) * 0.04 + Math.cos(angle * 3) * 0.06;
    points.push([x + Math.cos(angle) * width * edge, y + Math.sin(angle) * height * edge]);
  }
  return polygon(group, points, color, order, opacity);
}
