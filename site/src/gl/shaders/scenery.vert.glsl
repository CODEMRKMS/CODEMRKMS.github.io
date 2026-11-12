// Static scenery: dust along the route and the experience timeline.
precision highp float;
uniform float uTime, uPR, uSize, uIntro, uAlphaMul, uSceneDim;
uniform vec3 uC0, uC1, uC2, uNeutral;
attribute vec3 aS; // size, alpha, tone (-1 = neutral)
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mv;
  float tw = .82 + .18 * sin(uTime * (.3 + aS.x) + aS.y * 40.);
  vColor = aS.z < 0. ? uNeutral : (aS.z < .5 ? mix(uC0, uC1, aS.z * 2.) : mix(uC1, uC2, (aS.z - .5) * 2.));
  vAlpha = aS.y * tw * uIntro * uAlphaMul * uSceneDim * smoothstep(.6, 3., -mv.z) * (1. - smoothstep(24., 42., -mv.z));
  gl_PointSize = min(uSize * uPR * aS.x * 8. / max(-mv.z, .1), 10. * uPR);
}
