# Hard rules: locks and bans

Non-negotiable rules that keep output from looking templated. The locks enforce consistency, the discipline keeps structure honest, the bans kill the specific tells of generated UI. Distilled from real production work.

## The locks (consistency)
- Color lock: one accent across the whole page. No mid-page color shifts.
- Shape lock: one corner-radius system. Pick a scale and hold it.
- Theme lock: light, dark, or auto, chosen once at the page level. No mid-page light-to-dark flips.
- Type lock: one display, one body, one mono. No surprise fourth face.

## Hero discipline
- Headline: at most 2 lines on desktop.
- Subtext: at most 20 words, 4 lines.
- Primary CTA visible without scrolling.
- Navigation: a single line, height under 80px.

## Layout honesty
- Pick the page shape from `data/layouts.md`, the same way you pick a palette. Commit to one archetype per page, and vary it across pages so two never share a silhouette. Varying the palette is not enough, generated pages converge on the same shape.
- Section variety: across a long page, use at least 4 different layout families. Do not repeat the same hero-then-three-cards block.
- No three-equal-card rows as the default. Vary sizes, vary the grid.
- Use the viewport. Do not center a narrow column on a wide screen with empty sides. Let visual-heavy sections (galleries, image heroes, bento) run wide or full-bleed. Keep running text in a readable measure (around 60ch), not a narrow centered lane.
- One real photo where it earns its place, the rest built in CSS and SVG. A photo in every slot makes distinct brands look the same.
- Bento and grids: N items fill N cells exactly. No empty decorative cells.
- Long lists are a different component (a table, a filter), not a longer list with a border on every row.

## The bans (the generated tells)
- No em-dashes or en-dashes anywhere in copy. Commas and periods only.
- No section-numbering eyebrows ("00 / INDEX", "001 . Capabilities").
- No version labels in a hero unless the brief is a launch.
- No pills or chips floating on top of images.
- No fake product UI built from divs (a fake terminal, a fake dashboard). Use a real screenshot or honest text.
- No decorative status dots, scroll cues (a bouncing arrow, "scroll"), or locale/weather strips.
- Never the purple-on-white gradient, Inter as the primary font, or pure black (the detector catches these).

## Pre-flight check
Before shipping, every rule above must honestly pass. If a layout repeats, a hero runs long, or a ban is broken, fix it first. Run the `fluid` detector on the result.

Note on icons: this system favours bespoke SVG and the 3-tier icon system (`icons.md`). That is a deliberate difference from skills that ban hand-rolled SVG. Here, custom marks are part of the identity, not a smell.
