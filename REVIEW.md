# Review log

Screenshots were taken with Playwright at 1440, 1024 and 390 px, in night and daylight, for every page and at several scroll positions, plus a frame-by-frame capture of a page transition (home to experience, then Back).
`scripts/shoot.mjs`, `scripts/trans.mjs` and `scripts/sheet.py` reproduce them.

## Pass 1: what I saw and changed
| Found | Change |
|---|---|
| Canvas empty on first run | Shape worker never received its point count. Fixed the `postMessage`. |
| Wordmark fuzzy and its left edge sat 86px in, off the page margin | Less jitter, smaller points, left edge now aligned to the page margin and 72% of the viewport wide. |
| Voice ring read as a crumpled blob | Envelope amplitude 0.38 to 0.2, tunnel depth 2.6 to 1.5. |
| Terrain too dim to read | Higher alpha and point size. |
| Pipeline lanes pale | Brighter stream alpha, larger points. |
| Contact email wrapped ("gmail.co / m") | Fixed size clamp, no wrapping. |
| Scrolled text ran under the header and collided with the brand | Header scrim now solid behind the bar. |
| Awards heading overlapped the first constellation label | Awards became a sticky stage, the heading sits top-left and the stars are shifted down. |

## Pass 2
| Found | Change |
|---|---|
| "Sentiment-driven" clipped at the screen edge in the right-hand column | Headlines in a text column are now sized to the column width, not the viewport. |
| Award labels showed up before the star field had formed and sat on top of the MadTales section | Labels only appear when the star form is the active target. |
| GSAP "target not found" warnings on transitions | Guarded empty line lists. |
| SplitText put `aria-label` on paragraphs (axe: aria-prohibited-attr) | `aria: 'none'`, the text is real and visible. Accessibility 96 to 100. |
| 5.5s main-thread task at boot, text painted late | WebGL boot waits for load and idle; three.js is a separate lazy chunk (main chunk 57 KB gz, field chunk 127 KB gz); Google Fonts CSS no longer blocks render; one curl evaluation instead of two in the shader; software renderers drop to 9k points at DPR 1. |

## Banned-list check
No Orbitron, no monospace nav labels, no tracked all-caps eyebrows, no glitch or scramble text, no custom cursor, no scroll gauge, no tilt cards, no glass cards, no blobs, no glow, no emoji, no arrows on links, no connecting-line networks. Scroll reveals are limited to headings and ledes, by masked line.
The one deliberate "shadow" is a text-shadow in the background colour behind labels that sit over points, for contrast.

## Contrast (WCAG)
Night: `#ECE8E1` on `#0C0E14` about 15:1, `#A9A8AE` about 8:1, amber `#F2A541` about 9:1.
Daylight: `#14161D` on `#F3EFE6` about 15:1, `#4A4C57` about 7.4:1, `#8A4F00` about 5.5:1.
Axe (via Lighthouse) reports no contrast failures on any page checked.

## Known limits
* Lighthouse ran in a machine with no GPU (software WebGL), which inflates Total Blocking Time. See the scores in the final message.
* The VoicePay link on the resume is a placeholder, so none is published.
* Headlines are sized so the width-axis animation never wraps them; a very unusual font fallback could still clip a line.
