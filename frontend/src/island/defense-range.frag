varying vec2 logicalOffset;
uniform vec3 tint;
uniform float inner;
uniform float rimWidth;

void main() {
  float radius = length(logicalOffset);
  float aa = max(fwidth(radius) * 0.75, 0.0001);
  float outside = 1.0 - smoothstep(1.0 - aa, 1.0, radius);
  float inside = inner > 0.0 ? smoothstep(inner, inner + aa, radius) : 1.0;
  float outerRim = smoothstep(1.0 - rimWidth - aa, 1.0 - rimWidth + aa, radius);
  float innerRim = inner > 0.0 ? 1.0 - smoothstep(inner + rimWidth - aa, inner + rimWidth + aa, radius) : 0.0;
  gl_FragColor = vec4(tint, outside * inside * max(0.07, max(0.62 * outerRim, 0.46 * innerRim)));
  #include <colorspace_fragment>
}
