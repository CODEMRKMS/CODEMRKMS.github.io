// One vertex shader drives every form. All motion is computed here; the CPU only sets uniforms.
precision highp float;

uniform float uTime, uProgress, uPR, uSize, uScroll, uSection, uChaos, uIntro, uBeat, uMic, uMicOn, uRipple, uDim, uAlphaMul;
uniform float uFormA, uFormB, uTurb, uDrift, uVol, uEnergy, uBeatAmt, uDens, uRepel;
uniform float uDay;                // 0 night (light on dark), 1 Daylight (ink on paper)
uniform vec3 uGaze;                // where the eyes look: xy in -1..1, z = how visible the gaze rays are
uniform vec3 uHead;                // yaw, pitch, roll of the head
uniform vec4 uFace;                // blink, breath, amber flash, height of the scan line
uniform vec2 uEye;                 // how far the irises have turned inside the eyes
uniform vec3 uPipe;                // pipeline: failure, flow offset (negative = rolling back), all-green flash
uniform float uNameHide;           // the wordmark steps aside while its letters are out as a pile
uniform vec4 uBox;                 // detection box around the turned head: centre xy, half size
const vec3 EYE = vec3(EYE_X, EYE_Y, EYE_Z);
uniform vec3 uLayoutA, uLayoutB;   // scale, cx, cy of the form inside its station
uniform vec3 uStationA, uStationB; // world position of the two stations being travelled between
uniform vec3 uFocus;               // what the camera is looking at (centre of the noise cloud)
uniform vec4 uPointer;  // view-space xy per unit depth, strength (pointer speed), radius
uniform float uSwirl;   // signed: how hard points are spun around the pointer
uniform vec2 uPtrVel;   // points near the pointer are carried a little way along its path
uniform vec4 uTextMask; // side (-1 left, 0 none, 1 right), edge (ndc), softness, strength
uniform vec3 uC0, uC1, uC2, uNeutral;
uniform vec2 uBands[3];  // rows of the screen that copy covers (ndc y: top, bottom)
uniform float uBandK;

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

vec3 headTurn(vec3 p) { return rotZ(rotX(rotY(p, uHead.x), uHead.y), uHead.z); }
// a highlight is brighter at night and darker ink in Daylight
vec3 lift(vec3 c, float h) { return mix(c * (1. + .7 * h) + .1 * h, c * (1. - .4 * h), uDay); }

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
    gSize = .95; gAlpha = .95 * (1. - uNameHide); gCol = ramp(tone * .82 + .04);
  } else if (id < 2.5) {                           // 2 face-tracking landmark mesh
    vec2 g = uGaze.xy;
    float blink = uFace.x, grp = E.x;
    vec3 PIV = vec3(0., -.15, -.6);                // the head turns about a point behind the face
    vec3 T = vec3(g.x * 1.5, g.y * .95 + .15, 1.9); // the point being looked at
    vec3 turn = vec3(uEye, 0.);
    if (grp < .5) {                                // the mesh: thin edges, brighter landmarks
      p.y += tone * blink;
      vec3 n = vec3(E.zw, sqrt(max(0., 1. - dot(E.zw, E.zw))));
      p = headTurn(p - PIV) + PIV;
      n = rotY(headTurn(n), .12);
      float mark = step(.75, E.y), outer = step(.25, fract(E.y));
      float facing = smoothstep(-.25, .55, n.z);   // surfaces turned away are dimmer and smaller
      float back = smoothstep(-.8, .3, p.z);       // and so is everything further back
      float rim = max(pow(1. - clamp(n.z, 0., 1.), 3.) * .8, outer * .75);
      float scan = exp(-pow((p.y - uFace.w) * 15., 2.));
      float lit = mix(.16, 1., facing) * mix(.45, 1., back);
      gAlpha = mix(.4, .95, mark) * lit + rim * mix(.3, .15, mark) + scan * .5;
      gSize = mix(.54, .8 + .5 * facing * back, mark) + scan * .3;
      gCol = lift(mix(ramp(.5), ramp(1.), uFace.z), min(1., rim * .7 + scan * .8 + mark * .25));
    } else if (grp < 1.5) {                        // iris ring and pupil, clipped by the lids
      vec3 q = p + turn;
      float open = max(1. - blink, .04);
      float inside = 1. - smoothstep(.85, 1.08, length(q.xy / vec2(EYE_A, EYE_B * 1.25 * open)));
      p = headTurn(vec3(E.y * EYE.x, EYE.y, EYE.z) + q - PIV) + PIV;
      gCol = ramp(1.); gAlpha = inside; gSize = tone > .95 ? 1. : .7;
    } else if (grp < 2.5) {                        // gaze rays: thin, dashed, with a pulse running out
      vec3 c = headTurn(vec3(E.z * EYE.x, EYE.y, EYE.z) + turn - PIV) + PIV;
      float s = E.y;
      p = mix(c, T, s) + p;
      float dash = .5 + .5 * step(.42, fract(s * 16. - t * .7));
      float pulse = exp(-pow((s - fract(t * .4)) * 9., 2.));
      gCol = ramp(1.); gAlpha = (.34 + .26 * s + pulse * .5) * dash * uGaze.z * (1. - blink); gSize = .46 + pulse * .3;
    } else if (grp < 3.5) {                        // reticle on the target
      p = T + p * (1. + .08 * sin(t * 2.4));
      gCol = ramp(1.); gAlpha = .9 * uGaze.z; gSize = .5;
    } else if (grp < 4.5) {                        // detection box: screen aligned, fitted to the head every frame
      vec2 c = uBox.xy + p.xy * uBox.zw - (E.z < .5 ? vec2(p.x * E.y, 0.) : vec2(0., p.y * E.y));
      p = rotY(vec3(c, 0.), -.12);
      gCol = ramp(.5); gAlpha = .8; gSize = .6;
    } else {                                       // pose gizmo at the nose bridge
      vec3 d = E.y < .5 ? vec3(1., 0., 0.) : (E.y < 1.5 ? vec3(0., 1., 0.) : vec3(0., 0., 1.));
      p = headTurn(vec3(0., BRIDGE_Y, BRIDGE_Z + .02) + d * p.x * .36 - PIV) + PIV;
      gCol = E.y < .5 ? ramp(0.) : (E.y < 1.5 ? ramp(.5) : ramp(1.));
      gCol = lift(gCol, .5); gAlpha = .95; gSize = .62 + .6 * step(.9, P.x);
    }
    p = rotY(p, .12) * 1.65 * (1. + .006 * uFace.y);
    p.y += .016 * uFace.y;
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
      float flow = u0 + t * v + uPipe.y * E.y;
      float cyc = floor(flow), u = fract(flow);
      float fail = E.z * step(.5, hash11(cyc * 7.31 + S.x * 50.));
      float s0 = floor(E.w * 5. + .5) / 5.;
      float bump = smoothstep(s0 - .03, s0 + .02, u) * (1. - smoothstep(s0 + .08, s0 + .22, u)) * fail;
      p.x = mix(-3.4, 3.4, u);
      p.y += bump * (S.y > .5 ? 1. : -1.) * 1.25 + uPipe.x * step(.3, S.x) * (S.y - .5) * 1.1;
      p.z += bump * (S.z - .5) * .9;
      gCol = mix(ramp(tone + .15), ramp(1.), max(bump, uPipe.x));
      gCol = lift(mix(gCol, ramp(.5), uPipe.z), uPipe.z * .8);
      gAlpha = smoothstep(0., .06, u) * (1. - smoothstep(.94, 1., u)) * (.75 + .5 * S.y);
      gSize = 1. + bump * .7;
    } else if (E.x < 1.5) { gAlpha = .3; gSize = .7; gCol = mix(ramp(.3), ramp(1.), uPipe.x); }
    else { gAlpha = .9; gSize = 1.25 + uPipe.z * .5; gCol = lift(mix(ramp(.62), ramp(1.), uPipe.x), uPipe.z); }
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

// 1 inside a row of copy, 0 in the clear, with a soft edge
float inBands(float y) {
  float m = 0.;
  for (int i = 0; i < 3; i++) {
    vec2 b = uBands[i];
    m = max(m, (1. - smoothstep(b.x - .01, b.x + .07, y)) * smoothstep(b.y - .07, b.y + .01, y));
  }
  return m;
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
  float f = exp(-r2 / (R * R)) * uPointer.z * uRepel;
  vec2 nrm = d / (sqrt(r2) + .001);
  mv.xy += nrm * f * .5 + vec2(-nrm.y, nrm.x) * f * uSwirl * .55 + uPtrVel * f;
  mv.z += f * .6;

  gl_Position = projectionMatrix * mv;

  float nx = gl_Position.x / gl_Position.w;
  float m = uTextMask.x < -.5 ? 1. - smoothstep(uTextMask.y - uTextMask.z, uTextMask.y + uTextMask.z, nx)
          : (uTextMask.x > .5 ? smoothstep(uTextMask.y - uTextMask.z, uTextMask.y + uTextMask.z, nx) : 0.);
  // depth fade: nothing pops at the lens, and far stations sink into the dark
  float depth = smoothstep(.5, 2.4, -mv.z) * (1. - smoothstep(24., 42., -mv.z)) * mix(1., .62, smoothstep(10., 22., -mv.z));
  alpha *= (1. - uTextMask.w * m) * (1. - uDim) * (1. - uBandK * inBands(gl_Position.y / gl_Position.w)) * uIntro * uAlphaMul * depth;

  gl_PointSize = min(uSize * uPR * uDens * size * 8. / max(-mv.z, .1), 16. * uPR);
  vColor = col;
  vAlpha = alpha;
}
