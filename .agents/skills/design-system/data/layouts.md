# Layout archetypes

A curated library of page shapes. The `init` picks a layout from here the same way it picks a palette or a type pairing: commit to one archetype per page, do not improvise the generic skeleton. Across a multi-page product, vary the archetype so two pages never share a silhouette.

The default AI shape, the one to escape: a nav, a split hero (text left, a card or panel right), a row of three equal feature cards, a band of four stats, a footer. It is competent and completely generic. Change the palette and the type, keep this skeleton, and ten brands still feel like one site repainted. Every archetype below is a deliberate way out of it.

## Pick by intent

| Archetype | Use when | Shape |
|---|---|---|
| **Split hero + dashboard** | a real product UI sells it (SaaS, analytics, dev tools) | text left, a genuine product panel right. Allowed, but only when the panel is real, and not on every page. |
| **Centered editorial** | luxury, beauty, a manifesto, a single product | one centered column, large display, generous air, vertical rhythm, no left or right split |
| **Full-bleed image hero** | travel, hospitality, anything photographic | an edge to edge image fills the first screen, headline overlaid, content below |
| **Bento mosaic** | commerce, a feature overview, a brand with many facets | a grid of tiles of different spans. No hero. The grid is the page. |
| **Index or directory** | real estate, a catalogue, an archive, a changelog | full-width hairline rows (number, name, meta, value), like a table of contents, not cards |
| **Single long column** | a menu, an essay, a story, documentation | one narrow centered column top to bottom, dividers, an inset image once |
| **Broken or asymmetric grid** | craft brands, editorial, fashion | deliberate imbalance, an offset wordmark, overlapping elements, staggered blocks, off center |
| **Maximalist type** | sport, music, events, bold DTC | the headline is the hero, edge to edge, no panel. Type carries the screen. |
| **Lineup or poster** | events, music, a schedule | a list in big type (date, name, meta), festival style, the headliner larger |
| **Fixed sidebar** | a portfolio, a studio, an app marketing page | a pinned sidebar (brand, index, contact) with a scrolling content column |
| **Poster or color blocks** | a launch, a festival, a bold campaign | large solid color fields and big type, graphic, almost print |
| **Split screen 50/50** | a comparison, a duality, a strong before and after | two full-height halves, one visual, one content, often sticky |
| **Magazine grid** | content-rich, news, a blog home | a mosaic of articles at varied sizes, no single hero, content first |
| **Gallery-first** | a product line, work, a portfolio | a wall of tiles immediately, a minimal masthead, browsing is the experience |

## Rules

- Commit to one archetype per page. Do not blend three.
- Vary it across pages and across a sector. Two clients in the same field should not get the same silhouette.
- Use the width. A 1160px column centered on a 1920px screen leaves the sides empty and reads timid. Let the visual-heavy sections (galleries, image heroes, bento grids) run wider or full-bleed. Keep running text in a readable measure (around 60ch), but do not center everything in one narrow lane.
- One real photo where it earns its place, the rest built in CSS and SVG. A photo in every slot makes distinct brands look the same, all "image plus text". Distinctiveness comes from varied treatment, not stock everywhere.
- N items fill N cells. No empty decorative cells in a grid.

## The tell this fixes

Varying the palette is not enough. Generated pages converge on the same shape, not just the same colors. Pick the shape on purpose, from the table above, and the work stops looking generated.
