# Design system: Signal from noise

One idea carries the whole site: a single field of points that starts as noise and keeps
resolving into something that means something. Everything else stays quiet so that idea can work.

## Colour
| Token | Night (default) | Daylight |
|---|---|---|
| `--bg` | `#0C0E14` | `#F3EFE6` (paper) |
| `--fg` | `#ECE8E1` | `#14161D` (ink) |
| `--fg-2` (secondary text) | `#A9A8AE` | `#4A4C57` |
| `--rule` | `rgba(236,232,225,.14)` | `rgba(20,22,29,.16)` |
| `--accent` (amber, the only UI accent) | `#F2A541` | `#8A4F00` (text-safe amber) |
| Point ramp, low | `#5B5BD6` indigo | `#3A3AA8` |
| Point ramp, mid | `#2BB3A3` teal | `#0E7F73` |
| Point ramp, high | `#F2A541` amber | `#B8690A` |

* Amber is used for: the focus ring, link hover, the "Speak" button, the pulse core, failed pipeline points, and the
  gaze layer of the face mesh (irises, rays, reticle, confidence label). Nothing else.
  No gradients on UI, no blobs. Glow belongs to the canvas only: points have a soft falloff and the scene gets a
  thresholded bloom, strong at night and almost off in Daylight. UI elements never glow.
* The canvas is opaque and paints its own background, exactly `#0C0E14` at night and `#F3EFE6` in Daylight. Bloom,
  grain and vignette are applied only to what the particles add, so untouched pixels match the page colour.
* Chromatic aberration appears only while scrolling fast and is zero at rest.
* Night points blend additively; daylight points blend normally (ink on paper).
* Text over the canvas: the shader dims points in the text column (`uTextMask`), so copy sits on near-bare background.
  On stacked (phone) layouts the form sits above the copy and points fade out in the rows that hold text (`uBands`).
  All text pairs are AA or better.

## Type
* Display: **Anybody** (variable, `wdth` 50-150, `wght` 100-900). Headlines rest at wdth 92 and open towards 118 with
  scroll velocity, then settle. That is the type idea: the letters stretch when the page moves.
  Headlines are authored line by line so the width change never re-wraps them.
* Body: **Instrument Sans** 400/500/600.
* Scale (fluid, clamp between 390 and 1440): body 1.0625rem, then 1.25, 1.6, 2.1, 2.9, 4.2-6.4, display up to 11rem.
* Measure: body max `62ch`. Nothing runs past 75ch.
* Sentence case everywhere. No tracked all-caps eyebrows, no monospace labels, no scramble or typewriter text.

## Layout
* 12-column grid, 24px gutters (16px on phones), page margin `clamp(20px, 4vw, 64px)`.
* Placement is asymmetric: text blocks take columns 1-6 or 7-12 and swap sides between sections; the form takes the
  opposite side. Headlines may bleed across the whole grid.
* Section rhythm `clamp(96px, 14vw, 220px)`. Sections that own a form are at least 90svh so the canvas has room.
* Figures (22 fps, 35%...) are large numerals in the display face on a hairline, not boxed cards.

## Motion
* Intro: noise to wordmark in under 2.5s, skippable. Section morphs: 1.5s with per-point stagger up to 45% of the run.
* Page change: the page dissolves into noise while the form becomes a cloud and the camera flies into it along the
  rail; the swap happens under cover; the new page condenses out of the noise as the camera arrives and the headline
  assembles through its line masks. About 1.5s in total.
* Headings reveal on scroll letter by letter inside masked lines; ledes by masked line. Body copy is not animated.
* Stat figures count up once when they enter view. The final text is the authored text, and the real value is
  available to assistive tech throughout.
* Daylight is a change of lighting, 1.6s: a sun climbs an arc, the sky warms, the point palette and the CSS colour
  tokens interpolate together, and points move from adding light to laying down ink.
* `prefers-reduced-motion`: native scroll, no morph, no drift, no dolly; 150ms crossfade between pages.

## Interaction
* Pointer (and a dragging finger) pushes and swirls nearby points on the GPU, in proportion to its speed; a resting
  pointer leaves the form alone. The face is exempt: there the pointer steers the gaze.
* Custom cursor on fine pointers only: a small dot that grows into a ring over links and buttons and into an amber
  disc that names the action ("view" for case studies, "open" for new tabs, mail and the PDF, "drag" for the letter
  pile). Text fields, the terminal and keyboard navigation always get the native cursor; touch never sees it.
* Focus is a 2px amber outline with 3px offset.
* Hover: underline and colour changes, plus two small physical responses on fine pointers. Buttons and calls to
  action are magnetic (they lean up to about 30% of the pointer's offset). Stat blocks, the next-project link and
  the About portrait tilt a few degrees under the pointer (max 9, 5 for the link) and settle back. Nothing tilts or
  moves with reduced motion or on touch.

## Banned
Orbitron, mono `// LABEL` nav, tracked all-caps eyebrows, glitch/typewriter/scramble, cursor dots, scroll gauges,
glass cards in a grid, gradient blobs, neon glow, fade-up on every block, emoji, arrows on every link,
identical rounded shadow cards, connecting-line particle networks.

## Copy
First person, plain, specific. Every claim and number comes from the resume. If the resume does not say it, the site does not.
