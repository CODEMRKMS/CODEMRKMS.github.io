// One vertex shader drives every form. All motion is computed here; the CPU only sets uniforms.
precision highp float;

uniform float uTime, uProgress, uPR, uSize, uScroll, uSection, uChaos, uIntro, uBeat, uMic, uMicOn, uRipple, uDim, uAlphaMul;
uniform float uFormA, uFormB, uTurb, uDrift, uVol, uEnergy, uBeatAmt, uDens;
uniform vec3 uGaze;                // where the face looks: xy in -1..1, z = how much the cursor is in charge
const vec3 EYE = vec3(EYE_X, EYE_Y, EYE_Z);
uniform vec3 uLayoutA, uLayoutB;   // scale, cx, cy of the form inside its station
uniform vec3 uStationA, uStationB; // world position of the two stations being travelled between
uniform vec3 uFocus;               // what the camera is looking at (centre of the noise cloud)
uniform vec4 uPointer;  // view-space xy per unit depth, strength, radius
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
  } else if (id < 2.5) {                           // 2 face mesh, tracked eyes, gaze lines
    // where the eyes are looking: a slow wander, or the cursor when uGaze.z says so
    vec2 wander = vec2(.7 * sin(t * .33) + .15 * sin(t * .9), .45 * sin(t * .47 + 1.));
    vec2 g = mix(wander, uGaze.xy, uGaze.z);
    // the head turns at most about 25 degrees (including the fixed quarter turn below); the eyes do the rest
    float yaw = clamp(g.x * .3, -.3, .3), pitch = clamp(-g.y * .22, -.22, .22);
    vec3 PIV = vec3(0., 0., -.25);
    vec3 T = vec3(g.x * 1.5, g.y * .95 + .1, 1.9);  // the point being looked at
    float grp = E.x;
    float away = smoothstep(.18, .5, length(g));
    if (grp < .5) {                                // the head: mesh, landmarks, features
      p = rotX(rotY(p - PIV, yaw), pitch) + PIV;
      if (E.y < .5) { gSize = .72; gAlpha = .5; }
      else if (E.y < 1.5) { gSize = 1.25; gAlpha = .95; gCol = ramp(.5); }
      else { gSize = .95; gAlpha = .95; gCol = ramp(.36 + tone * .25); }
    } else if (grp < 1.5) {                        // irises turn inside the eye
      vec3 c = vec3(E.y * EYE.x, EYE.y, EYE.z) + vec3(g.x * .078, g.y * .04, 0.);
      p = rotX(rotY(c + p - PIV, yaw), pitch) + PIV;
      gSize = 1.05; gAlpha = 1.; gCol = ramp(.97);
    } else if (grp < 2.5) {                        // gaze lines from each eye to the target
      vec3 c = vec3(E.z * EYE.x, EYE.y, EYE.z) + vec3(g.x * .078, g.y * .04, 0.);
      c = rotX(rotY(c - PIV, yaw), pitch) + PIV;
      float s = E.y;
      p = mix(c, T, s) + p * (.4 + s);
      float band = exp(-pow((s - fract(t * .35)) * 7., 2.));
      gCol = ramp(.4 + .55 * s);
      gAlpha = (.42 + .3 * s + band * .6) * away; gSize = .7 + band * .7;
    } else if (grp < 3.5) {                        // reticle on the target
      p = T + p * (1. + .12 * sin(t * 2.4));
      gSize = 1.; gAlpha = .95 * away; gCol = ramp(1.);
    } else {                                       // 20-30 kHz ultrasonic proximity pulse
      float ph = fract(t * .17 + E.y);
      p = vec3(p.x, p.y, 0.) * (1.15 + ph * 1.5) + vec3(0., 0., -.3);
      gAlpha = .42 * (1. - ph) * smoothstep(0., .08, ph); gSize = .7; gCol = ramp(.5);
    }
    p = rotY(p, .12) * 1.65;
  } else if (id < 3.5) {                           // 3 candlestick landscape
    float sgn = E.y, colx = E.z, ph = E.w, kind = E.x;
    float depth = mix(.38, 1., smoothstep(-1.7, 1.7, p.z));   // the far series sit back
    float live = smoothstep(.82, 1., colx);        // the newest candles are still trading
    float n1 = .5 * sin(t * 1.7 + ph * 40.) + .5 * sin(t * 2.9 + ph * 17.);
    float sweep = exp(-pow((colx - fract(t * .11)) * 9., 2.));
    if (kind < 1.5 || kind > 3.5) {                // bodies, wicks and volume bars stretch about their base
      float k = 1. + live * .4 * n1 + uVol * (1.5 * abs(sin(t * 5. + ph * 50.)) + .7 * n1);
      p.y = tone + (p.y - tone) * k;
      if (kind < 1.5) p.y += (live * .05 + uVol * .3) * sin(t * (2. + uVol * 5.) + ph * 90.);
      // when the market panics, candles flip colour
      sgn *= 1. - 2. * step(.5, hash11(floor(t * 6.) + ph * 91.)) * step(.3, uVol);
      gCol = divRamp(sgn * (.85 + .15 * sweep));
      gAlpha = (kind < .5 ? .92 : (kind < 1.5 ? .8 : .4)) + sweep * .3;
      gSize = (kind < .5 ? .72 : .58) + sweep * .2 + uVol * .25;
    } else if (kind < 2.5) {
      gCol = uNeutral; gAlpha = .26; gSize = .5;
    } else {                                       // moving average
      p.y += uVol * .25 * sin(t * 6. + colx * 30.);
      gCol = ramp(.5); gAlpha = .8 + sweep * .2; gSize = .6 + sweep * .4;
    }
    gAlpha *= depth;
    p = rotX(rotY(p, -.4), .36);
  } else if (id < 4.5) {                           // 4 voice ring
    float l = E.y, th = E.x, tt = t - l * .55;
    float gate = pow(.5 + .5 * sin(tt * 2.6 + sin(tt * .8) * 2.), 1.6);
    float amp = mix(gate, clamp(uMic * 2.2, 0., 1.5), uMicOn) + uEnergy * .8;
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
  } else {                                         // 7 a calm, breathing core; the heartbeat only shows on demand
    float ph = fract(uBeat);
    float hb = smoothstep(0., .05, ph) * exp(-ph * 5.5) + .55 * smoothstep(.2, .25, ph) * exp(-(ph - .2) * 9.);
    float br = .5 + .5 * sin(t * .55);
    if (E.x < .5) {
      p *= 1. + mix(.07 * br, .4 * hb, uBeatAmt);
      float a = mix(.25 + .2 * br, hb, uBeatAmt);
      gAlpha = .55 + .45 * a; gCol = ramp(.45 + .55 * tone); gSize = 1.05 + a * .9;
    } else {
      p *= mix(1. + .05 * br + .015 * sin(t * .9 + S.w * 20.), 1. + ph * 1.9, uBeatAmt);
      gAlpha = mix(.2 + .14 * br, .08 + .5 * (1. - ph) * (1. - ph), uBeatAmt); gCol = ramp(.25 + .3 * tone); gSize = .8;
    }
    p = rotY(p, t * .06);
  }
  return p;
}

vec3 place(vec3 p, vec3 lay, vec3 st) { return p * lay.x + vec3(lay.yz, 0.) + st; }

void main() {
  vec3 pos, col; float alpha, size, mid = 0.;
  if (uProgress >= .9999) {
    pos = place(form(uFormB, aB, aB2, aSeed), uLayoutB, uStationB); col = gCol; alpha = gAlpha; size = gSize;
  } else if (uProgress <= .0001) {
    pos = place(form(uFormA, aA, aA2, aSeed), uLayoutA, uStationA); col = gCol; alpha = gAlpha; size = gSize;
  } else {
    vec3 pb = place(form(uFormB, aB, aB2, aSeed), uLayoutB, uStationB);
    vec3 cb = gCol; float ab = gAlpha, sb = gSize;
    vec3 pa = place(form(uFormA, aA, aA2, aSeed), uLayoutA, uStationA);
    // every point leaves on its own schedule, so the form streams from one station to the next
    float q = clamp(uProgress * 1.45 - aSeed.x * .45, 0., 1.);
    float e = q < .5 ? 4. * q * q * q : 1. - pow(-2. * q + 2., 3.) / 2.;
    pos = mix(pa, pb, e);
    mid = sin(3.14159265 * e);
    col = mix(gCol, cb, e); alpha = mix(gAlpha, ab, e); size = mix(gSize, sb, e);
  }

  // one curl evaluation serves the resting drift, the mid-flight turbulence and the noise cloud
  // At rest the field is coherent, so a form sways as one body and its lines stay sharp. In flight and in
  // the noise cloud every point reads its own patch of the field, which is what scatters them.
  float turb = mid * .95 * uTurb + uDrift * .014;
  if (turb > .001 || uChaos > .001) {
    float own = clamp(mid * uTurb * 2. + uChaos * 2., 0., 1.);
    vec3 cn = curl(pos * mix(.3, .5, own) + uTime * mix(.05, .1, own) + aSeed.yzw * 2. * own);
    pos += cn * turb;
    if (uChaos > .001) {
      float c = clamp(uChaos * 1.5 - aSeed.w * .5, 0., 1.);
      c = c * c * (3. - 2. * c);
      vec3 npos = uFocus + (aSeed.xyz - .5) * vec3(15., 8.5, 9.) + cn * 1.3;
      pos = mix(pos, npos, c);
      col = mix(col, ramp(aSeed.x), c * .8);
      alpha = mix(alpha, .3 + .55 * aSeed.y, c);
      size = mix(size, .55 + aSeed.y * .9, c);
    }
  }

  vec4 mv = modelViewMatrix * vec4(pos, 1.);

  // the pointer pushes points aside, measured in view space so it works wherever the camera is
  vec2 d = mv.xy - uPointer.xy * (-mv.z);
  float r2 = dot(d, d), R = uPointer.w;
  float f = exp(-r2 / (R * R)) * uPointer.z;
  mv.xy += d / (sqrt(r2) + .001) * f * .45;
  mv.z += f * .6;

  gl_Position = projectionMatrix * mv;

  float nx = gl_Position.x / gl_Position.w;
  float m = uTextMask.x < -.5 ? 1. - smoothstep(uTextMask.y - uTextMask.z, uTextMask.y + uTextMask.z, nx)
          : (uTextMask.x > .5 ? smoothstep(uTextMask.y - uTextMask.z, uTextMask.y + uTextMask.z, nx) : 0.);
  // depth fade: nothing pops at the lens, and far stations sink into the dark
  float depth = smoothstep(.5, 2.4, -mv.z) * (1. - smoothstep(24., 42., -mv.z));
  alpha *= (1. - uTextMask.w * m) * (1. - uDim) * uIntro * uAlphaMul * depth;

  gl_PointSize = min(uSize * uPR * uDens * size * 8. / max(-mv.z, .1), 16. * uPR);
  vColor = col;
  vAlpha = alpha;
}
