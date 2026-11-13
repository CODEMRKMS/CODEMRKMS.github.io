/**
 * Hand-written post pass. The scene (background included) is drawn into a target, a thresholded copy is
 * blurred down and back up a short chain, and one final pass adds the bloom, chromatic aberration,
 * grain and a vignette. Everything is expressed as "what the particles changed about the background",
 * so a pixel nothing touched comes out as exactly the background colour.
 */
import {
  BufferAttribute, BufferGeometry, Camera, CustomBlending, LinearFilter, Mesh, NoBlending, OneFactor, RGBAFormat, Scene, ShaderMaterial,
  UnsignedByteType, Vector2, Vector3, WebGLRenderTarget, type WebGLRenderer,
} from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`;

// keep what is brighter than the background at night (darker in Daylight), above a soft threshold, at half size
const PREFILTER = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uTexel; uniform vec3 uBg; uniform float uSign, uThr;
varying vec2 vUv;
void main() {
  vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-.5, -.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(.5, -.5)).rgb
          + texture2D(tSrc, vUv + uTexel * vec2(-.5, .5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(.5, .5)).rgb) * .25;
  vec3 d = max((c - uBg) * uSign, 0.);
  float l = max(d.r, max(d.g, d.b));
  gl_FragColor = vec4(d * smoothstep(uThr, uThr + .22, l), 1.);
}`;
const DOWN = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1., -1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1., -1.)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1., 1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1., 1.)).rgb;
  gl_FragColor = vec4(c * .125, 1.);
}`;
const UP = /* glsl */ `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uGain;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-.75, -.75)).rgb + texture2D(tSrc, vUv + uTexel * vec2(.75, -.75)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-.75, .75)).rgb + texture2D(tSrc, vUv + uTexel * vec2(.75, .75)).rgb;
  gl_FragColor = vec4(c * .25 * uGain, 1.);
}`;
const FINAL = /* glsl */ `
precision highp float;
uniform sampler2D tScene, tBloom; uniform vec3 uBg; uniform float uSign, uBloom, uCA, uGrain, uVig, uTime;
varying vec2 vUv;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  vec2 d = vUv - .5;
  vec3 c = texture2D(tScene, vUv).rgb;
  if (uCA > 0.) {                                   // colour fringes that grow towards the edges; nothing at rest
    vec2 o = d * uCA * (.35 + 2.6 * dot(d, d));
    c.r = texture2D(tScene, vUv + o).r;
    c.b = texture2D(tScene, vUv - o).b;
  }
  vec3 light = c - uBg;                             // what the particles added to (or, in Daylight, took from) the background
  vec3 glow = texture2D(tBloom, vUv).rgb * uBloom;
  glow /= 1. + max(glow.r, max(glow.g, glow.b)) * 1.3;   // dense cores keep their colour instead of burning out
  light += uSign * glow;
  light *= 1. - uVig * smoothstep(.42, 1., length(d) * 1.414);
  float amt = max(abs(light.r), max(abs(light.g), abs(light.b)));
  light += (hash(gl_FragCoord.xy + fract(uTime) * vec2(113., 71.)) - .5) * uGrain * min(1., amt * 5.);
  gl_FragColor = vec4(uBg + light, 1.);
}`;

export interface PostParams { bg: Vector3; day: number; ca: number; time: number }

export class Post {
  private rtScene: WebGLRenderTarget | null = null;
  private mips: WebGLRenderTarget[] = [];
  private scene = new Scene();
  private cam = new Camera();
  private quad: Mesh;
  private pre: ShaderMaterial;
  private down: ShaderMaterial;
  private up: ShaderMaterial;
  private fin: ShaderMaterial;
  private w = 0;
  private h = 0;
  private levels = 0;

  constructor() {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mk = (frag: string, uniforms: Record<string, { value: unknown }>) =>
      new ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: NoBlending });
    this.pre = mk(PREFILTER, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uBg: { value: new Vector3() }, uSign: { value: 1 }, uThr: { value: 0.16 } });
    this.down = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new Vector2() } });
    this.up = mk(UP, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uGain: { value: 1 } });
    this.up.blending = CustomBlending; this.up.blendSrc = OneFactor; this.up.blendDst = OneFactor;
    this.fin = mk(FINAL, {
      tScene: { value: null }, tBloom: { value: null }, uBg: { value: new Vector3() }, uSign: { value: 1 },
      uBloom: { value: 1 }, uCA: { value: 0 }, uGrain: { value: 0.05 }, uVig: { value: 0.3 }, uTime: { value: 0 },
    });
    this.quad = new Mesh(geo, this.pre);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  private target(w: number, h: number) {
    return new WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
      format: RGBAFormat, type: UnsignedByteType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    });
  }

  /** size in device pixels and the number of blur levels; rebuilds the targets only when something changed */
  configure(w: number, h: number, levels: number) {
    if (w === this.w && h === this.h && levels === this.levels) return;
    this.dispose();
    this.w = w; this.h = h; this.levels = levels;
    if (levels <= 0) return;
    this.rtScene = this.target(w, h);
    for (let i = 0; i < levels; i++) this.mips.push(this.target(w >> (i + 1), h >> (i + 1)));
  }
  get active() { return this.levels > 0 && !!this.rtScene; }

  /**
   * Compile everything a frame will need before the first frame, without blocking where the driver allows it.
   * three.js keys a program on the kind of target it draws into, so each material is compiled against the target
   * it will really be used with: the scene into the scene target, the blur passes into a mip, the composite onto
   * the canvas. Compiled against the wrong one, the whole scene shader is built again, synchronously, on first draw.
   */
  async warm(r: WebGLRenderer, scene: Scene, camera: Camera) {
    const rt = this.rtScene, mip = this.mips[0];
    if (!this.active || !rt || !mip) { r.setRenderTarget(null); await r.compileAsync(scene, camera); return; }
    r.setRenderTarget(rt);
    const main = r.compileAsync(scene, camera);
    const rest: Promise<unknown>[] = [];
    for (const m of [this.pre, this.down, this.up]) { this.quad.material = m; r.setRenderTarget(mip); rest.push(r.compileAsync(this.scene, this.cam)); }
    this.quad.material = this.fin; r.setRenderTarget(null);
    rest.push(r.compileAsync(this.scene, this.cam));
    await Promise.all([main, ...rest]);
  }

  private pass(r: WebGLRenderer, mat: ShaderMaterial, to: WebGLRenderTarget | null) {
    this.quad.material = mat;
    r.setRenderTarget(to);
    r.render(this.scene, this.cam);
  }

  /** the caller's scene must paint its own background: nothing here clears */
  render(r: WebGLRenderer, scene: Scene, camera: Camera, p: PostParams) {
    const rt = this.rtScene!;
    r.setRenderTarget(rt);
    r.render(scene, camera);

    // Daylight draws ink on paper, so "bright" means darker than the background and the bloom is subtracted, weakly
    const sign = p.day > 0.5 ? -1 : 1;
    const U = this.pre.uniforms;
    U.tSrc.value = rt.texture; (U.uTexel.value as Vector2).set(1 / rt.width, 1 / rt.height);
    (U.uBg.value as Vector3).copy(p.bg); U.uSign.value = sign;
    this.pass(r, this.pre, this.mips[0]);
    for (let i = 1; i < this.mips.length; i++) {
      const src = this.mips[i - 1];
      this.down.uniforms.tSrc.value = src.texture; (this.down.uniforms.uTexel.value as Vector2).set(1 / src.width, 1 / src.height);
      this.pass(r, this.down, this.mips[i]);
    }
    for (let i = this.mips.length - 1; i > 0; i--) {
      const src = this.mips[i];
      this.up.uniforms.tSrc.value = src.texture; (this.up.uniforms.uTexel.value as Vector2).set(1 / src.width, 1 / src.height);
      this.pass(r, this.up, this.mips[i - 1]);
    }

    const F = this.fin.uniforms;
    F.tScene.value = rt.texture; F.tBloom.value = this.mips[0].texture;
    (F.uBg.value as Vector3).copy(p.bg); F.uSign.value = sign;
    // strong at night, barely there in Daylight; both fade to nothing halfway through a theme change
    F.uBloom.value = (p.day > 0.5 ? 0.14 : 0.85) * Math.abs(1 - 2 * p.day) * (this.mips.length >= 4 ? 1 : 0.8);
    F.uCA.value = p.ca; F.uTime.value = p.time;
    F.uGrain.value = p.day > 0.5 ? 0.03 : 0.07;
    F.uVig.value = 0.3;
    this.pass(r, this.fin, null);
  }

  dispose() {
    this.rtScene?.dispose(); this.rtScene = null;
    this.mips.forEach((m) => m.dispose()); this.mips = [];
  }
}
