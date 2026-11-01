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

* Amber is used for: the focus ring, link hover, the "Speak" button, the pulse core, failed pipeline points. Nothing else.
  No gradients on UI, no glow, no blobs.
* Night points blend additively; daylight points blend normally (ink on paper).
* Text over the canvas: the shader dims points in the text column (`uTextMask`), so copy sits on near-bare background.
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
* Page change: lines of text leave through their own mask, the field morphs while the camera dollies through it
  (z 8 to 2.4 to 8), then the new headline assembles through masks. About 1.7s in total.
* Only headings and ledes reveal on scroll, and only by masked line. Body copy is not animated.
* `prefers-reduced-motion`: native scroll, no morph, no drift, no dolly; 150ms crossfade between pages.

## Interaction
* Pointer displaces nearby points on the GPU. No custom cursor. Focus is a 2px amber outline with 3px offset.
* Hover states are underline and colour changes only.

## Banned
Orbitron, mono `// LABEL` nav, tracked all-caps eyebrows, glitch/typewriter/scramble, cursor dots, scroll gauges,
tilt cards, glass cards in a grid, gradient blobs, neon glow, fade-up on every block, emoji, arrows on every link,
identical rounded shadow cards, connecting-line particle networks.

## Copy
First person, plain, specific. Every claim and number comes from the resume. If the resume does not say it, the site does not.
