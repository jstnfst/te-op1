---
score: 22
p0: 0
p1: 2
p2: 3
timestamp: 2026-06-29T22-26-30Z
slug: browse-upload-my-patches-packs
---
Method: dual-agent (A: design review · B: detector + manual scan)

Both agents agree on: eyebrow-on-every-page (banned pattern), window.confirm/window.prompt aesthetic breaks, double card-eyebrow in Browse cards, label inconsistency. No conflicts. Detector's single advisory (#160a04 undocumented) is real — A missed it. A caught runtime/data issues the detector can't see (silent failures in del(), toggle()). No false positives.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Grid replaces loading text during search — jarring content jump. Toggle and delete fire with no in-flight state. |
| 2 | Match System / Real World | 3 | "Upload" in nav, "Publish" on button — mixed verb for same action. Engine IDs (drwave, dbox, dsynth) raw in the dropdown. |
| 3 | User Control and Freedom | 2 | No undo for delete. No clear-filters affordance. window.prompt flow blocks forward progress if dismissed. |
| 4 | Consistency and Standards | 3 | "Download .aif" (Browse) vs. ".aif" (MyPatches) — same action, two labels. "Account" eyebrow used for both My Patches and Packs. |
| 5 | Error Prevention | 2 | Toggle public fires immediately — no in-flight guard, no confirmation. del() has no try/catch. |
| 6 | Recognition Rather Than Recall | 2 | Two filter inputs look identical; no AND-logic hint; no result count; tag-click-to-filter has no visible affordance. |
| 7 | Flexibility and Efficiency | 2 | No select-all. No sort. Search requires explicit Submit. Batch download/pack exists — the one power-user win. |
| 8 | Aesthetic and Minimalist Design | 3 | Double card-eyebrow rows collapse into identical-weight noise. Delete exposed at equal weight to Open. Otherwise clean. |
| 9 | Error Recovery | 2 | del() has no try/catch — patch vanishes from UI even if DELETE fails. toggle() same issue. Raw error messages exposed verbatim. |
| 10 | Help and Documentation | 1 | No tooltips. Empty state "No patches found." has no recovery path. Engine names unexplained. |
| **Total** | | **22/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment**: Not immediately AI-obvious — instrument-grade dark aesthetic holds, token discipline solid. But .eyebrow with Signal Orange appears above every h1 — "Community" / "Contribute" / "Account" / "Account". Duplicate "Account" for two distinct pages confirms scaffolding, not voice. The design system is explicit: one deliberate named kicker = instrument voice; orange eyebrow on every page heading = AI grammar.

**Deterministic scan**: 1 advisory, 0 warnings. theme.css:26 — #160a04 undocumented. No false positives.

## Overall Impression

The design language is coherent and on-brand. But the interaction layer has two serious breaks: window.confirm/window.prompt are jarring brand violations at highest-stakes moments, and del() has a silent-failure bug. The SelectionBar is the standout — a floating command surface that feels exactly like hardware's transient controls.

## What's Working

1. SelectionBar is the standout interaction. Context-sensitive, rises from the bottom, pack popover on demand. Earns the "Floating bar" design token.
2. Upload's progressive disclosure is clean. Publish only appears after file loads. Advanced JSON section hidden by default. Lead text preemptively answers the sampler gotcha.
3. Token discipline across all four pages. Signal Orange never on error states. Danger Red for .error. No color drift.

## Priority Issues

**[P1] del() has no try/catch — silent data loss on DELETE failure**
- setItems(filter) runs regardless of whether DELETE succeeded. Patch vanishes from UI on network error, reappears on reload.
- Fix: Move setItems inside try block, add catch with setErr.
- toggle() has the identical issue — fix both.
- Suggested command: /impeccable harden

**[P1] window.confirm() for delete and window.prompt() for new pack name break the brand**
- Browser-native dialogs completely outside the instrument aesthetic. window.prompt on mobile is especially broken.
- Fix: Inline double-tap confirmation for delete. Inline new-pack input in selbar popover replacing window.prompt.
- Suggested command: /impeccable harden

**[P2] Browse filter: no result count, no clear affordance, AND logic unexplained**
- Two identical-looking search boxes with no combination hint. Empty state gives no recovery.
- Fix: Result count after load. Clear chip when filters active. 300ms debounce extended to text/tag.
- Suggested command: /impeccable harden

**[P2] Toggle public/private fires immediately with no guard or loading state**
- "Make public" is irreversible community-facing action. Single click, no disable during PATCH call, no confirmation.
- Fix: Disable during call. For "Make public" direction: brief inline confirm that auto-cancels after 3s.
- Suggested command: /impeccable harden

**[P2] Missing ARIA on Browse filter inputs and focus ring on card-as-Link**
- Engine select, name search, tag search have no label/aria-label. card-as-Link in Packs has no :focus-visible rule.
- Fix: aria-label on all three inputs. Add .card:focus-visible rule to theme.css.
- Suggested command: /impeccable audit

## Persona Red Flags

**Alex (Power User):**
- No select-all. Submit-button search. window.prompt stops batch-pack flow dead. No sort.

**Jordan (First-Timer):**
- Raw engine IDs in dropdown. Identical-looking filter boxes. Tag-click not discoverable. Success message below fold. "No patches found." has no recovery.

**Maya (OP-1 owner, new to this web app):**
- Expects immediate filtering like OP-1 hardware browser. Upload/Publish verb mismatch. No JSON validation preview. window.prompt for new pack name is worst moment of her session.

## Minor Observations

- #160a04 used correctly but undocumented — add as --orange-on token.
- "select" checkbox label is lowercase — only non-uppercase label in the system. Add aria-label="Select {name}" on the input.
- "Account" eyebrow for both My Patches and Packs — two distinct sections, one generic label.
- Packs empty state is the best quality; Browse and MyPatches should match it.
- toggle() missing try/catch same as del().
- Inline style fragments (style={{ marginTop: 12 }}) throughout — style leakage.

## Questions to Consider

- "What if Browse became live-filtering (300ms debounced, no Submit button)?"
- "Delete and new-pack both reach for native dialogs. What's the in-system pattern for all destructive/quick-input moments?"
- "Browse and MyPatches are nearly identical. Is sameness a feature or a missed opportunity?"
- "What else could bulk selection unlock — bulk tag, bulk visibility toggle, bulk engine reassign?"
