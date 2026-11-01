// One vertex shader drives every form. All motion is computed here; the CPU only sets uniforms.
precision highp float;

uniform float uTime, uProgress, uPR, uSize, uScroll, uSection, uChaos, uIntro, uBeat, uMic, uMicOn, uRipple, uDim, uAlphaMul;
uniform float uFormA, uFormB;
uniform vec3 uLayout;   // scale, cx, cy
uniform vec4 uPointer;  // world xy, strength, radius
uniform vec4 uTextMask; // side (-1 left, 0 none, 1 right), edge (ndc), softness, strength
uniform vec3 uC0, uC1, uC2, uNeutral;

attribute vec4 aA, aA2, aB, aB2, aSeed;

varying vec3 vColor;
varying float vAlpha;

vec3 gCol; float gAlpha; float gSize;

float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 hash33(vec3 p) {
  p = fract(p * vec3(.1031, .1030, .0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx) * 2. - 1.;
}
float gnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(
    mix(mix(dot(hash33(i), f), dot(hash33(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
        mix(dot(hash33(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash33(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
    mix(mix(dot(hash33(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash33(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
        mix(dot(hash33(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash33(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y), u.z);
}
// curl of a noise-valued vector potential: divergence free swirl
vec3 curl(vec3 p) {
  const float e = .12;
  vec3 p1 = p + vec3(31.4, 12.7, 5.1), p2 = p + vec3(-8.3, 22.2, 41.7);
  float x = (gnoise(p2 + vec3(0, e, 0)) - gnoise(p2 - vec3(0, e, 0))) - (gnoise(p1 + vec3(0, 0, e)) - gnoise(p1 - vec3(0, 0, e)));
  float y = (gnoise(p + vec3(0, 0, e)) - gnoise(p - vec3(0, 0, e))) - (gnoise(p2 + vec3(e, 0, 0)) - gnoise(p2 - vec3(e, 0, 0)));
  float z = (gnoise(p1 + vec3(e, 0, 0)) - gnoise(p1 - vec3(e, 0, 0))) - (gnoise(p + vec3(0, e, 0)) - gnoise(p - vec3(0, e, 0)));
  return vec3(x, y, z) / (2. * e);
}

vec3 ramp(float t) { t = clamp(t, 0., 1.); return t < .5 ? mix(uC0, uC1, t * 2.) : mix(uC1, uC2, (t - .5) * 2.); }
vec3 divRamp(float s) { return s < 0. ? mix(uNeutral, uC0, -s) : mix(uNeutral, uC2, s); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }

// Animated position, colour, alpha and size of one point in one form.
vec3 form(float id, vec4 P, vec4 E, vec4 S) {
  vec3 p = P.xyz;
  float tone = P.w, t = uTime;
  gAlpha = 1.; gSize = 1.; gCol = ramp(tone);

  if (id < .5) {                                   // 0 stars (and the opening noise)
    if (E.x < .5) {
      p.x -= uScroll * p.z * .24;
      p += .05 * vec3(sin(t * .07 + S.w * 30.), cos(t * .06 + S.z * 30.), 0.);
      float tw = .78 + .22 * sin(t * (.4 + S.w * 1.6) + S.w * 40.);
      gAlpha = tw * (.4 + .6 * S.y);
      gSize = .55 + S.y * .85 + (tone > .97 ? 1.1 : 0.);
    } else if (E.x < 1.5) {                        // award stars
      gSize = 3.4; gAlpha = 1.; gCol = ramp(.97);
    } else {                                       // constellation links
      gSize = .95; gAlpha = .75; gCol = ramp(.55);
    }
  } else if (id < 1.5) {                           // 1 wordmark
    p.z += .03 * sin(t * .8 + S.w * 20.);
    p.xy += .009 * vec2(sin(t + S.z * 30.), cos(t * 1.1 + S.x * 30.));
    gSize = .95; gAlpha = .95; gCol = ramp(tone * .82 + .04);
  } else if (id < 2.5) {                           // 2 head-pose gaze cone
    vec3 HEAD = vec3(-1.6, 0., 0.);
    float yaw = .62 * sin(t * .33) + .1 * sin(t * .9), pitch = .28 * sin(t * .47 + 1.);
    if (E.x < .5) {
      p = rotZ(rotY(p - HEAD, -yaw * .5), pitch * .5) + HEAD;
      gSize = 1.05; gAlpha = .85;
    } else if (E.x < 1.5) {
      p = rotZ(rotY(p - HEAD, -yaw), pitch) + HEAD;
      float band = exp(-pow((E.y - fract(t * .22)) * 7., 2.));
      gCol = ramp(.34 + .6 * E.y);
      gAlpha = .5 + .3 * E.y + band * .6; gSize = .85 + band * .7;
    } else {                                       // 20-30 kHz ultrasonic proximity pulse
      float ph = fract(t * .17 + E.y);
      float R = 1.25 + ph * 2.3;
      p = HEAD + vec3(p.x, p.y, 0.) * R;
      gAlpha = .5 * (1. - ph) * smoothstep(0., .08, ph); gSize = .75; gCol = ramp(.5);
    }
    p = rotX(rotY(p - vec3(.15, 0., 0.), -.34), .12);
  } else if (id < 3.5) {                           // 3 sentiment terrain
    float ridge = E.x, s = E.y;
    p.y += .05 * sin(p.x * 2.2 + t * .8 + p.z) * (.4 + ridge);
    vec2 lp = vec2((uPointer.x - uLayout.y) / uLayout.x, -(uPointer.y - uLayout.z) / uLayout.x * 1.3);
    float d = length(p.xz - lp);
    float rip = sin(d * 5.5 - t * 4.2) * exp(-d * 1.05) * uRipple;
    p.y += rip * .34 * (.3 + ridge * 1.5);
    s = clamp(s + rip * .55, -1., 1.);
    gCol = divRamp(s * 1.15);
    gAlpha = .75 + .25 * ridge; gSize = 1.05;
    p = rotX(rotY(p, -.42), .95);
  } else if (id < 4.5) {                           // 4 voice ring
    float l = E.y, th = E.x, tt = t - l * .55;
    float gate = pow(.5 + .5 * sin(tt * 2.6 + sin(tt * .8) * 2.), 1.6);
    float amp = mix(gate, clamp(uMic * 2.2, 0., 1.5), uMicOn);
    float env = sin(th * 3. + tt * 2.1) * sin(th * 5. - tt * 1.3) * .6 + sin(th * 11. + tt * 7.) * .25 + sin(th * 2. + tt * .7) * .35;
    float R = 1.9 * (1. + .2 * amp * env) + (E.z - .5) * .07;
    p = vec3(cos(th), sin(th), p.z) * R;
    gCol = ramp(clamp(.12 + amp * .5 + abs(env) * .38, 0., 1.));
    gAlpha = (1. - l * .85) * (.55 + .45 * amp); gSize = 1. - l * .3;
    p = rotX(rotY(p - vec3(0., 0., -1.3), -.5), .3);
  } else if (id < 5.5) {                           // 5 pipeline lattice
    if (E.x < .5) {
      float u0 = P.x, v = .045 * E.y;
      float cyc = floor(u0 + t * v), u = fract(u0 + t * v);
      float fail = E.z * step(.5, hash11(cyc * 7.31 + S.x * 50.));
      float s0 = floor(E.w * 5. + .5) / 5.;
      float bump = smoothstep(s0 - .03, s0 + .02, u) * (1. - smoothstep(s0 + .08, s0 + .22, u)) * fail;
      p.x = mix(-3.4, 3.4, u);
      p.y += bump * (S.y > .5 ? 1. : -1.) * 1.25;
      p.z += bump * (S.z - .5) * .9;
      gCol = mix(ramp(tone + .15), ramp(1.), bump);
      gAlpha = smoothstep(0., .06, u) * (1. - smoothstep(.94, 1., u)) * (.75 + .5 * S.y);
      gSize = 1. + bump * .7;
    } else if (E.x < 1.5) { gAlpha = .3; gSize = .7; gCol = ramp(.3); }
    else { gAlpha = .9; gSize = 1.25; gCol = ramp(.62); }
    p = rotX(rotY(p, -.55), .18);
  } else if (id < 6.5) {                           // 6 document lines sorting into Keep / Review / Remove
    float line = E.y, grp = E.z;
    float s = smoothstep(0., 1., clamp(uSection * 1.5 - line * .5, 0., 1.));
    p.y = mix(p.y, E.w, s);
    p.x += s * (grp < .5 ? -.35 : (grp < 1.5 ? 0. : .9));
    gCol = mix(ramp(.4), grp < .5 ? ramp(.5) : (grp < 1.5 ? ramp(1.) : ramp(0.)), s);
    gAlpha = mix(.75, grp > 1.5 ? .4 : .95, s); gSize = .85;
    p = rotY(p, -.28);
  } else {                                         // 7 pulse
    float ph = fract(uBeat);
    float a = smoothstep(0., .05, ph) * exp(-ph * 5.5) + .55 * smoothstep(.2, .25, ph) * exp(-(ph - .2) * 9.);
    if (E.x < .5) {
      p *= 1. + .4 * a;
      gAlpha = .55 + .45 * a; gCol = ramp(.45 + .55 * tone); gSize = 1.05 + a * .9;
    } else {
      p *= 1. + ph * 1.9;
      gAlpha = .08 + .5 * (1. - ph) * (1. - ph); gCol = ramp(.25 + .3 * tone); gSize = .8;
    }
    p = rotY(p, t * .1);
  }
  return p;
}

void main() {
  vec3 pos, col; float alpha, size, mid0 = 0.;
  vec3 pb = form(uFormB, aB, aB2, aSeed);
  if (uProgress >= .9999) {
    pos = pb; col = gCol; alpha = gAlpha; size = gSize;
  } else {
    vec3 cb = gCol; float ab = gAlpha, sb = gSize;
    vec3 pa = form(uFormA, aA, aA2, aSeed);
    float q = clamp(uProgress * 1.45 - aSeed.x * .45, 0., 1.);
    float e = q < .5 ? 4. * q * q * q : 1. - pow(-2. * q + 2., 3.) / 2.;
    pos = mix(pa, pb, e);
    float mid = sin(3.14159265 * e);
    col = mix(gCol, cb, e); alpha = mix(gAlpha, ab, e); size = mix(gSize, sb, e);
    mid0 = mid;
  }
  // one curl evaluation serves both the mid-flight turbulence and the opening noise
  float turb = mid0 * .95 + uChaos * 1.6;
  if (turb > .001) pos += curl(pos * .5 + uTime * .1 + aSeed.yzw * 2.) * turb;

  pos = pos * uLayout.x + vec3(uLayout.yz, 0.);

  vec2 d = pos.xy - uPointer.xy;
  float r2 = dot(d, d), R = uPointer.w;
  float f = exp(-r2 / (R * R)) * uPointer.z;
  pos.xy += d / (sqrt(r2) + .001) * f * .45;
  pos.z += f * .6;

  vec4 mv = modelViewMatrix * vec4(pos, 1.);
  gl_Position = projectionMatrix * mv;

  float nx = gl_Position.x / gl_Position.w;
  float m = uTextMask.x < -.5 ? 1. - smoothstep(uTextMask.y - uTextMask.z, uTextMask.y + uTextMask.z, nx)
          : (uTextMask.x > .5 ? smoothstep(uTextMask.y - uTextMask.z, uTextMask.y + uTextMask.z, nx) : 0.);
  alpha *= (1. - uTextMask.w * m) * (1. - uDim) * uIntro * uAlphaMul * smoothstep(.5, 2.4, -mv.z);

  gl_PointSize = min(uSize * uPR * size * 8. / max(-mv.z, .1), 26. * uPR);
  vColor = col;
  vAlpha = alpha;
}
