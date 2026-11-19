// Top-left texture coordinates from the normalized village sprites. The painted masonry and
// foot stay still while the cloth, bell metal and warm light change inside their own regions.
export const landmarkProfiles = {
  cabin: {pennant: [.424, .031, .653, .237], lights: [[.184, .543, .371, .704], [.553, .542, .678, .700]]},
  'island-bell': {bell: {region: [.320, .429, .696, .738], pivot: [.503, .457]},
    lights: [[.052, .605, .203, .772], [.784, .605, .933, .772]]},
  'island-watchtower': {pennant: [.482, .145, .892, .297]},
  'island-watchtower-l4': {pennant: [.480, .087, .886, .215]},
  'island-watchtower-l5': {pennant: [.480, .142, .879, .275]},
  'island-arsenal': {lights: [[.480, .650, .607, .800]]},
  'island-house': {lights: [[.563, .584, .731, .733]]},
  'island-house-l2': {lights: [[.187, .588, .339, .719], [.528, .617, .645, .743]]},
  'island-house-l3': {lights: [[.219, .277, .383, .442], [.568, .370, .735, .515], [.445, .614, .630, .779]]},
  'island-house-barracks': {lights: [[.200, .571, .340, .737], [.433, .617, .592, .753]]},
  'island-house-barracks-l3': {lights: [[.368, .166, .502, .325], [.242, .603, .368, .752], [.485, .602, .625, .754]]},
  'island-house-tavern': {lights: [[.188, .591, .309, .734], [.463, .605, .584, .741]]},
  'island-house-tavern-l3': {lights: [[.349, .160, .481, .320], [.405, .349, .543, .502], [.201, .591, .322, .738]]},
  'island-house-workshop': {lights: [[.195, .587, .325, .741], [.594, .645, .764, .798]]},
  'island-house-workshop-l3': {lights: [[.323, .270, .444, .421], [.208, .630, .329, .775], [.600, .646, .767, .803]]},
};

const mask = /* glsl */`
  vec2 regionalPosition(vec2 at, vec4 box) { return (at - box.xy) / (box.zw - box.xy); }
  float regionalWeight(vec2 at) {
    vec2 edge = min(at, 1.0 - at);
    return smoothstep(0.0, .13, min(edge.x, edge.y));
  }
`;

// A material is owned by the place and can still be shared by every instance of that artwork.
// The model origin seeds each sprite independently without per-building textures or draw calls.
export function animateLandmarkMaterial(material, {pennant, bell, lights = []} = {}) {
  const uniforms = {uLandmarkClock: {value: 0}, uLandmarkWind: {value: 0}, uLandmarkRing: {value: 0},
    uLandmarkLight: {value: 0}, uLandmarkFlicker: {value: 0}};
  if (pennant) uniforms.uLandmarkPennant = {value: pennant};
  if (bell) {
    const image = material.map.image;
    uniforms.uLandmarkBell = {value: bell.region}; uniforms.uLandmarkPivot = {value: bell.pivot};
    uniforms.uLandmarkAspect = {value: image.width / image.height};
  }
  if (lights.length) uniforms.uLandmarkLights = {value: lights.flat()};
  const prepare = material.onBeforeCompile, baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prepare.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying float vLandmarkPhase;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvLandmarkPhase = dot(modelMatrix[3].xy, vec2(1.199, 1.727));');
    shader.fragmentShader = /* glsl */`
      varying float vLandmarkPhase;
      uniform float uLandmarkClock, uLandmarkWind, uLandmarkRing, uLandmarkLight, uLandmarkFlicker;
      ${pennant ? 'uniform vec4 uLandmarkPennant;' : ''}
      ${bell ? 'uniform vec4 uLandmarkBell; uniform vec2 uLandmarkPivot; uniform float uLandmarkAspect;' : ''}
      ${lights.length ? `uniform vec4 uLandmarkLights[${lights.length}];` : ''}
      ${mask}
    ` + shader.fragmentShader.replace('#include <map_fragment>', /* glsl */`
      #ifdef USE_MAP
        vec2 artUv = vec2(vMapUv.x, 1.0 - vMapUv.y);
        vec2 sampleUv = artUv;
        ${pennant ? /* glsl */`
          vec2 cloth = regionalPosition(artUv, uLandmarkPennant);
          float freeEdge = smoothstep(.12, .82, cloth.x);
          float ripple = sin(uLandmarkClock * 4.5 + vLandmarkPhase - cloth.x * 4.0)
            + .32 * sin(uLandmarkClock * 6.2 - cloth.x * 5.4);
          sampleUv.y -= uLandmarkWind * ripple * freeEdge * regionalWeight(cloth);
        ` : ''}
        ${bell ? /* glsl */`
          vec2 metal = regionalPosition(artUv, uLandmarkBell);
          vec2 aspect = vec2(uLandmarkAspect, 1.0);
          vec2 hinge = (artUv - uLandmarkPivot) * aspect;
          float cosine = cos(uLandmarkRing), sine = sin(uLandmarkRing);
          vec2 atRest = (mat2(cosine, -sine, sine, cosine) * hinge) / aspect + uLandmarkPivot;
          sampleUv += (atRest - artUv) * regionalWeight(metal);
        ` : ''}
        vec4 village = texture2D(map, vec2(sampleUv.x, 1.0 - sampleUv.y));
        ${lights.length ? /* glsl */`
          float glass = 0.0;
          for (int i = 0; i < ${lights.length}; i++) {
            vec2 panel = regionalPosition(artUv, uLandmarkLights[i]);
            glass = max(glass, regionalWeight(panel));
          }
          float amber = smoothstep(.07, .28, village.r - village.b) * smoothstep(.12, .38, village.g);
          float candle = sin(uLandmarkClock * 5.5 + vLandmarkPhase) * .66
            + sin(uLandmarkClock * 8.1 - vLandmarkPhase * .71) * .34;
          village.rgb *= 1.0 + (uLandmarkLight + candle * uLandmarkFlicker) * amber * glass;
        ` : ''}
        diffuseColor *= village;
      #endif
    `);
  };
  material.customProgramCacheKey = () => `${baseKey}:landmark:${!!pennant}:${!!bell}:${lights.length}`;
  material.needsUpdate = true;
  return {
    update({time = 0, wind = .2, night = 0, ring = 0, still = false} = {}) {
      uniforms.uLandmarkClock.value = still ? 0 : time;
      uniforms.uLandmarkWind.value = still ? 0 : .005 + .012 * wind;
      uniforms.uLandmarkRing.value = still ? 0 : ring;
      uniforms.uLandmarkLight.value = .12 * night;
      uniforms.uLandmarkFlicker.value = still ? 0 : .08 + .09 * night;
    },
  };
}
