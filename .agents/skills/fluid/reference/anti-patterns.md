# Anti-patterns checklist

Review motion against this before shipping. Each item is a candidate for a future deterministic detector (grep on the CSS or JSX, no API needed). Flag, explain, fix.

## Timing and properties
- [ ] UI animation longer than 300ms (excluding deliberate scroll reveals and marquees).
- [ ] `transition: all`. Name the properties instead.
- [ ] Animating layout properties (`width`, `height`, `top`, `left`, `margin`, `padding`). Use `transform`.
- [ ] A spring or transition defined by a `duration` where a physical feel was wanted. Use damping and response.

## Easing
- [ ] `ease-in` on an enter or exit. Use `ease-out`.
- [ ] `linear` on anything that is not a marquee, hold-to-confirm, or 3D rotation.
- [ ] Browser default easing on a prominent animation where a custom curve would land harder.

## Detail
- [ ] Animating from `scale(0)`. Start near `0.93`.
- [ ] Popover or menu scaling from center instead of its trigger (missing `transform-origin`).
- [ ] No `:active` press feedback on a primary button.
- [ ] Repeated tooltip still delayed after the first.

## Decision
- [ ] Animation on a high-frequency interaction (menu, list row, repeated hover, keyboard action). Make it instant.
- [ ] Motion that adds no clarity, feedback, or spatial meaning. Remove it.
- [ ] Asymmetric enter and exit paths that break spatial consistency (comes from the right, leaves downward).

## Accessibility
- [ ] No `prefers-reduced-motion` path. Every animation needs one.
- [ ] Inertia, parallax, or autoplaying ambient motion that does not freeze under reduced motion.
- [ ] Counter or odometer that animates under reduced motion instead of snapping to its final value.

## Taste
- [ ] Brand color or gradient used at full strength where a rationed accent (a thin hairline, a soft tint) would read as more premium.
- [ ] Many small animations firing at once with no shared physics personality. Feed them one scroll velocity and progress source.
- [ ] A generic stat count-up used as the page's signature motion. Prefer a progress indicator tied to what the page actually does (a deploy bar, a funding meter, a completion ring).

## Interaction (from production)
- [ ] A modal panel nested inside a fading backdrop, so it fades while sliding (reads as a flash). Separate the layers: dimmer fades, panel slides opaque.
- [ ] A modal or overlay unmounted as a side-effect of an unrelated state (a counter, a fetch). Drive its visibility from its own intent.
- [ ] A global click listener (spark, outside-dismiss) attached in the bubble phase, swallowed by a modal's `stopPropagation`. Use the capture phase.
- [ ] Reduced motion handled in CSS only or JS only. Do both.

## Catalog: tells to review by hand
The detector catches the deterministic ones. These are structural or semantic, so review them by eye.

Typography and hierarchy
- [ ] Flat type hierarchy: heading and body sizes too close. Make the jump obvious.
- [ ] An icon tile (rounded square) stacked above every heading. Drop it.
- [ ] Repeated uppercase kicker labels on every section. Use them once, if at all.
- [ ] All-caps body text. Reserve caps for short labels.
- [ ] A skipped heading level (h1 then h3). Keep the order.

Layout
- [ ] Identical card grids: three or four same-size icon-heading-text cards. Vary the sizes and the grid.
- [ ] Cards nested inside cards inside cards. Flatten.
- [ ] Numbered section markers (01 / 02 / 03) as decoration.
- [ ] The hero-metric block: a big number, a small label, three stats, a gradient accent.
- [ ] A long list with a border on every row, where a table or a filter is the right component.
- [ ] Lines longer than ~75 characters. Constrain the measure.

Color and surface
- [ ] The cream-beige "tasteful" default surface, used because it reads safe. Commit to a real palette.
- [ ] Gray text on a colored background (low contrast). Check 4.5:1.
- [ ] Glass or blur used decoratively rather than to signal depth or dismissal.

Copy
- [ ] Aphoristic manufactured contrast ("not X, but Y") on repeat.
- [ ] Calling things "performative" or "theater" as a tic.

Register
- [ ] A landing page and a dashboard treated the same. Brand work (impression-led) and product UI (task-led) play by different rules.

Across a suite (more than one page)
- [ ] The same motion kit on every page: tilt-to-cursor cards, magnetic buttons, count-up numbers, a cursor-spotlight glow. Each passes the per-page checks; the repeated set reads as a template. Vary the signature per page.
- [ ] Every page sharing one display font. Give each its own headline face.
- [ ] No page carrying a signature interaction on theme. One per page, dramatizing what that page is about, not a kit pasted across all of them.
