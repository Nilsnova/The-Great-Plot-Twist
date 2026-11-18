// Independent numeric reference for b1755351's four span faces and D064 presentation.
// No renderer/projection imports: documented logical endpoints, .56 thickness and upright heights are inputs.
export function referenceWallLayers(links, legacy = false) {
  const layers = new Map();
  for (const span of links) {
    const order = 100 + (span.z0 + span.z1) / 2 - .02;
    if (!layers.has(order)) layers.set(order, []);
    const output = layers.get(order), cx = (span.x0 + span.x1) / 2, cz = (span.z0 + span.z1) / 2;
    const alongX = span.x0 !== span.x1;
    const halfX = alongX ? Math.abs(span.x1 - span.x0) / 2 : .28;
    const halfZ = alongX ? .28 : Math.abs(span.z1 - span.z0) / 2;
    const height = [.95, 1.15, 1.45, 1.45, 1.45][span.level - 1];
    const corner = (side, depth, lift) => [cx + side * halfX, cz + depth * halfZ, lift];
    const backLeft = corner(-1, -1, height), backRight = corner(1, -1, height);
    const frontLeft = corner(-1, 1, height), frontRight = corner(1, 1, height);
    const lower = ([x,z]) => [x,z,0];
    // Top, front, right side, then the .07-deep upper course lifted .01 above the top.
    const faces = [
      [backLeft, backRight, frontRight, frontLeft],
      [lower(frontLeft), lower(frontRight), frontRight, frontLeft],
      [lower(backRight), lower(frontRight), frontRight, backRight],
      [frontLeft, frontRight, [frontRight[0],frontRight[1]-.07], [frontLeft[0],frontLeft[1]-.07]]
        .map(([x,z]) => [x,z,height+.01]),
    ];
    for (const [x,z,lift] of faces.flat()) output.push(legacy ? x : 1.3*x+.2*z, -(legacy ? .72 : .6)*z+lift, 0);
  }
  return new Map([...layers].map(([order,positions]) => [order, Array.from(new Float32Array(positions))]));
}
