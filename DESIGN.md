---
name: OP-1 Field Reference
description: A dark, monospace, instrument-grade reference and patch library for the OP-1 Field.
colors:
  bg: "#15161A"
  surface: "#1F2127"
  border: "#31343C"
  text: "#E7E5E0"
  muted: "#8C8A86"
  header-bg: "#0D0E11"
  signal-orange: "#FF4800"
  orange-on: "#160a04"
  blue: "#3B9EEA"
  purple: "#8B5CF6"
  green: "#22C55E"
  danger: "#F87171"
  orange-ink: "#E3A87E"
  knob-null: "#4A4E57"
  scope-edge: "#000000"
  scope-ink: "#FFFFFF"
  c-percent: "#5B8DEF"
  c-centered: "#A78BFA"
  c-discrete: "#34D399"
  c-selector: "#F59E0B"
  c-hz: "#F97316"
  c-tempo: "#EC4899"
  c-inverse: "#14B8A6"
  c-decimal: "#06B6D4"
typography:
  display:
    fontFamily: "JetBrains Mono, Courier New, monospace"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "0.02em"
  title:
    fontFamily: "JetBrains Mono, Courier New, monospace"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  section:
    fontFamily: "JetBrains Mono, Courier New, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.18em"
  body:
    fontFamily: "JetBrains Mono, Courier New, monospace"
    fontSize: "13px"
    fontWeight: 300
    lineHeight: 1.85
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, Courier New, monospace"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.2em"
rounded:
  chip: "2px"
  control: "4px"
  card: "6px"
  panel: "8px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "18px"
  lg: "32px"
  xl: "80px"
components:
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-default-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary:
    backgroundColor: "{colors.signal-orange}"
    textColor: "#160a04"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "18px 20px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  chip-action:
    backgroundColor: "rgba(255,72,0,0.18)"
    textColor: "{colors.signal-orange}"
    rounded: "{rounded.chip}"
    padding: "2px 6px 1px"
  chip-tag:
    backgroundColor: "rgba(91,141,239,0.18)"
    textColor: "{colors.blue}"
    rounded: "{rounded.chip}"
    padding: "2px 6px 1px"
---

# Design System: OP-1 Field Reference

## 1. Overview

**Creative North Star: "The Oscilloscope"**

This is an instrument readout, not a website. A near-black field holds a single
hot signal color - Signal Orange - while small, precise, monospace labels glow
against the dark. Everything reads like the panel of a measurement device: the
data is the figure, the surface is ground, and the one accent is the live trace.
Trust is earned by legibility and accuracy, never by persuasion. The whole
personality is carried by three decisions - dark surface, one type family, one
accent - and the discipline to add nothing else.

Density is deliberate. Reference tables, knob maps, and patch internals are the
content, so type runs small and tight and the layout favors fast scanning over
breathing room. Where variety is needed, it comes from the **scale-type color
system** - eight signal colors that classify how a raw value maps to its display
form - not from new shapes, gradients, or decoration. Color here is data, not mood.

This system explicitly rejects the generic SaaS dashboard (no gradient hero
metrics, no rounded-purple startup chrome, no card-grid-as-homepage), the cutesy
toy aesthetic (no emoji-as-UI, no over-rounded gamified flourishes), and any
impersonation of teenage.engineering's own first-party site. It is a distinct,
fan-made instrument.

**Key Characteristics:**
- Near-black surface with one hot accent (Signal Orange, ≤10% of any screen)
- Monospace everywhere - JetBrains Mono is the entire type voice
- Small, tracked, uppercase labels as the dominant UI text
- Color is classification (the scale-type system), not decoration
- Flat surfaces; depth appears only on interaction
- Tactile, mechanical controls - hairline borders, tight radii

## 2. Colors

A near-black neutral ramp under one hot orange accent, plus an eight-color
classification palette reserved exclusively for value-mapping data.

### Primary
- **Signal Orange** (#FF4800): The one live trace. Reserved for primary actions,
  the active nav underline, the focus ring, selection state, and action chips.
  Teenage Engineering's signature orange, used as the panel's single hot signal -
  never as a fill for large areas, never as decoration.

### Secondary
- **Trace Blue** (#3B9EEA): Secondary signal - derived tags and the `tag` chip
  variant. Cool counterweight to the orange.
- **Module Purple** (#8B5CF6): Sparingly, for tertiary categorical accents.
- **Confirm Green** (#22C55E): Success/valid states only (`.ok`).
- **Danger Red** (#F87171): The one error/failure color - invalid JSON, failed saves,
  network errors (`.error`, `.err`, `.toolbar-status.err`). Never orange.
- **Orange Ink** (#E3A87E): Readable amber text on orange-tinted *informational*
  notices (`.patch-notice`, `.file-msg.note`, `.dbox-note`). Info, not error.

### Tertiary - The Scale-Type Palette
Eight colors that classify how a raw parameter value maps to its displayed value.
These appear **only** as small chips and data accents in the mappings/patch views,
never as UI chrome:
- **Percent Blue** (#5B8DEF), **Centered Violet** (#A78BFA), **Discrete Green**
  (#34D399), **Selector Amber** (#F59E0B), **Hz Orange** (#F97316), **Tempo Pink**
  (#EC4899), **Inverse Teal** (#14B8A6), **Decimal Cyan** (#06B6D4).

### Neutral
- **Panel Black** (#15161A): The body field - the oscilloscope ground.
- **Header Black** (#0D0E11): Sticky header and floating bars; one step darker than the field.
- **Surface Graphite** (#1F2127): Cards, inputs, raised controls.
- **Hairline** (#31343C): Borders, dividers, dashed dropzones.
- **Readout White** (#E7E5E0): Primary text - warm off-white, never pure #FFF on body.
- **Muted Gray** (#8C8A86): Secondary/label text. Sits near the AA floor by design.
- **Knob Null** (#4A4E57): Dim mark for inactive knob-dial ticks and param indices. Shared in `site.css`.

### The Oscilloscope Scope (sub-surface)
The signature ADSR scope is a self-contained instrument screen - white ink on a
near-black field - with its own `--scope-*` ink ramp (defined locally in
`patch.html`): **Scope Edge** (#000, the 1px rim), **Scope Ink** (#fff, readout
values at 19:1), **Scope Label** (white .58, 6.85:1), **Scope Sub** (white .5,
5.36:1, subtitle + readout captions), **Scope Grid** (white .07, decorative grid).
This is the one place pure white is correct - it's a screen, not the body field.

### Named Rules
**The One Signal Rule.** Signal Orange appears on ≤10% of any screen. It marks
exactly one thing per context - the primary action, the active tab, the focus
ring. If two oranges compete on a screen, one is wrong.

**The Color-Is-Data Rule.** The eight scale-type colors are forbidden as UI
chrome. They classify value mappings and nothing else. A scale-type color on a
button or a nav item is a bug.

**The Orange-Is-Not-Error Rule.** Signal Orange is the brand color - primary,
active, focus, selection. It is never an error color. Errors and failures use
Danger Red (`--danger`). Orange-tinted *info* notices are allowed (that's brand
emphasis, not failure) and use Orange Ink for text; an error in orange is a bug.

## 3. Typography

**Display / Body / Label Font:** JetBrains Mono (with Courier New, monospace fallback)

**Character:** One monospace family does all the work. There is no second
typeface and there never should be. Hierarchy comes from weight (300/400/700/800),
size, letter-spacing, and case - not from pairing. The fixed-width rhythm is the
instrument's voice: every glyph on a grid, like a readout.

### Hierarchy
- **Display** (800, 30px, line-height 1.15, +0.02em): Page hero titles only. The
  ceiling - this system never shouts louder than 30px.
- **Title** (700, 16px, 1.3): Card titles, patch names, primary row labels.
- **Section** (700, 11px, +0.18em, UPPERCASE): The dominant section header (`h2`).
  Tracked, uppercase, muted - a labeled panel divider, not a headline.
- **Body** (300, 13px, 1.85): Lead/intro prose. Light weight, generous leading,
  capped ~620px (≈65–75ch) for readability against the dark field.
- **Label** (700, 10px, +0.2em, UPPERCASE): Eyebrows, nav buttons, button text,
  chips (8px). The workhorse UI text - small, tracked, uppercase.

### Named Rules
**The One Family Rule.** JetBrains Mono is the entire type system. Adding a second
family - a serif for "elegance", a humanist sans for "warmth" - breaks the
instrument metaphor. Forbidden.

**The Tracked-Label Rule.** Small UI text (≤11px) is always uppercase with
≥0.14em tracking. At this size the tracking is what makes mono legible; never ship
tight small-caps.

## 4. Elevation

Flat by default. Surfaces sit on the dark field with a hairline border and no
shadow at rest; the system conveys depth through tonal layering (Header Black <
Panel Black < Surface Graphite) far more than through shadow. Shadow is a
**response to state**, not an ambient decoration - it appears on hover and on
floating, transient elements (the selection bar, popover menus), where it reads
as the element lifting off the panel.

### Shadow Vocabulary
- **Hover lift** (`box-shadow: 0 6px 24px rgba(0,0,0,.5)`): Cards on hover, paired
  with a -2px translate. The card rises toward the user.
- **Header seat** (`box-shadow: 0 2px 16px rgba(0,0,0,.3)`): The sticky header's
  seam against scrolling content.
- **Floating bar** (`box-shadow: 0 8px 30px rgba(0,0,0,.55)`): The selection bar
  and popover menus - clearly detached, hovering above the field.

### Named Rules
**The Flat-At-Rest Rule.** Surfaces are flat until touched. Any element with a
resting drop shadow is wrong unless it is a transient floating control. Depth at
rest comes from the tonal ramp, not from shadow.

## 5. Components

Controls feel **tactile and mechanical** - hardware buttons on an instrument
panel. Hairline borders, tight radii, and clear hover/press feedback. They read
as physical parts, not decorated rectangles.

### Buttons
- **Shape:** Tight corners (4px radius), 9px×14px padding, 11px uppercase tracked label.
- **Default:** Surface Graphite fill, Hairline border, Readout White text. Hover
  shifts the border to Readout White - the control "lights up" on approach.
- **Primary:** Signal Orange fill with near-black text (#160a04) and orange border.
  Hover brightens (filter brightness 1.08). One primary per context.

### Chips
- **Action chip:** Translucent Signal Orange (rgba(255,72,0,.18)) bg, orange text,
  2px radius, 8px uppercase. Marks engine/category.
- **Tag chip:** Same shape in Trace Blue (rgba(91,141,239,.18)) for derived tags.
- **Scale-type chips:** Eight variants, each a translucent tint of its
  classification color over the matching text color. Data only - never chrome.

### Cards / Containers
- **Corner Style:** 6px radius - slightly softer than controls, still tight.
- **Background:** Surface Graphite on Panel Black, Hairline border.
- **Shadow Strategy:** Flat at rest; "Hover lift" shadow + -2px translate + border
  brightening to #474b54 on hover (see Elevation).
- **Internal Padding:** 18px 20px 16px.
- **Selected:** Signal Orange border + 1px inset orange ring.

### Inputs / Fields
- **Style:** Surface Graphite fill, Hairline border, 4px radius, 12px mono text.
  Textareas preserve whitespace (`white-space: pre`) for JSON.
- **Focus:** Global 2px Signal Orange outline, 2px offset (`:focus-visible`).
- **Dropzone:** Dashed Hairline border, 8px radius - clearly an input target.

### Navigation
- **Style:** Flat tab row in the Header Black bar. 10px uppercase tracked labels at
  ~32% white. Hover lifts to ~72% white; **active** tab is full white with a 2px
  Signal Orange bottom border. A `nav-sep` divides Reference from Library groups.
- **Mobile:** Tabs wrap (`flex-wrap`); the sub-title hides under 640px.

### Selection Bar (signature)
A fixed, centered floating bar (`.selbar`) that rises from the bottom when patches
are multi-selected - Header Black fill, panel radius (8px), "Floating bar" shadow,
with an upward popover menu for pack assignment. The instrument's transient
command surface.

## 6. Do's and Don'ts

### Do:
- **Do** keep Signal Orange (#FF4800) to ≤10% of any screen - one live signal per context.
- **Do** use Danger Red (`--danger`, #F87171) for every error/failure state; keep Signal Orange for brand/primary/active/focus only.
- **Do** use JetBrains Mono for everything; express hierarchy through weight, size,
  tracking, and case.
- **Do** uppercase and track (≥0.14em) any UI text ≤11px.
- **Do** keep surfaces flat at rest; let depth come from the tonal ramp (Header
  Black < Panel Black < Surface Graphite) and reserve shadow for hover and floating bars.
- **Do** reserve the eight scale-type colors strictly for value-mapping data.
- **Do** keep prose columns ≤~620px (≈65–75ch) against the dark field.

### Don't:
- **Don't** build the generic SaaS dashboard - no gradient hero metrics, no
  rounded-purple startup chrome, no card-grid-as-homepage as the default answer.
- **Don't** drift into a cutesy/toy aesthetic - no emoji-as-UI, no over-rounded
  gamified flourishes that undercut technical credibility.
- **Don't** imitate teenage.engineering's first-party site; this is a distinct, fan-made tool.
- **Don't** introduce a second font family for "elegance" or "warmth."
- **Don't** use a scale-type classification color as UI chrome (button, nav, border).
- **Don't** put a resting drop shadow on a static surface - flat at rest, lift on interaction.
- **Don't** use pure #FFFFFF on the body field; Readout White (#E7E5E0) is the text white.
- **Don't** signal an error with orange - orange is the brand. Errors are Danger Red (`--danger`).
