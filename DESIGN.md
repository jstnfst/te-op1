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
  ceiling - this system never shouts louder than 30px, with one exemption below.
- **Landing Display** (800, clamp(44px, 6.4vw, 88px), line-height .98, -0.035em):
  the landing page title only (`.land-title`), with a 300-weight muted sub-line at
  .62em. Tight negative tracking keeps mono legible at this size. Nowhere else.
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
- **Path switch:** The header row carries a two-key **LIBRARY | LAB** selector
  (`.group-switch`) - the site's primary nav. The active key is lit: Surface
  Graphite fill, white label, and a lit LED dot. Each path owns an LED
  color: **LIBRARY = Signal Orange, LAB = Trace Blue**. Inactive keys show a dim
  LED that tints faintly toward its color on hover. The landing scope carries the
  same pair (LIB / LAB), lit while that fork panel is under the pointer. These
  two LEDs are the only place Trace Blue stands in for a path.
- **Sub-nav:** The second row is a flat tab row for the current path only.
  10px uppercase tracked labels at ~32% white, hover ~72% white, **active** tab
  full white with a 2px Signal Orange bottom border. The landing page belongs to
  neither path and shows no sub-nav row.
  - LIBRARY: BROWSE · PACKS · FAVES · MINE · UPLOAD (FAVES and MINE signed-in only)
  - LAB: LAYOUT · MAPPINGS · INSPECTOR · ISSUES (GitHub sessions only)
  - The patch viewer opened with `?id=` or `?pack=` belongs to LIBRARY; opened bare it is the LAB inspector.
    The editor follows the same split: LAB shows the **Samples** picker; LIBRARY replaces it with
    **Pack** (All my patches, or one of your packs) and **Patch** (that pack's patches, others'
    marked "by …"), mirrored in the URL as `?pack=&id=`. With a pack picked, Save new also adds
    the copy to that pack. A pack's page links its owner in via **Edit in patch editor**.
  - MOD (admins) sits in the auth area, not in either path.
- **Mobile:** Tabs wrap (`flex-wrap`); the `//` separator and fw tag hide under 640px.

### Landing Fork (signature)
Two large Surface Graphite panels, one per path, each with a hardware key
(A / B), a 30px title, a muted description, a glyph, and a tracked CTA. On
hover/focus the border brightens, the key lights Signal Orange, a soft light
follows the pointer. The Library panel's knob is a real control: pointer X
across the panel turns it through 16 detents (all + each engine). The dialed
engine sets the panel's link (`/library?type=…`), its CTA (with the public patch
count from `/api/patches/counts`), and the scope above. The Lab panel is the same kind of
control: pointer X dials through the knob-layout reference (overview, then every
synth, FX, and LFO engine and the ADSR, from `public/layout-params.js`, the table the
Layout page renders). The scope's readouts show the dialed engine's real knob names,
and the panel's link opens that engine's card on the Layout page
(`/lab/layout#fx.spring`, scrolled to and framed in orange); the overview position
opens `/lab`. As the visual, the ADSR glyph draws in once and a read-head follows the
pointer, and the scope morphs into the same envelope drawn as stepped raw values.
Below 900px the scope is hidden: it is pointer-driven, and on small (usually touch)
screens it would only push the two paths below the fold. Otherwise the scope (same language as the patch page's
ADSR scope) shows a stylized per-engine waveform that crossfades as the knob turns.

### Format Map (signature)
The Lab home (`/lab`, `src/pages/Lab.tsx`) joins the two reference tables into one
view: `public/layout-params.js` (which parameter sits at each array index) and
`public/mapping-data.js` (how that slot's raw value displays; the same table the
Mappings page renders). A grid holds one row per engine (grouped Synth, Envelope,
FX, LFO) and one column per array index. Each cell is filled with its slot's
scale-type color, so the colors are data. Firmware constants are hatched
Knob Null, and unused slots are an empty hairline outline. The legend keys (sorted
by count) are toggles that dim every other type. Hovering a cell previews it in
the slot panel; a click pins it, and the URL keeps it (`?e=adsr&i=4`). Arrow keys
walk the grid with a roving tabindex. The sticky slot panel shows the engine's
eight slot keys, the slot's name and scale chip, and the slot's knob. The knob
uses the same model as the patch editor (`public/knob-model.js`: each knob's raw
travel and its raw → display formula), so it reads exactly as the editor does.
Percent and centered knobs turn continuously over their travel (drag up/right, Shift
for fine; arrows step 1%). Selectors step through their named options, and scales
without a general formula (discrete, hz, tempo, ...) step through their known
points. Under the knob, a raw axis spans the knob's travel, filled to the current
value. Each knob starts mid-travel (a centered knob at 0). Detented knobs ease between detents; turning knobs follow the drag 1:1.
Under 900px the panel
stacks above the map.

### Selection Toolbar (signature)
The first line of a long list's sticky bar (`SelectionToolbar` in `src/packs.tsx`,
inside `.listbar`) on every selectable patch list: Browse, Mine, Favorites, and a
pack page. It is shown before anything is picked, so the affordance is explicit: a
muted hint says what selecting is for, and the actions (**Download N as .zip**,
**Add to pack ▾** with one find-or-create field that searches your packs
server-side, plus page extras such as a pack owner's **Remove from pack**) stay
disabled until something is selected. **Select all** exists only on a pack's page,
where "all" is small and bounded (a pack holds at most 200, the selection cap); the
big lists select by press, drag, and shift-click instead. A disabled primary goes
neutral: orange marks only a live action. With a selection the bar gains an
orange-tinted border and the "Floating bar" shadow. Cards and list rows
select on a press in their empty space (their own links and buttons keep working).
Pressing and dragging paints: every card from the pressed one to the one under the
pointer takes the pressed card's new state, dragging back restores the ones left
behind, and the page auto-scrolls at the edges. Shift-click selects a range from
the last card clicked. Touch keeps tap-to-toggle; the 16px checkbox is visual for
pointers and stays focusable for keyboard (Space). The pack menu drops down from
the toolbar.

### Long Lists
Every list that can grow large (Browse, Community packs, Your packs, Mine,
Favorites, a pack's patches) is a `LongList` (`src/LongList.tsx` +
`src/useLongList.ts`): the page scrolls as if all N items were present, but only the
rows near the viewport (plus 3 overscan rows each side) are in the DOM and they are
recycled as you scroll. Pages of 24 load on demand as their rows approach; until
then a row shows **static** placeholders (muted blocks, no shimmer, per the
Pointer-Gated Motion Rule). The list's sticky bar (`.listbar`, under the site header
via `--site-header-h`) has two lines: the selection line (when selectable), then a
right-aligned line with the count and a pager, `⏮ ‹ Page [ n] of N › ⏭`. The page
number tracks the scroll position and is mirrored to the URL (`?page=`, or
`?ppage=` / `?ypage=` for a page's second list); jumps are instant, never smooth.
Leaving a list (e.g. opening a patch) and coming back returns to the same item.
Offsets are frozen per listing (`asof`), so items published mid-scroll don't shift
pages; a muted "N new · Refresh" line offers them. The list ends with "That's all N
…".

## 6. Motion

**The Pointer-Gated Motion Rule.** Nothing moves on its own. Ambient motion
exists only on the landing page, and only while a mouse or pen is over the
hero/fork region. It eases to a stop when the pointer leaves. No autoplay
loops, no scroll-triggered reveals, no motion on any reference or library page
beyond hover/press feedback. Touch and keyboard users get the static end state
(on tap/focus). `prefers-reduced-motion: reduce` freezes all of it. The patch
editor is out of scope for added motion.

**Hero background.** The landing hero (and the log in page, `src/pages/login.css`) sits on a raymarched shader
(`src/landing/HeroShader.tsx`, WebGL2), not a gradient. It is the one
exception to the rule above: it plays on its own (`u_time` = seconds since
playback started), pausing while off screen or in a hidden tab, and
`prefers-reduced-motion` holds its first frame. Its
colors are custom properties on `.hero` (`--hero-ground`, `--hero-ink-1..3`,
`--hero-glow`), taken from the scale-type palette (%, centered %, decimal) so
the landing speaks the Lab's color language; the shader only blends them by
depth. The hero fades it out to `--bg` before the fork panels. Without WebGL2
the hero is plain `--bg`.

## 7. Do's and Don'ts

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
- **Do** gate any ambient motion on the pointer being in the region, and honor reduced motion.

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
- **Don't** add looping, autoplaying, or scroll-triggered motion; don't exceed 30px display type outside the landing title.
