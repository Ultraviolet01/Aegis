# Refine commands

Each command is one scoped move. The format below is deliberate: **Does** is the intent, **Changes** is what you touch, **Enforces** ties to a rule the suite already holds, **Leaves alone** stops the command from sprawling into a different one. Apply only the named command. To do more, chain another.

Severity vocabulary matches the detector: a fix the command must make, versus a nudge it should make if cheap.

---

## Type

### typeset
**Does.** Make the typography deliberate and readable.
**Changes.** Swap a generic family (Inter, Roboto, Arial, Helvetica, or the Space Grotesk default) for a distinctive pairing from `design-system/data/type-pairings.md`. Set a real type scale with an obvious jump between heading and body. Constrain the measure to ~66 characters, never past 75. Ease tracking on large headings to -0.02 to -0.03em, never tighter. Set line-height by role: tight on display, ~1.5 on body.
**Enforces.** Detector rules `generic-font`, `space-grotesk`, `justified-text`, `tiny-text`, `crushed-tracking`, `gradient-text`.
**Leaves alone.** Color, layout, motion. Do not recolor text here.

### recase
**Does.** Remove casing tics.
**Changes.** Convert all-caps body and long all-caps strings to sentence case. Keep an uppercase kicker label to one per page, if any. Reserve caps for short labels.
**Enforces.** The catalog tells in `fluid/reference/anti-patterns.md` (repeated uppercase kickers, all-caps body).
**Leaves alone.** Font choice and size. That is `typeset`.

---

## Color

### colorize
**Does.** Commit to a palette instead of a safe default.
**Changes.** Pick a dominant color and one rationed accent from `design-system/data/palettes.md`. Replace any purple or violet wash gradient. Replace pure black with a tuned near-black. Lift gray-on-color until body text hits 4.5:1. Ration the accent: a hairline, a soft tint, one focal moment, not a full-strength flood.
**Enforces.** Detector rules `cliche-purple-gradient`, `pure-black`. The accent-rationing and contrast tells in the catalog.
**Leaves alone.** Type and structure. Do not also change the font.

### tone
**Does.** Shift the mood without changing the identity.
**Changes.** Move the existing palette warmer, cooler, darker, lighter, or more muted, keeping the same dominant-plus-accent structure and the locks (the committed hue family, the shape language, the theme). A re-temperature, not a re-brand.
**Enforces.** The locks in `design-system/reference/rules.md`.
**Leaves alone.** The palette's role structure. `tone` nudges; `colorize` commits.

---

## Motion

### animate
**Does.** Add motion on purpose. This is the one command that adds movement, and it is the house specialty, so it adds gladly when the moment rewards it.
**Changes.** Add reveals on scroll (IntersectionObserver, never scroll listeners), hero entrances, hover and press feedback, counters. Use the house easings: `--out: cubic-bezier(.22,1,.36,1)` for enters, `--spring: cubic-bezier(.34,1.4,.5,1)` for micro-interactions. Animate `transform` and `opacity` only. Always ship a `prefers-reduced-motion` path.
**Enforces.** The `fluid` SKILL rules. Avoids `animate-layout-property`, `ease-in`, `scale-zero`, `transition-all`.
**Leaves alone.** Frequent interactions that should stay instant. If the thing fires constantly, do not animate it.

### settle
**Does.** Calm motion that is janky or overused. The opposite direction from `animate`.
**Changes.** Make frequent interactions instant (menus, list rows, repeated hovers, keyboard actions). Replace `transition: all` with named properties. Start scale entrances at `0.93`, not `0`. Set `transform-origin` so popovers grow from their trigger. Replace dated negative-control-point bounce curves with a real spring. Pull durations over ~1200ms back unless the motion is a deliberate reveal or ambient loop.
**Enforces.** Detector rules `transition-all`, `scale-zero`, `dated-bounce-ease`, `long-duration`, `animate-layout-property`.
**Leaves alone.** Motion that already earns its place. `settle` calms, it does not strip. fluid loves animation; it removes the wrong kind, not the act.

### flow
**Does.** Make many small animations feel like one system.
**Changes.** Feed scattered animations one shared source: one scroll velocity, one progress value, one easing personality. Replace per-element ad-hoc timings with a common physics so the page moves as a whole.
**Enforces.** The catalog tell "many small animations firing at once with no shared physics personality".
**Leaves alone.** Whether each animation should exist. That is `settle` or `animate`.

---

## Emphasis

### bolder
**Does.** Increase visual force where the design is timid.
**Changes.** Widen the type scale jump. Raise contrast. Give one element a real moment: a larger hero headline, a stronger accent on the primary action, more scale on the focal image. Add weight, not clutter.
**Enforces.** The catalog tell "flat type hierarchy". Hero discipline in `design-system/reference/rules.md` (a headline still caps at two lines).
**Leaves alone.** Everything not in focus. Boldness is rationed; one moment, not ten.

### quieter
**Does.** Dial down a design that is shouting.
**Changes.** Ration the accent back to a hairline or a soft tint. Replace fills with thin borders. Add whitespace. Remove decorative effects that add no meaning. Reduce the number of competing focal points to one.
**Enforces.** The taste rules on rationed accent and "motion that adds no clarity, remove it".
**Leaves alone.** Content and hierarchy. `quieter` lowers the volume, it does not cut sections. That is `distill`.

---

## Structure

### distill
**Does.** Strip the structural slop that makes a page read as generated.
**Changes.** Flatten cards nested inside cards. Vary identical three-or-four same-size icon-heading-text card grids. Drop the rounded icon tile stacked above every heading. Remove 01 / 02 / 03 decoration markers. Replace the hero-metric block (big number, small label, three stats, gradient accent) with something the content actually needs. Cut copy to the essential sentence.
**Enforces.** The structural tells in `fluid/reference/anti-patterns.md`.
**Leaves alone.** Color, type, motion. This is a structure and copy-density pass.

### regroup
**Does.** Fix hierarchy and sectioning.
**Changes.** Correct heading order (no h1 then h3). Group related controls and content. Separate brand sections from product sections so each can follow its own rules. Make the document outline match the visual one.
**Enforces.** The catalog tells "skipped heading level" and "a landing page and a dashboard treated the same".
**Leaves alone.** The look of each group. `regroup` is organization, not styling.

---

## Surface

### glass
**Does.** Apply the liquid-glass treatment, correctly.
**Changes.** Use the recipe in `design-system/reference/glass.md`: `backdrop-filter: blur() saturate()`, an inner sheen via an inset highlight box-shadow, a tuned translucent fill. Apply it to signal depth or dismissal (a panel over content, an overlay), not as blanket decoration on flat elements.
**Enforces.** The catalog tell "glass or blur used decoratively rather than to signal depth or dismissal".
**Leaves alone.** Elements that are not layered. Flat sections do not need glass.

### iconify
**Does.** Make iconography consistent and bespoke.
**Changes.** Replace emoji in markup with SVG. Replace mismatched stock icons with one coherent set, ideally hand-drawn per the 3-tier system in `design-system/reference/icons.md`. Keep stroke width, corner radius, and grid consistent across the set.
**Enforces.** Detector rule `emoji-icon`. The house preference for bespoke SVG over stock.
**Leaves alone.** Layout and color of the surrounding UI.

---

## Copy

### deslop
**Does.** Make the copy concrete and on-house-style.
**Changes.** Replace marketing buzzwords (streamline, supercharge, empower, seamless, cutting-edge, next-level, game-changer, unlock, effortless) with the specific thing the product does. Remove aphoristic manufactured "not X, but Y" contrast on repeat. Replace every em or en dash with a comma, a period, or a colon (house style bans them).
**Enforces.** Detector rules `marketing-buzzword`, `em-dash`.
**Leaves alone.** Type and layout. Words only.

---

## Register

### brandward
**Does.** Push a screen toward impression-led brand work.
**Changes.** More air, larger type, a stronger hero moment, room for motion and imagery, a point of view in the copy. The rules of a landing page, not a dashboard.
**Enforces.** The brand-versus-product distinction in `design-system/reference/rules.md`.
**Leaves alone.** Task density. If it is actually a product surface, use `productward` instead.

### productward
**Does.** Push a screen toward task-led product UI.
**Changes.** Denser, calmer, faster. Information first, decoration last. Instant interactions, predictable layout, less motion, tighter spacing. The rules of a dashboard, not a landing page.
**Enforces.** The brand-versus-product distinction, and "frequent means instant" from the `fluid` SKILL.
**Leaves alone.** Brand expression. A marketing page does not get `productward`.

---

## Gates

### audit
**Does.** Run the deterministic guardrail.
**Changes.** Nothing. Runs `node fluid/detector/detect.mjs <path>` (add `--strict` for CI, `--json` for machine output) and reports the 29 rules' findings by severity.
**Enforces.** All detector rules.
**Leaves alone.** Everything. This is read-only. Fixes come from the named commands the findings point to.

### critique
**Does.** Review what the detector cannot see.
**Changes.** Nothing. Reads the by-hand catalog in `fluid/reference/anti-patterns.md` and judges the screen against the structural and semantic tells (flat hierarchy, identical grids, gray-on-color, aphoristic copy, wrong register), then names the commands that would fix each.
**Enforces.** The catalog.
**Leaves alone.** Everything. Read-only, like `audit`, but qualitative.

### harden
**Does.** Make the screen accessible and robust.
**Changes.** Add `prefers-reduced-motion` handling in both CSS and JS (not one). Ensure visible `:focus-visible` on every interactive element. Confirm body contrast 4.5:1. Handle `prefers-color-scheme`. Add alt text and labels. Confirm the layout holds at 375, 768, and 1280px with no horizontal scroll.
**Enforces.** The `output` checklist. Detector rule `no-reduced-motion`.
**Leaves alone.** Aesthetics. `harden` is correctness, not taste.

### polish
**Does.** The final craft micro-pass.
**Changes.** Add `:active` press feedback and hover states where missing. Fix optical alignment. Make radii and spacing consistent on a scale. Tune the small things: shadow softness, the one-pixel offsets, the timing of a reveal. This is the difference between a demo and a shipped build, the house craft bar (the plrstudio.fr finish reference).
**Enforces.** The `output` execution discipline and the production interaction learnings (layered modals, capture-phase listeners, no side-effect unmounts).
**Leaves alone.** Big structural or identity decisions. `polish` is the last 5%, not a redesign.
