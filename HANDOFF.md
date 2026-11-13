# Handoff: portfolio v2

Branch `v2`. `main` is untouched, so the live site has not changed. The approved plan and the audit are summarised
in this file; `PLAN.md`, `DESIGN.md` and `REVIEW.md` still describe v1 and have not been updated yet.

## Done

**1a. Audit fixes**
- Fonts are self-hosted (`public/fonts/`, latin subsets, preloaded). Boot starts after first paint instead of
  `window.load`. In a local run the three.js chunk now starts at about 0.4 s; before, it waited about 8 s on the
  Google Fonts stylesheet.
- The width-axis animation (`type.ts`) writes only to on-screen headings from a cached list.
- Resize is debounced and keyed to the canvas size (CSS `100lvh`), so a phone address bar no longer resizes the scene.
- Empty SplitText line lists no longer reach GSAP (the "target not found" warnings are gone).

**1b. One continuous world**
- `gl/rail.ts`: every `[data-form]` section is a station in world space. Sections with the same form share a station.
- `page.ts`: one scrubbed ScrollTrigger maps scroll to a route position; `field.setPos()` follows it with damping.
  Timed morphs are gone, so the form can no longer lag a section behind.
- Particles stream from station to station; dust along the route gives parallax.
- Experience stations (`data-t="2026"` etc.) sit on a sideways timeline with year markers.
- Page transitions: `field.dissolve()` turns the form into a noise cloud, the router swaps `<main>`, `field.resolve()`
  condenses the new page's form. The intro uses the same cloud and runs under 2 s.

**1c. Set pieces**
- Face (form id 2): replaced in item 2 below.
- Candles (`genCandles`, form id 3): three series of wireframe candlesticks with wicks, moving averages and volume
  bars. Scroll speed already drives `uVol` (volatility).
- Voice ring reacts to scroll energy. The contact form breathes and only beats on email hover.
- `?n=12000` forces a point count, `?noadapt` disables adaptive quality, `?debug` exposes `window.__field`.

**Fixes after the face review**
- Head turn is clamped to about 25 degrees including the fixed quarter turn; the irises take the rest of the tracking.
- The quant-trading case study line now reads "Scroll fast and the candles turn volatile."

**Item 1 (second session): phone readability**
- Stacked layouts (under 900 px wide, or portrait) keep the top half of the screen free: `.sec[data-form]` gets
  `padding-top: 50svh`, project heroes 54svh, and `layoutFor` puts the form in that space.
- `page.ts` measures which rows of the viewport hold copy and sends up to three bands to both vertex shaders
  (`uBands`, `uBandK`); points fade out inside them, so no line crosses text in either theme. Body copy sits on the
  bare background colour (fg-2 on bg is 7.6:1 in Daylight, 8:1 at night).
- The form/copy side-by-side layout now needs 900 px as well as a landscape aspect, matching the CSS breakpoint.

**Item 2 (second session): face rebuilt as a landmark mesh (approved)**
- Geometry is the MediaPipe canonical face model (468 landmarks, 898 triangles) in `gl/facemesh.ts`. Apache 2.0;
  the notice and licence text ship in `public/licenses/mediapipe.txt`. `faceGeo()` in `shapes.ts` cuts the eye and
  mouth openings, opens the lids a little, and computes normals, edges and blink travel.
- `genFace` spends points on the tracking layer first (irises, gaze rays, reticle, detection box, pose gizmo), then
  on the landmarks, then evenly along the edges. No outline strokes, no outer rings.
- Shading in `vert.glsl`: points facing away or further back are dimmer and smaller, rim light on the silhouette,
  scan line every 5.6 s, amber flash hook (`field.lookAway()`, for the tab-return egg).
- `faceTick` in `field.ts` runs the head, eyes, saccades, blinks and breathing on the CPU, so the labels show the
  same values the shader draws. `hud.ts` is the DOM read-out (confidence, yaw, pitch, gaze, fps).
- Low tier (12k points or fewer): no labels, no gizmo. Pointer repel is almost off on the face (`uRepel`).
- `node scripts/face.mjs <outDir> [night|day]` shoots the four review captures.

**Item 3 (1d): post-processing, GPU tiers, ?fps**
- `gl/post.ts`: scene into a target, thresholded bloom on a 2 to 4 level down/up chain, chromatic aberration from
  scroll speed (zero at rest), grain and vignette applied only to what the particles added. Daylight flips the sign
  (ink bleed) and cuts bloom to about a sixth.
- The canvas is opaque (`alpha: false`) and the scene draws its own background quad. Sampled pixels are exactly
  `#0C0E14` and `#F3EFE6`. The canvas stays hidden until its first frame (`html.gl-on`).
- `gl/quality.ts`: tier (high 40k / mid 22k / low 12k points) from the renderer string, then a ladder of levels
  (DPR cap 2, bloom levels, share of points drawn) driven by a 30-frame probe. It steps down after two slow windows
  and back up after a run of good ones, waiting longer each time a step up fails. `?tier=high|mid|low`, `?n=`,
  `?noadapt` override. Low tier has no post pass at all. A software renderer starts at 9k points, DPR 1.
- `?fps` shows frame time, tier, level, points, DPR and bloom (`fps.ts`, lazy).
- Face fixes from the review: the detection box is fitted every frame to the projected outline of the turned head
  (`faceTick`, `uBox`); the read-out shows tracking rate (about 22 fps) and inference time (under 120 ms) from the
  case study copy with a small wobble, not the page's frame rate.
- Sweep at 375 / 768 / 1440 / 2560, night and Daylight. Fixed: year labels of far stations showing through other
  sections, the pulse core burning out under bloom, stars crossing the awards list on phones, forms going faint
  on tall screens (points now scale with viewport height).

**Item 4: easter eggs (all lazy; `site/src/eggs/`)**
- `eggs/index.ts` loads on idle and only wires listeners. Terminal, pile and confetti load on first use.
- Console: ASCII greeting, a line for recruiters, a hint about the terminal. Typing `hi` in the console counts it.
- Backtick terminal (`terminal.ts`): modal `<dialog>` docked to the bottom, output is a live `role="log"`. Commands:
  help, whoami, projects, resume, sudo hire-me (confetti), theme, matrix, exit, clear, `git push --force`
  (`field.forcePush()`: the pipeline turns amber and scatters, runs backwards, then flashes green; the page scrolls
  to the Volvo section if there is one). Answers are page copy.
- Konami (`pile.ts`): the name becomes DOM letters with a small circle physics step; drag and throw; Esc or the
  hint button restores. The particle wordmark hides meanwhile (`field.hideName`).
- Tab return on a face section: toast "caught you looking away", `field.lookAway()` flashes the mesh amber and
  drops the confidence label.
- Counter: "eggs found: n/8" in the footer after the first find (localStorage `eggs`), confetti at 8/8. The eight:
  console, terminal, hire, force, konami, away, eyes (cursor steering the gaze), volatile (fast scroll on candles).
- With reduced motion only the console and the terminal exist, and the terminal's animations are off.
- `node scripts/eggs.mjs <outDir>` is a smoke test of all of the above.

**Item 5: interaction and motion**
- Daylight: `field.setTheme(t, true)` tweens `day.v` for 1.6 s; `applyDay` interpolates palette, size, alpha and
  background, and drives a sun and warm horizon in the background quad (both zero at rest). Points use one
  premultiplied blend (`ONE, ONE_MINUS_SRC_ALPHA`) with alpha scaled by `uDay`, so additive night and ink-on-paper
  day are the two ends of one mode. CSS tokens are registered with `@property` and transition for the same 1.6 s
  (`html.theme-anim`); browsers without `@property` switch instantly.
- Router: `dissolve.ts` steps a tiling noise mask across `<main>` (out 0.6 s, in 0.85 s) while `field.dissolve` /
  `resolve` fly the camera (z, sideways drift and roll). Fixed on the way: a new page now really starts at the top
  (ScrollTrigger was restoring the previous page's scroll on refresh).
- Pointer: repel, swirl (`uSwirl`) and carry (`uPtrVel`) scale with pointer speed; touch drags feed the same path.
- `motion.ts`: count-up on `.fig-n` (sr-only real value while it runs, original text restored), magnetic
  `.btn/.cta/.mail/.theme-toggle`, tilt on `.fig/.next-link/.portrait`. Headings split into chars inside line masks.
- `cursor.ts`: custom cursor, fine pointers only, lazy. States link / view / open / drag; native for text fields,
  dialogs and after Tab.
- `node scripts/motion.mjs <outDir>` (TIER=high for the post path) captures the theme change, cursor, count-up
  and a page transition.

**Item 6: reduced motion, keyboard, contrast, Lighthouse (done)**
- Software-only browsers (SwiftShader, llvmpipe) get the no-WebGL page. `gpuAvailable()` in `quality.ts` asks from a
  worker (OffscreenCanvas) before three.js is downloaded and only falls back to a main-thread probe when a worker
  cannot tell. `?nogl` forces the fallback; `?noadapt` / `?tier=` / `?n=` keep the scene on (capture scripts use these).
- Cold start: `Post.warm()` compiles each material against the target it is really drawn into. Before, the scene
  shader was compiled for the canvas and then again, synchronously, for the bloom target: a 5 s main-thread freeze on
  a first visit. Measured on this machine's Radeon with an empty shader cache: ready in 5.6 s with no long task (was
  10.3 s with a 5 s freeze); 0.55 s on repeat loads.
- While the scene is not drawing yet, the real `<h1>` name fades in after 1.3 s (`html.gl:not(.gl-on) .hero-name`)
  and gives way to the particles on the first frame. The copy below does not move. Checked visually.
- Reduced motion: every home form reviewed at 1440 night and 375 Daylight. Still, legible poses. Nothing to fix.
- Keyboard: `node scripts/a11y.mjs <outDir> keys` tabs through all six pages. Every stop has a focus ring, the order
  follows the page, nothing is covered. Fixed and verified: `scroll-padding` on `html` (nothing lands under the header
  or on the bottom edge, forwards or backwards); hash links the router intercepts (skip link, `#work`, `#contact`)
  move focus to their target.
- Contrast: `node scripts/a11y.mjs <outDir> contrast` compares each text colour with the pixels really behind it
  (background, particles, bloom), at every scroll stop. All six pages pass AA at 1440 (tier high) and 375 (tier mid)
  in both themes. One real failure fixed: the small "Next" label over the previous form now has its own patch of
  background. Two flags are not failures: an egg toast covering a paragraph, and a button sliding under the header.
- No-WebGL page: the awards list was invisible at 900 px and wider (the star-label layout is now scoped to
  `html.gl`); the hero name overflowed a 375 px screen. Award titles are inline, so no detail line starts with a comma.
- Lighthouse mobile (installed Chrome, headless, real GPU, scene running): home 0.92 performance / 1.00
  accessibility, proctoring 0.92 / 1.00, `?nogl` 0.98 / 1.00. The margin on performance is thin: TBT is about 300 ms,
  mostly one task in `main` around the first frame.

**Item 7 (started)**
- `site/404.html` -> `dist/404.html` (GitHub Pages serves it for unknown paths): a stars hero, "Not found", a link
  home. No mini-game yet. `vite preview` does not serve it for unknown paths; open `/404.html` to see it.

## Known issues
- `old-site/` is dead code still in the repo.
- A first visit still waits about 5 s for the driver to compile the point shader (asynchronously; the page is usable
  and shows the text name meanwhile). Shortening it means simplifying `vert.glsl`.
- Run the audits one page at a time (`PAGES=/ SIZES=1440x900`): a full pass with the preview server was killed once
  when the machine ran low on memory.

## Real GPU
Headless Chromium started with `--ignore-gpu-blocklist --enable-gpu` uses this machine's AMD Radeon (integrated).
Measured there: 60 fps at 40k points, DPR 1, bloom 4 levels, top level of the high tier. Still unmeasured: a phone,
DPR 2, and fill rate while the camera flies between stations. All screenshots so far are SwiftShader at DPR 1.

## Remaining work, in the approved order
1. **Item 7, only if budget remains**: 404 mini-game, idle Pong, name-click doodle, sound toggle, gyroscope
   parallax, no-WebGL SVG drawings, text-selection egg. Keep the counter at n/8.
2. Rewrite the cursor, tilt and glow lines in `DESIGN.md`; update `PLAN.md` and `REVIEW.md`.
## How to run
```
npm run build && npx vite preview --port 4173
node scripts/cap.mjs <outDir> 1440x900 night "/@[data-form=face]"   # viewport captures; see the header of the script
```
