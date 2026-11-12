precision highp float;
uniform float uDay;
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - .5);
  // a tight core with a soft falloff around it, so a point glows instead of ending at an edge
  float a = (smoothstep(.5, .14, d) * .72 + exp(-d * d * 22.) * .3) * vAlpha;
  if (a < .006) discard;
  // premultiplied, with the alpha that reaches the blend scaled by uDay: at night (0) the point only adds light,
  // in Daylight (1) it covers what is behind it like ink, and the theme change passes smoothly between the two
  gl_FragColor = vec4(vColor * a, a * uDay);
}
