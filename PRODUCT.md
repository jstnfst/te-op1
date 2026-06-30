# Product

## Register

product

## Users

OP-1 Field owners and the people reverse-engineering its preset format: synth
hobbyists, sound designers, and developers. They arrive with a specific job in
mind - look up what a knob actually does on a given engine, see how a raw value
maps to the displayed one, inspect a `.aif` patch live, or browse and publish
presets to a shared community library. They are technical, impatient with fluff,
and trust the site only as far as the data is correct. Most sessions are
reference-lookup or browse-and-download; uploading requires sign-in (Google,
Microsoft, Yahoo, GitHub), everything else is public.

## Product Purpose

A reference and community library for OP-1 Field presets. It documents the
preset format that Teenage Engineering never published - knob layouts per synth/
FX/LFO engine, raw-to-display value mappings, and a live patch viewer - and pairs
that with a community library where users upload presets as JSON (validated,
tagged, and rebuilt into downloadable `.aif` on demand). Success is a musician
finding the exact parameter answer in seconds, or pulling a working patch onto
their device, without ever doubting that the numbers are right.

## Brand Personality

Technical and precise. An engineer's reference, not a marketing page. Voice is
terse, accurate, and unembellished; the design earns trust by being correct and
fast, not by being persuasive. Three words: **precise, instrument-grade,
unembellished.** The dark monospace surface and single TE-orange accent are the
whole personality - restraint is the point. No hype, no celebration animations,
no convincing the user of anything the data doesn't already prove.

## Anti-references

- **Generic SaaS dashboard.** No card-grid-everything, no gradient hero-metric
  template, no rounded-purple startup chrome. This is a tool, not a product tour.
- **Cutesy / toy aesthetic.** No over-rounded shapes, emoji-as-UI, or gamified
  flourishes. Playfulness that undercuts technical credibility is wrong here.
- **Official TE clone.** Do not imitate teenage.engineering's own site. This is a
  distinct, fan-made reference - it should never be mistaken for first-party.

## Design Principles

- **The data is the product.** Correctness and legibility of parameter values,
  mappings, and patch contents outrank every decorative concern. Never let styling
  obscure or imply precision the numbers don't have.
- **Reference speed over persuasion.** Optimize for the lookup: fast scanning,
  dense-but-readable tables, predictable navigation. Don't make users hunt or wait.
- **Restraint as identity.** One accent (TE-orange), one type family (mono), a
  dark technical surface. Express variety through hierarchy and the scale-type
  color system, not by adding new visual languages.
- **Earned trust, not claimed trust.** Show the actual mapping, the actual patch,
  the actual validation result. Avoid lab-notebook hedging in the UI, but never
  present inferred data as if it were confirmed.
- **Single source of shared chrome.** Header, nav, footer, and theme tokens are
  defined once and shared across the SPA and static reference pages; consistency
  is structural, not re-implemented per page.

## Accessibility & Inclusion

Best-effort, not a gating constraint. The dark monospace aesthetic and its small
chip/label type are intentional and take priority over strict WCAG conformance.
Keep keyboard navigation working and honor `prefers-reduced-motion` where motion
exists, and prefer the more legible choice when it costs nothing - but do not
lighten the design or enlarge type purely to hit AA contrast numbers. Known
trade-offs (muted text near 4.5:1, 8–10px chip labels) are accepted.
