precision highp float;
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, .1, d) * vAlpha;
  if (a < .01) discard;
  gl_FragColor = vec4(vColor, a);
}
