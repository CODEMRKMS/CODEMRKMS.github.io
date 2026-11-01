# Plan

## Routes (each a real prerendered HTML file; Vite multi-page build)
| URL | File | Form (canvas) |
|---|---|---|
| `/` | `site/index.html` | name, then gaze, terrain, voice, pipeline, documents, stars, pulse as you scroll |
| `/work/proctoring/` | `site/work/proctoring/index.html` | gaze cone |
| `/work/quant-trading/` | `site/work/quant-trading/index.html` | volatility terrain |
| `/work/voicepay/` | `site/work/voicepay/index.html` | voice ring |
| `/experience/` | `site/experience/index.html` | pipeline, documents, stars |
| `/about/` | `site/about/index.html` | stars |

Vite root is `site/`. Shared markup (head, header, footer, canvas) lives in `site/partials/` and is inlined by a small
Vite plugin, so every output file is complete HTML and readable without JS. `public/` is copied as is
(resume, robots, sitemap, OG image, photo).

## Source layout
```
site/src/main.ts              boot: theme, Lenis + GSAP ticker, field, router, first page
site/src/gl/field.ts          the one WebGL canvas: geometry, material, morph queue, render loop, adaptive DPR
site/src/gl/shapes.ts         pure procedural generators for the 8 forms, plus the wordmark sampler
site/src/gl/shapes.worker.ts  runs the generators off the main thread
site/src/gl/shaders/          vert.glsl, frag.glsl
site/src/router.ts            link interception, fetch, transition timeline, history
site/src/page.ts              per-page setup: split headings, ScrollTriggers, section forms, page widgets
site/src/type.ts              velocity-driven width axis
site/src/theme.ts             night / daylight toggle (localStorage in try/catch)
site/src/mic.ts               optional microphone level for VoicePay
site/src/styles/              tokens, base, layout, components
scripts/                      OG image, screenshots, review harness
```

## Shader plan
One `THREE.Points` (40k desktop, 12k mobile/low-end), one `ShaderMaterial`.
Attributes: `aA`, `aA2` (shape A: position + tone, extras), `aB`, `aB2` (shape B), `aSeed`.
Each shape is a pair of `BufferAttribute`s generated once; a morph rebinds `aA`/`aB`. No CPU loop over points per frame.

Vertex shader per point:
1. `form(idA, ...)` and `form(idB, ...)` return the animated position, colour, alpha and size of the point in each form.
   The animation (gaze sweep, terrain ripple, voice envelope, pipeline flow and peel-off, document sorting, star parallax,
   heartbeat) lives in those functions.
2. Per-point progress `q = clamp(uProgress * 1.45 - seed.x * 0.45, 0, 1)`, eased with in-out cubic.
3. `pos = mix(posA, posB, e) + curl(pos * k + t) * amp * sin(pi * e)`; curl noise is only evaluated while 0 < q < 1.
4. Layout transform (scale and offset, tweened by GSAP), pointer displacement (uniform), text-column dimming (uniform),
   near-camera fade, size attenuation.

Forms: 0 stars, 1 name, 2 gaze cone, 3 terrain, 4 voice ring, 5 pipeline lattice, 6 document lines, 7 pulse.

## Transition timeline (router)
```
t=0.00  fetch next page (prefetched on hover/focus); lock input
t=0.00  split visible text into masked lines; lines slide out through their masks (0.55s, stagger 0.035)
t=0.10  field.morphTo(nextForm) 1.5s; layout tween; camera dolly z 8 -> 2.4 (0.7s in) -> 8 (0.9s out)
t=0.65  swap <main>, title, description, canonical, aria-current; history push; scroll to top; rebuild ScrollTriggers
t=0.70  new headline and lede lines slide in through masks (0.8s, stagger 0.07)
t=1.70  unlock
```
Back/forward use the same timeline reversed (text exits downward, dolly pulls back first).
Reduced motion: swap with a 150ms crossfade, field set instantly.

## Perf plan
* three imported by name (tree-shaken), GSAP core + ScrollTrigger + SplitText, Lenis. Target under 300 KB gzipped JS.
* Shapes generated in a Web Worker; the wordmark is sampled on the main thread (needs the loaded font), a few ms.
* DPR capped at 1.75; if the 30-frame average exceeds 20 ms, DPR steps down by 0.25 to 1.0, then the draw range shrinks.
* Rendering stops when the tab is hidden or the canvas is not intersecting; reduced motion renders on demand only.
* Fonts from Google Fonts with `display=swap` and preconnect. Hero copy is real HTML so LCP is text.
* Pointer handling updates two uniforms; no per-frame DOM reads except Lenis velocity.

## Fallbacks and a11y
* No WebGL: `html.no-gl` shows a CSS star field and the name as real type. No JS: same, plus all content.
* Canvas is `aria-hidden`; landmarks header, nav, main, footer; skip link; visible focus; AA contrast.
