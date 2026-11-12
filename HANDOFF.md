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
- Face (`genFace`, form id 2): procedural mesh, landmarks, lids, brows, nose, lips, irises, gaze lines to a reticle,
  ultrasonic rings. The eyes already follow the cursor while it moves.
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

## Known issues
- Daylight still uses the v1 instant palette swap (no sun arc, no premultiplied blend). That is Step 2 work.
- `adapt()` in `field.ts` still only steps quality down. `gl/quality.ts` in 1d replaces it.
- No 404 page yet. `old-site/` is dead code still in the repo.
- A `vite preview` process from this session may still be listening on port 4173.

## Only tested on a software renderer
Every capture and timing here came from headless Chromium on SwiftShader. Nothing has been measured on a real GPU:
- frame rate at 40k points on a laptop and 12k on an Android phone
- fill rate while the camera flies through the particle stream between stations
- the look of additive blending at real DPR (captures were DPR 1)

Checked: `npm run build` passes; home face and candles sections at 1440 and 375, night and Daylight, no console
errors. Not checked for these commits: 768 and ultrawide, the case-study, experience and about pages in Daylight,
reduced motion, keyboard navigation, Lighthouse.

## Remaining work, in the approved order
1. **1d**: `gl/post.ts` (bloom, chromatic aberration on fast scroll, film grain), opaque canvas with its own sky,
   built together with `gl/quality.ts` (GPU tiers, DPR cap 2, quality that can step back up) and the `?fps`
   overlay, so bloom never ships without a low tier.
2. **Cheap eggs**: console greeting, backtick terminal (including the `git push --force` bonus), Konami pile,
   "caught you looking away" on tab return, footer counter "eggs found: n/8". Eye-follow and scroll-driven
   volatility already work and only need registering with the counter.
3. **Step 2**, in this order: Daylight sun transition, router transition polish, pointer repel and swirl,
   split-text and count-up, magnetic and tilt, custom cursor.
4. **Reduced-motion and keyboard/contrast checks**, including the phone readability issue above.
5. **Only if budget remains**: 404 game, Pong idle egg, name-click doodle, sound, gyroscope, no-WebGL SVG
   drawings, the text-selection egg. Keep the counter at n/8 and adjust which eggs count if some are deferred.
6. Rewrite the cursor, tilt and glow lines in `DESIGN.md`; update `PLAN.md` and `REVIEW.md`.

## How to run
```
npm run build && npx vite preview --port 4173
node scripts/cap.mjs <outDir> 1440x900 night "/@[data-form=face]"   # viewport captures; see the header of the script
```
