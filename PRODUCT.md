# Product

## Register

product

## Users

Two audiences, served by two paths that split at the landing page:

- **Musicians (LIBRARY).** OP-1 Field owners who want sounds. They browse,
  search by engine and tag, open a patch to see how it's built, and download the
  `.aif` to copy onto the device. Browsing and downloading are public; signing in
  (Google, Microsoft, Yahoo, GitHub) is only for uploading, liking, favorites, and
  building packs.
- **Engineers (LAB).** The people reverse-engineering the preset format: sound
  designers and developers who look up what a knob does on a given engine, how a
  raw value maps to the displayed one, or what is inside a given `.aif`.

Both are impatient with fluff and trust the site only as far as the data is
correct.

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
unembellished.** Titles, hero lines, card descriptions, CTAs, and other
single-sentence UI text carry no trailing period; only multi-sentence paragraphs
end in periods. The dark monospace surface and single TE-orange accent are the
whole personality - restraint is the point. No hype, no celebration animations,
no convincing the user of anything the data doesn't already prove.

**Landing exception.** The landing page (`/`) is the one place the site is
allowed to catch the eye: an oversized title, a live scope, and the Library / Lab
fork. Its motion is pointer-gated (it runs only while the mouse is over the hero
or a fork panel) and freezes under reduced motion. Every page past the fork,
and the patch editor in particular, stays precise and unembellished.

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
- **One click to the right path.** The landing page asks one question: Library or
  Lab. After that, each path shows only its own information and its own sub-nav.
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
