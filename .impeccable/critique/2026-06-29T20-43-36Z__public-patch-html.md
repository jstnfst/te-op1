---
target: public/patch.html
total_score: 28
p0_count: 0
p1_count: 0
timestamp: 2026-06-29T20-43-36Z
slug: public-patch-html
---
# Critique — public/patch.html (Patch Viewer)

## Design Health Score: 28/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live two-way updates, ok/err status, undo-disabled state. No explicit "loaded" confirmation. |
| 2 | Match System / Real World | 3 | Fluent OP-1 domain language; jargon is correct for the audience. |
| 3 | User Control & Freedom | 3 | Undo + editable JSON, but no redo and no revert-to-loaded. |
| 4 | Consistency & Standards | 2 | Two error colors (#F87171 vs --orange); two control radii (3px vs 4px token). |
| 5 | Error Prevention | 3 | JSON validated before update/save, octave constrained, keys re-sorted. |
| 6 | Recognition vs Recall | 2 | No on-page legend for the scale-type colors. |
| 7 | Flexibility & Efficiency | 4 | Keyboard sliders, per-engine clipboard, pickers, undo, direct JSON. |
| 8 | Aesthetic & Minimalist | 3 | Clean/on-brand but dense full-width simultaneous surface. |
| 9 | Error Recovery | 3 | Inline Invalid JSON message, network-error messages; slightly raw. |
| 10 | Help & Documentation | 2 | Inline hints + one GitHub link only; no how-to, no color key. |

## Anti-Patterns Verdict
NOT AI slop — distinctive domain-built instrument (draggable ADSR oscilloscope, 15 engines, bidirectional JSON editing). Detector: 18 findings, all advisory (10 color-drift, 8 radius-drift), zero structural slop. Legit one-offs not yet in DESIGN.md: #E3A87E notice amber, rgba white scope text, #F87171 error red, 3px micro-radius. No browser overlay (dev server down, no browser tool).

## Priority Issues
- [P2] Functional readout labels below readable contrast: .ro rgba(255,255,255,.4) and scope-sub .32 on #0D0E11 land ~2:1. These are the ADSR data values. Fix: bump readout caption/value toward ~4:1. Command: audit/colorize.
- [P2] No on-page legend for the eight scale-type colors (key lives on display.html). Recognition-vs-recall miss on the Color-Is-Data system. Fix: inline collapsible legend or tooltips. Command: clarify/layout.
- [P2] Two error vocabularies (#F87171 red toolbar vs --orange site-wide) + 3px/4px radius drift. Fix: standardize on --orange OR add documented --danger token; tokenize 3px. Command: extract then polish.
- [P3] Thin help/orientation for newcomers — help is one GitHub link in raw-JSON details. Auto-loaded sample mitigates. Fix: one-line orientation near editor header. Command: clarify/onboard.

## Persona Red Flags
- Alex (power user): no redo; wants editor-focus shortcut. Otherwise excellent.
- Sam (a11y): focusable announced sliders + reduced-motion good; low-contrast readouts fail; color-only meaning on scale-type values.
- Marin (OP-1 tinkerer): served by knob maps + scope; frustrated by no color legend and no revert/compare.

## Minor Observations
- Raw parser text in JSON error (a line hint would help).
- .toolbar-status absolute toast may overlap first knob row on short viewports.
- No redo despite clean undo stack.

## Questions to Consider
- Always-visible legend on this page (where decoding matters most)?
- Revert/compare worth more than redo for the tinkerer?
- A focused reading mode for shared ?id= arrivals?
