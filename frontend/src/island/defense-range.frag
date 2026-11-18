varying vec2 logicalOffset;
uniform vec3 tint;
uniform vec3 strength;
uniform vec3 edgeTint;
uniform float inner;
uniform float outer;
uniform float rimWidth;
uniform float conditional;
uniform float conditionalWidth;

void main() {
  float radius = length(logicalOffset);
  float aa = max(fwidth(radius) * 0.75, 0.0001);
  float outside = outer > 0.0 ? 1.0 - smoothstep(outer - aa, outer, radius) : 0.0;
  float inside = inner > 0.0 ? smoothstep(inner, inner + aa, radius) : 1.0;
  float outerRim = smoothstep(outer - rimWidth - aa, outer - rimWidth + aa, radius);
  float innerRim = inner > 0.0 ? 1.0 - smoothstep(inner + rimWidth - aa, inner + rimWidth + aa, radius) : 0.0;
  float area = outside * inside * max(strength.x, max(strength.y * outerRim, strength.z * innerRim));
  float edge = 0.0;
  if (conditional > 0.0 && abs(radius - conditional) < conditionalWidth + aa) {
    // The dashed amber rail is a condition, so it carries no second fill.
    float dash = abs(fract(atan(logicalOffset.y, logicalOffset.x) * 7.639437 + 0.5) - 0.5);
    float band = smoothstep(conditional - conditionalWidth - aa, conditional - conditionalWidth + aa, radius);
    float cap = 1.0 - smoothstep(conditional - aa, conditional, radius);
    edge = 0.39 * band * cap * (1.0 - smoothstep(0.25, 0.34, dash));
  }
  float alpha = max(area, edge);
  gl_FragColor = vec4(mix(tint, edgeTint, edge / max(area + edge, 0.0001)), alpha);
  #include <colorspace_fragment>
}
