// Top-left texture coordinates from the normalized village sprites. The painted masonry and
// foot stay still while cloth, bell metal, smoke and light each stay inside their own region.
export const landmarkProfiles = {
  cabin: {pennant: [.424, .031, .653, .194], lights: [[.184, .543, .371, .704], [.553, .542, .678, .700]]},
  'island-bell': {bell: {region: [.329, .397, .684, .694], pivot: [.503, .422]},
    lights: [[.052, .605, .203, .772], [.784, .605, .933, .772]]},
  'island-watchtower': {pennant: [.482, .145, .892, .263]},
  'island-watchtower-l4': {pennant: [.480, .087, .886, .202]},
  'island-watchtower-l5': {pennant: [.480, .142, .879, .253]},
  'island-arsenal': {smoke: [.590, .004, .970, .163]},
  'island-harbor': {lights: [[.653, .531, .757, .641]]},
  'island-techhub': {sweep: [.302, .048, .705, .344],
    lights: [[.263, .512, .351, .645], [.340, .544, .415, .649], [.448, .584, .585, .704], [.612, .545, .690, .646]]},
  'island-wreck-mended': {pennant: [.574, .146, .766, .295]},
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
export function animateLandmarkMaterial(material, {pennant, bell, smoke, sweep, lights = []} = {}) {
  const uniforms = {uLandmarkClock: {value: 0}, uLandmarkWind: {value: 0}, uLandmarkRing: {value: 0},
    uLandmarkLight: {value: 0}, uLandmarkFlicker: {value: 0}};
  if (pennant) uniforms.uLandmarkPennant = {value: pennant};
  if (bell) {
    const image = material.map.image;
    uniforms.uLandmarkBell = {value: bell.region}; uniforms.uLandmarkPivot = {value: bell.pivot};
    uniforms.uLandmarkAspect = {value: image.width / image.height};
  }
  if (smoke) uniforms.uLandmarkSmoke = {value: smoke};
  if (sweep) uniforms.uLandmarkSweep = {value: sweep};
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
      ${smoke ? 'uniform vec4 uLandmarkSmoke;' : ''}
      ${sweep ? 'uniform vec4 uLandmarkSweep;' : ''}
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
          vec2 metalOnly = clamp(atRest, uLandmarkBell.xy, uLandmarkBell.zw);
          sampleUv += (metalOnly - artUv) * regionalWeight(metal);
        ` : ''}
        vec4 village = texture2D(map, vec2(sampleUv.x, 1.0 - sampleUv.y));
        ${lights.length || sweep ? /* glsl */`
          float amber = smoothstep(.07, .28, village.r - village.b) * smoothstep(.12, .38, village.g);
        ` : ''}
        ${lights.length ? /* glsl */`
          float glass = 0.0;
          for (int i = 0; i < ${lights.length}; i++) {
            vec2 panel = regionalPosition(artUv, uLandmarkLights[i]);
            glass = max(glass, regionalWeight(panel));
          }
          float candle = sin(uLandmarkClock * 5.5 + vLandmarkPhase) * .66
            + sin(uLandmarkClock * 8.1 - vLandmarkPhase * .71) * .34;
          village.rgb *= 1.0 + (uLandmarkLight + candle * uLandmarkFlicker) * amber * glass;
        ` : ''}
        ${sweep ? /* glsl */`
          vec2 orb = regionalPosition(artUv, uLandmarkSweep);
          float polished = regionalWeight(orb) * amber * uLandmarkFlicker;
          if (polished > 0.0) {
            vec2 fromCenter = orb - vec2(.57, .57);
            float azimuth = atan(fromCenter.y, fromCenter.x + .0001);
            float movingLight = pow(max(0.0, cos(azimuth + uLandmarkClock * 1.7)), 8.0);
            village.rgb *= 1.0 + 3.7 * polished * movingLight;
          }
        ` : ''}
        ${smoke ? /* glsl */`
          vec2 stack = regionalPosition(artUv, uLandmarkSmoke);
          if (uLandmarkWind > 0.0 && all(greaterThan(stack, vec2(0.0))) && all(lessThan(stack, vec2(1.0)))) {
            float haze = 0.0;
            for (int i = 0; i < 3; i++) {
              float age = fract(uLandmarkClock * .55 + float(i) * .333);
              float drift = (.18 + 14.0 * uLandmarkWind) * age + sin(age * 7.0 + float(i)) * age * .06;
              vec2 plume = stack - vec2(.30 + drift, .93 - .79 * age);
              vec2 spread = vec2(.06 + .09 * age, .115 + .08 * age);
              float opacity = .30 * smoothstep(0.0, .12, age) * (1.0 - smoothstep(.30, 1.0, age));
              haze = max(haze, opacity * (1.0 - smoothstep(0.0, 1.0, length(plume / spread))));
            }
            float alpha = haze * regionalWeight(stack) * (1.0 - village.a);
            village += vec4(vec3(.53, .56, .54) * alpha, alpha);
          }
        ` : ''}
        diffuseColor *= village;
      #endif
    `);
  };
  material.customProgramCacheKey = () => `${baseKey}:landmark:${!!pennant}:${!!bell}:${!!smoke}:${!!sweep}:${lights.length}`;
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
