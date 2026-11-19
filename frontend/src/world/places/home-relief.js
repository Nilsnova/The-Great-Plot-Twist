// Rock relief is presentation only. Dry stone follows the approved painted coast mask.
import * as THREE from 'three';
import {APPROACH_DEPTH, cliffProfile} from '../../art/coast-cliffs.js';
import {groundProjectionGlsl, LEGACY_DEPTH, projectGround} from '../projection.js';
import {surfaces} from './surfaces.js';

const STONES = ['#c1a783', '#c9ad8e', '#ada096', '#b39a7f', '#bba48b', '#a19a91'].map(color => new THREE.Color(color));
const BEDROCK = new THREE.Color('#6e6254');
const OUTCROP = new THREE.Color('#a3a098');
const SUBMERGED_STONE = new THREE.Color('#66887c');
const TURF = new THREE.Color('#91b949');
const BLOCK_WIDTHS = [4.1, 6, 4.8, 3.5, 5.1, 5.9, 3.8];
const ROCKY_ARCS = [[9, 36], [54, 81]];
const TERRACE_ARCS = [[25, 34], [55, 67]];
const surface = surfaces.home_islet;
const SUN = new THREE.Vector3(-.61, .71, -.32).normalize();

function stoneVertex(rows, index, fraction, inset) {
  const first = Math.floor(index), mix = index - first;
  const a = rows[first], b = rows[Math.min(first + 1, rows.length - 1)];
  const {lerp} = THREE.MathUtils;
  const x = lerp(a.x, b.x, mix), z = lerp(a.z, b.z, mix), depth = lerp(a.depth, b.depth, mix);
  const radius = Math.hypot(x, z);
  return new THREE.Vector3(x - x / radius * inset, -depth * fraction, z - z / radius * inset);
}

function homeCliffGeometry(rows = cliffProfile(surface)) {
  const positions = [], colors = [], relief = [];
  const faceNormal = new THREE.Vector3(), edge = new THREE.Vector3(), exterior = new THREE.Vector3();
  function sunlight(a, b, c) {
    faceNormal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
    exterior.set(a.x + b.x + c.x, 6, a.z + b.z + c.z);
    if (faceNormal.dot(exterior) < 0) faceNormal.negate();
    return Math.max(-.43, faceNormal.dot(SUN)) * .57;
  }
  function triangle(a, b, c, tint, tones, bias, fractions, region, sun = sunlight(a, b, c)) {
    for (const [i, vertex] of [a, b, c].entries()) {
      const light = THREE.MathUtils.clamp(.77 + sun + tones[i], .24, 1.44);
      const display = projectGround(vertex.x, vertex.z - vertex.y / LEGACY_DEPTH);
      positions.push(display.x, display.y, vertex.z + vertex.y * .6 + bias);
      colors.push(tint.r * light, tint.g * light, tint.b * light);
      relief.push(-vertex.y, fractions[i], region);
    }
  }
  function panel(a, b, c, d, tint, upper, lower, from, to, bias = 0, region = 0) {
    const sun = (sunlight(a, b, c) + sunlight(a, c, d)) / 2;
    triangle(a, b, c, tint, [upper, upper, lower], bias, [from, from, to], region, sun);
    triangle(a, c, d, tint, [upper, lower, lower], bias, [from, to, to], region, sun);
  }

  // A continuous dark bed shows only where separate columns taper away from one another.
  const nearEnd = (rows.length - 1) / 2;
  for (let i = 0; i < nearEnd; i++) {
    if (Math.max(rows[i].depth, rows[i + 1].depth) <= APPROACH_DEPTH + .025) continue;
    panel(stoneVertex(rows, i, 0, 0), stoneVertex(rows, i + 1, 0, 0),
      stoneVertex(rows, i + 1, 1, 0), stoneVertex(rows, i, 1, 0), BEDROCK, .03, -.18, 0, 1, -.67);
  }

  for (const [first, last] of ROCKY_ARCS) {
    for (let start = first, block = first; start < last; block++) {
      const end = Math.min(last, start + BLOCK_WIDTHS[block % BLOCK_WIDTHS.length]);
      const turn = Math.sin(block * 2.17), bevel = Math.cos(block * 2.43);
      const pigment = STONES[block % STONES.length];
      const across = [0, .18 + turn * .075, .76 + bevel * .085, 1];
      const split = .66 + bevel * .13;
      const face = [
        [0, .16, .21], [.12 - bevel * .05, .02, .27], [split, .005, -.06],
        [.88 + turn * .035, .04, -.12], [1, .25, -.25],
      ];
      // A column keeps a broad main face. Its shoulders alternate in width and the foot fans out.
      const point = (level, side) => {
        const [drop, inset] = face[level], u = across[side];
        const joint = side === 0 || side === 3;
        const crease = Math.sin(block * 2.3 + level * 1.6 + u * 1.8);
        const edgeCut = joint ? .21 + .06 * bevel + .075 * crease : 0;
        const lean = (drop - .2) * turn * .43 + crease * (joint ? .19 : .075);
        const sample = THREE.MathUtils.clamp(THREE.MathUtils.lerp(start, end,
          THREE.MathUtils.lerp(.015, .985, u)) + lean, first, last);
        return stoneVertex(rows, sample, drop, inset + edgeCut);
      };
      for (let level = 0; level < face.length - 1; level++) {
        const [from, , upper] = face[level], [to, , lower] = face[level + 1];
        for (let side = 0; side < across.length - 1; side++) {
          const tone = [-.04, .045, -.17][side];
          panel(point(level, side), point(level, side + 1), point(level + 1, side + 1), point(level + 1, side),
            pigment, upper + tone, lower + tone, from, to);
        }
      }

      const middle = (start + end) / 2;
      const rockDepth = THREE.MathUtils.lerp(rows[Math.floor(middle)].depth, rows[Math.ceil(middle)].depth, middle % 1);
      if (rockDepth > 1.8 && end - start > 1.8) {
        // Individual low stones break the foot of the columns. Water softens their edges and colour.
        const half = Math.min(1.55, (end - start) * .32), toe = middle + .32 * turn;
        const inset = -.24 - (.13 + .10 * bevel);
        const top = stoneVertex(rows, toe, 1.07, inset * .78);
        const left = stoneVertex(rows, toe - half, 1.29, inset);
        const right = stoneVertex(rows, toe + half, 1.33, inset - .16);
        const ridge = stoneVertex(rows, toe, 1.34, inset - .46);
        const foot = stoneVertex(rows, toe - .22 * turn, 1.55 + bevel * .11, inset - .51);
        triangle(left, top, ridge, SUBMERGED_STONE, [-.08, .41, .15], -.43, [.48, 0, .36], 1);
        triangle(top, right, ridge, SUBMERGED_STONE, [.41, -.1, .065], -.43, [0, .54, .36], 1);
        triangle(left, ridge, foot, SUBMERGED_STONE, [-.08, .10, -.3], -.43, [.48, .36, 1], 1);
        triangle(ridge, right, foot, SUBMERGED_STONE, [.055, -.1, -.3], -.43, [.36, .54, 1], 1);

        // Grass rolls back into the meadow above short, independent stone shoulders.
        // The low seam next to an interior terrace remains clear for its own rockwork.
        const fromTerrace = Math.min(...TERRACE_ARCS.map(([left, right]) => Math.max(0, left - middle, middle - right)));
        if (fromTerrace > 1.4) {
          const capHeight = .54 + THREE.MathUtils.smoothstep(fromTerrace, 1.4, 4.3) * (.76 + .12 * bevel);
          const turfDepth = .81 + .15 * turn;
          const crest = [[.034, 0], [.11, .38], [.25, .69], [.43, 1], [turfDepth, .94], [turfDepth + .45, .42], [turfDepth + .69, 0]];
          const cut = THREE.MathUtils.lerp(start, end, .47 + turn * .10);
          const shoulders = end - start > 3.5 ? [[start, cut], [cut, end]] : [[start, end]];
          for (const [piece, [from, to]] of shoulders.entries()) {
            const lean = Math.sin(block * 1.71 + piece * 2.43);
            const faceStone = STONES[(block + piece * 2) % STONES.length];
            const cap = crest.map(([inset, rise], level) => across.map((u, side) => {
              const outer = side === 0 || side === 3;
              const tuck = outer ? .21 + .095 * Math.sin(level + side + lean) : 0;
              const sample = THREE.MathUtils.lerp(from + .095, to - .095, u);
              const height = capHeight * rise * (outer ? .50 + .074 * lean : 1 + .07 * lean * (level - 2));
              return stoneVertex(rows, sample, -height / rockDepth, inset + tuck);
            }));
            for (let level = 0; level < crest.length - 1; level++) {
              const grass = level >= 2, baseTone = [-.18, .17, .14, .08, -.055, -.105][level];
              for (let side = 0; side < across.length - 1; side++) {
                const tone = [-.13, .08, -.18][side] + .08 * lean;
                panel(cap[level][side], cap[level][side + 1], cap[level + 1][side + 1], cap[level + 1][side],
                  grass ? TURF : faceStone, baseTone + tone, baseTone + tone - .085, level, level + 1, .9, grass ? 3 : 2);
              }
            }
          }
        }
      }
      start = end;
    }
  }

  // Broken boulder clusters frame the sandy cove. Their bases stay on the old top, outside
  // the entrance lane, and their bevels cast enough contrast to read beside the larger cliff.
  const boulders = [
    {sample: 33.9, radius: 1.33, inset: .67, height: 1.87, pigment: OUTCROP},
    {sample: 35.2, radius: .69, inset: .61, height: .75, pigment: STONES[5]},
    {sample: 55.1, radius: 1.21, inset: .67, height: 1.75, pigment: OUTCROP},
    {sample: 53.9, radius: .64, inset: .56, height: .68, pigment: STONES[3]},
    {sample: 21.7, radius: 1.65, inset: .13, height: 1.49, foot: .99, pigment: OUTCROP},
    {sample: 26.1, radius: 1.43, inset: .14, height: 1.21, foot: .98, pigment: STONES[1]},
    {sample: 61.5, radius: 1.71, inset: .16, height: 1.46, foot: .98, pigment: OUTCROP},
    {sample: 71.9, radius: 1.32, inset: .15, height: 1.26, foot: .99, pigment: STONES[1]},
  ];
  const outline = [[-.85, -.43], [.13, -.60], [.94, -.31], [.82, .31], [.21, .58], [-.68, .50]];
  const rings = [
    {scale: 1.03, level: 0, lean: 0, highlight: -.23},
    {scale: 1, level: .22, lean: 0, highlight: -.10},
    {scale: .78, level: .82, lean: -.08, highlight: .045},
    {scale: .54, level: .99, lean: -.13, highlight: .23},
  ];
  for (const {sample, radius, inset, height, foot = 0, pigment} of boulders) {
    const coastDepth = stoneVertex(rows, sample, -1, inset).y;
    const region = foot > 0 ? 0 : 2, bias = 1.32;
    const crownDepth = foot * .38;
    const rim = rings.map(({scale, level, lean}) => outline.map(([arc, reach]) =>
      stoneVertex(rows, sample + (arc * scale + lean) * radius,
        foot - height * (level + level * .079 * reach) / coastDepth, Math.max(.035, inset + reach * scale))));
    for (let ring = 0; ring < rim.length - 1; ring++) {
      const {highlight: upper} = rings[ring], {highlight: lower} = rings[ring + 1];
      for (let edge = 0; edge < outline.length; edge++) {
        const next = (edge + 1) % outline.length;
        panel(rim[ring][edge], rim[ring][next], rim[ring + 1][next], rim[ring + 1][edge],
          pigment, upper, lower, foot * (1 - rings[ring].level * .62), foot * (1 - rings[ring + 1].level * .62), bias, region);
      }
    }
    const peak = stoneVertex(rows, sample - .13 * radius, foot - height / coastDepth, inset + .11);
    const crown = rim[rim.length - 1];
    for (let edge = 0; edge < outline.length; edge++) {
      triangle(crown[edge], crown[(edge + 1) % outline.length], peak, pigment, [.18, .19, .25], bias,
        [crownDepth, crownDepth, crownDepth], region);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('shoreRelief', new THREE.Float32BufferAttribute(relief, 3));
  return geometry;
}

export function createHomeRelief(group, coastArt) {
  const material = new THREE.ShaderMaterial({
    uniforms: {uCoastArt: {value: coastArt}},
    vertexColors: true, side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthTest: true, depthWrite: true, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec3 shoreRelief;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying vec3 vShoreRelief;
      void main() {
        vReliefPoint = position.xy;
        vStone = color;
        vShoreRelief = shoreRelief;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${groundProjectionGlsl}
      uniform sampler2D uCoastArt;
      varying vec2 vReliefPoint;
      varying vec3 vStone;
      varying vec3 vShoreRelief;
      float stoneHash(vec2 point) {
        vec3 seed = fract(vec3(point.xyx) * .1031);
        seed += dot(seed, seed.yzx + 33.33);
        return fract((seed.x + seed.y) * seed.z);
      }
      float stoneGrain(vec2 point) {
        vec2 cell = floor(point);
        vec2 blend = smoothstep(0.0, 1.0, fract(point));
        return mix(mix(stoneHash(cell), stoneHash(cell + vec2(1.0, 0.0)), blend.x),
          mix(stoneHash(cell + vec2(0.0, 1.0)), stoneHash(cell + vec2(1.0, 1.0)), blend.x), blend.y);
      }
      void main() {
        vec2 logical = unprojectGround(vReliefPoint);
        vec2 shore = logical / vec2(${surface.rx.toFixed(1)}, ${surface.rz.toFixed(1)});
        float angle = atan(shore.y, shore.x);
        float rim = 1.0 + .055 * sin(angle * 5.0 + ${surface.seed.toFixed(1)}) + .035 * cos(angle * 7.0);
        // Preserve all of the visible, playable upper beach, including the existing shallow coves.
        vec4 rock = texture2D(uCoastArt, vec2(logical.x / 64.0, -logical.y * ${LEGACY_DEPTH} / 48.0) + .5);
        if (vShoreRelief.z > 1.5) {
          if (length(shore) > rim || rock.a < .78) discard;
          float height = -vShoreRelief.x;
          float opacity = smoothstep(.015, .24, height);
          if (opacity < .02) discard;
          float pore = stoneGrain(logical * vec2(14.0, 17.0)) - .5;
          float weather = stoneGrain(logical * vec2(2.8, 4.0)) - .5;
          if (vShoreRelief.z > 2.5) {
            float green = smoothstep(1.13, 1.44, (rock.g + .01) / (rock.r + .01));
            // Fine fringe and the scene's own grass grain keep the cap attached to the meadow.
            gl_FragColor = vec4(mix(vStone, rock.rgb, green * .57) * (1.01 + pore * .09 + weather * .14), opacity);
          } else {
            gl_FragColor = vec4(vStone * (.95 + pore * .11 + weather * .24), opacity);
          }
          #include <colorspace_fragment>
          return;
        }
        if (length(shore) < rim * 1.003) discard;
        if (vShoreRelief.z > .5) {
          if (rock.a >= .5) discard;
          float depth = vShoreRelief.y;
          float wave = sin(logical.x * 6.0 + logical.y * 3.0 + sin(logical.y * 4.2)) * .045;
          float opacity = (1.0 - smoothstep(.25, 1.0, depth + wave)) * .47;
          opacity *= 1.0 - smoothstep(.13, .5, rock.a);
          if (opacity < .01) discard;
          float surfaceLight = .88 + wave * 2.0;
          gl_FragColor = vec4(vStone * surfaceLight, opacity);
          #include <colorspace_fragment>
          return;
        }
        if (rock.a < .78) discard;
        float grain = dot(rock.rgb, vec3(.30, .59, .11));
        float rockGrain = smoothstep(.06, .46, grain);
        float depth = vShoreRelief.y;
        float pores = stoneGrain(logical * vec2(13.0, 16.5)) - .5;
        float strata = stoneGrain(vec2(logical.x * 1.8 + depth * 2.3, logical.y * 6.1)) - .5;
        float grainBreak = sin(logical.x * 1.74 + logical.y * .83) * .14
          + cos(logical.x * 4.23 - logical.y * 3.23) * .07;
        float damp = smoothstep(.53, 1.0, depth + grainBreak) * smoothstep(.45, 1.7, vShoreRelief.x);
        vec3 stone = vStone * (mix(.82, 1.13, rockGrain) + pores * .09 + grainBreak * .15 + strata * .14);
        float cap = (1.0 - smoothstep(.07, .28, depth)) * smoothstep(.11, .51, dot(vStone, vec3(.30, .58, .12)));
        stone = mix(stone, stone * vec3(1.19, 1.09, 1.02), cap);
        float moss = smoothstep(.62, .84, rockGrain + grainBreak * .7)
          * (1.0 - smoothstep(.04, .26, depth)) * .52;
        stone = mix(stone, stone * vec3(.82, 1.05, .67), moss);
        stone = mix(stone, stone * vec3(.48, .65, .74) + vec3(.007, .025, .039), damp * .82);
        gl_FragColor = vec4(mix(stone, rock.rgb, .10), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(homeCliffGeometry(), material);
  mesh.name = 'home-coast-relief';
  mesh.renderOrder = 4.5;
  mesh.raycast = () => {};
  group.add(mesh);
  return mesh;
}
