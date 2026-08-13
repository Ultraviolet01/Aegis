# Chart and data-viz database

Which chart for which question, plus the house styling defaults so data visualisations carry the same identity as the rest of the system. The goal is honest, legible data, never decoration. Pick by the question the reader is asking, not by what looks impressive.

Format: `chart, use when. avoid when. house defaults.`

## Trend over time
- **Line**: a continuous value over time (revenue, users, price). avoid when: categories are unordered (use bar). house: 2px stroke in the accent, hairline gridlines in a 6% ink tint, dots only on hover, tabular mono axis labels, area fill optional at ~8% opacity.
- **Area**: a single trend where the magnitude matters, or one part of a whole over time. avoid when: more than 3 series overlap (they hide each other; switch to line). house: accent fill 10 to 16%, solid stroke on top, no hard gradient to transparent black.
- **Stacked area**: composition over time. avoid when: the reader needs exact per-series values (stacking distorts). house: 3 to 5 muted tints of the palette, never 8 rainbow bands; label series directly at the line end.
- **Slope**: how a ranking or value moved between two points in time, one line per item. avoid when: more than ~8 items (the lines knot). house: 1.5px lines in an ink tint, the one or two movers you want noticed in the accent, value and label at both ends, no gridlines, just the two axis ticks.
- **Sparkline**: a trend inline in a table or card, no axes. house: 1.5px accent stroke, ~32px tall, last point dotted, no labels; the number beside it carries the value.

## Comparison across categories
- **Bar (horizontal)**: comparing named categories, especially with long labels. avoid when: data is a time series. house: single accent fill, 4px bar radius on the outer end only, value labels at the bar end in mono, sorted by value not alphabetically.
- **Column (vertical)**: few categories or time buckets (months, quarters). avoid when: more than ~12 bars (gets cramped; go horizontal). house: same as bar, baseline at zero always, no truncated axis.
- **Grouped bar**: a category split by a second dimension (region by quarter). avoid when: more than 3 groups (clutter). house: the dominant plus the accent plus one neutral, a clear legend or direct labels.
- **Stacked bar**: a total per category plus its make-up, when the total is the headline and the parts are secondary. avoid when: the reader must compare middle segments across bars (only the bottom segment shares a baseline). house: 3 to 4 palette tints bottom to top darkest to lightest, the total in mono above each bar, segment labels only where the band is wide enough.
- **Lollipop**: a ranked comparison like a bar but with many categories or sparse values, the stem reads quieter than a heavy bar. avoid when: a few categories where a solid bar is clearer. house: hairline stem in a 12% ink tint, the dot in the accent at the value, label and number in mono, sorted by value.
- **Dumbbell**: the gap between two values per category (before and after, this year versus last, men versus women). avoid when: more than two points per row (becomes a cluttered dot plot). house: a connecting hairline, the two dots in the dominant and the accent, the delta in mono at the row end, rows sorted by the gap.
- **Radar**: a single item profiled across 4 to 8 shared axes (skill spread, feature coverage). avoid when: comparing more than 2 shapes, or the axes are not on a shared scale (it lies). house: one filled shape in the accent at ~12% with a solid stroke, a second as an ink-tint outline only, axis labels in mono, a faint web grid behind.
- **Bullet**: a single metric against a target or range (KPI). house: a thin track in ink tint, the value bar in accent, a target tick, the number in mono above. Replaces the gauge.
- **Gauge**: avoid. A dial wastes space to show one number and the eye reads arcs poorly. Use a **KPI stat** for the value or a **bullet** when there is a target. If a gauge is mandated by a brand, keep it a single thin accent arc on an ink-tint track, the number centered in mono, no tick festival, no red-amber-green wedges.

## Part of a whole
- **Donut**: one share at a glance (a single percentage, occasionally up to 3 slices). avoid when: more than 3 to 4 slices, or precise comparison is needed (the eye is bad at arcs; use a bar). house: accent for the focal slice, ink tints for the rest, the headline number centered in mono, no legend if labelled.
- **Pie**: almost never. A pie is a donut with worse labelling and no room for a centered number. avoid when: more than 2 to 3 slices, any need to compare slices, or any need for precision (the eye cannot rank arcs or angles). house: if forced, 2 or 3 slices only, the focal one in accent and the rest in ink tints, percentages directly on the slices, never exploded, never 3D, never a legend the eye must hunt through. Prefer a donut, a single stacked bar, or bars.
- **Stacked bar (100%)**: composition compared across a few items. avoid when: many thin segments. house: 3 to 4 palette tints, direct percentage labels on segments wide enough.
- **Treemap**: part-to-whole across many items where area is the message and a rough read is fine (storage by folder, revenue by product). avoid when: exact comparison matters or values are similar (areas read poorly when close; use a bar). house: a single-hue tint ramp keyed to value, hairline paper gaps between tiles, labels and values in the largest tiles only, the rest on hover.
- **Sunburst**: a hierarchy as nested rings, when the levels of a tree matter (taxonomy, file tree, drill path). avoid when: more than 2 to 3 rings (the outer ring slivers vanish) or the reader needs values (use a treemap or an indented table). house: the inner ring in palette tints, outer rings inheriting a lighter tint of the parent, hairline paper gaps, labels only where an arc is wide, breadcrumb on hover.

## Distribution and relationship
- **Histogram**: the shape of one variable's distribution. house: accent bars, no gaps, a marker line for mean or median in the contrast accent.
- **Scatter**: relationship between two variables. avoid when: thousands of points overlap (add opacity or switch to a density/heatmap). house: dots at ~60% opacity so clusters read, accent for the highlighted series, a quiet trend line if it earns its place.
- **Bubble**: a scatter with a third variable encoded as dot size (cost versus benefit sized by reach). avoid when: precise comparison of the third value matters (area is read loosely) or bubbles overlap badly. house: size by area not diameter, a legible min and max size, fills at ~50% so overlaps read, the dominant and accent for two groups, label only the notable bubbles.
- **Heatmap**: density across two categories (cohort retention, activity by day and hour). house: a single-hue sequential ramp from paper to the dominant, never a red-green or rainbow ramp; label the axes, show the value on hover.
- **Calendar heatmap**: a daily value across weeks and months (contributions, streaks, sales by day). avoid when: the pattern is not weekly or you need exact values (use a line). house: a 7-row grid of small rounded cells, a single-hue ramp from a 6% ink tint to the dominant, 4 or 5 steps not a continuous scale, month labels in mono above, value and date on hover.

## Flow and finance
- **Candlestick / OHLC**: price action with open, high, low, close. house: up in the success green, down in the alert red or accent, tabular mono prices, a calm grid; never both axes truncated.
- **Waterfall**: how a total breaks down through positive and negative steps (P and L, budget). house: increases in accent, decreases in a muted contrast, connectors as hairlines.
- **Funnel**: stepwise drop-off (signup to paid). house: horizontal bars descending, the conversion percentage between steps in mono, the dominant fill.
- **Sankey**: flow and proportion as it splits and merges between stages (traffic sources to outcomes, budget allocation, energy). avoid when: many crossing links turn it to spaghetti (group small flows into an "other" band first). house: nodes as thin accent bars, links in an ink tint at ~30% with the one path you want noticed in the accent, link width true to value, labels and totals in mono at the nodes, no rainbow per-link colour.

## Geography
- **Choropleth map**: a value shaded across regions (rate per state, density by country). avoid when: the value is a raw count that just tracks population (it only shows where people are; use a per-capita rate) or regions vary wildly in size (big empty areas shout; consider a tile/hex cartogram). house: a single-hue sequential ramp from a pale ink tint to the dominant, 4 to 6 binned steps not a continuous gradient, hairline borders in paper, a no-data tint that is clearly neither high nor low, value on hover, a compact legend.

## Single number
- **KPI stat**: one number that is the whole point (MRR, active users, conversion), with its label and a small change indicator. avoid when: the number needs context a sparkline or bullet would give, then pair it with one. house: the value large in the display face or tabular mono, the label small in an ink tint above or below, the delta in the success green or alert red with an arrow glyph, optional sparkline beneath, never a giant coloured card with a drop shadow.

## Tables (often the right answer)
- **Data table**: when exact values matter more than shape. house: numbers right-aligned in tabular mono, hairline row separators only (not a border on every cell), a sticky header, zebra at most 3% tint, one accent for the sortable or active column. A table beats a chart when the reader needs to read, not scan.
- **Table with inline bars**: a table where one column needs both the exact number and a quick visual rank (leaderboards, top pages). avoid when: the column is not a magnitude on a shared scale (a bar implies comparison). house: a faint accent bar behind or beside the cell scaled to the row's share of the column max, the number on top in tabular mono, bars share one baseline and one scale, no per-row colours.

## House rules for every chart
- Ration color exactly like the rest of the system: the dominant and the accent carry meaning, everything else is an ink tint. No rainbow categorical palettes, no purple default.
- Label directly at the data where you can; a legend the eye must cross-reference is a last resort.
- Bars and areas start at zero. Never truncate an axis to exaggerate a change.
- Numbers in the mono, tabular figures, aligned. Axis labels small but never under ~11px.
- Gridlines are hairlines in a low ink tint, behind the data, or absent. The data is the brightest thing on screen.
- Colour-blind safe: do not encode meaning in red versus green alone; add shape, label, or position.
- No 3D, no drop shadows on bars, no dual hidden axes, no decorative gradients that distort magnitude.
- Animate on first reveal only (grow from the baseline, `--out`, staggered), then hold. Under reduced motion, render final state immediately. Tooltips and hover states are instant.
