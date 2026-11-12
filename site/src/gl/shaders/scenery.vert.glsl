// Static scenery: dust along the route and the experience timeline.
precision highp float;
uniform float uTime, uPR, uSize, uIntro, uAlphaMul, uSceneDim;
uniform vec3 uC0, uC1, uC2, uNeutral;
uniform vec2 uBands[3];
uniform float uBandK;
attribute vec3 aS; // size, alpha, tone (-1 = neutral)
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mv;
  float band = 0., ny = gl_Position.y / gl_Position.w;
  for (int i = 0; i < 3; i++) band = max(band, (1. - smoothstep(uBands[i].x - .01, uBands[i].x + .07, ny)) * smoothstep(uBands[i].y - .07, uBands[i].y + .01, ny));
  float tw = .82 + .18 * sin(uTime * (.3 + aS.x) + aS.y * 40.);
  vColor = aS.z < 0. ? uNeutral : (aS.z < .5 ? mix(uC0, uC1, aS.z * 2.) : mix(uC1, uC2, (aS.z - .5) * 2.));
  vAlpha = aS.y * tw * uIntro * uAlphaMul * uSceneDim * (1. - uBandK * band) * smoothstep(.6, 3., -mv.z) * (1. - smoothstep(24., 42., -mv.z))
    * (aS.z > .45 ? 1. - smoothstep(12., 19., -mv.z) : 1.);   // the timeline and its years belong to their own station: gone from further away
  gl_PointSize = min(uSize * uPR * aS.x * 8. / max(-mv.z, .1), 10. * uPR);
}
