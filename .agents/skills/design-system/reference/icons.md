# Icons: a 3-tier system, never emoji

Icons are where premium is won or lost cheaply. Emoji and flat generic icons read instantly as a template.

## The rule
No decorative emoji. Everything is bespoke SVG. Typographic glyphs (arrows, check, cross, star) are fine as small accents. Decorative SVG gets `aria-hidden="true"`.

## Tier 1: dimensional, glossy 3D (hero elements)
For large, prominent elements: home and dashboard cards, primary nav, shop tiles. Rich gradients, highlights, and a soft drop shadow for volume. Think a tiny 3D render, not a line icon.
- A radial-gradient fill (light source top-left), a gloss ellipse, a colored drop-shadow that matches the subject.
- Large (40 to 64px). Never put a flat 24px stroke icon on a hero card.

## Tier 2: duotone gradient-sheen, inline (UI icons)
For inline UI: buttons, headings, badges, list rows. A 24x24 svg whose filled shapes are painted with a vertical gradient of `currentColor` (stops 0.32 to 0.06 opacity). Subtle volume while staying monochrome and inheriting color and size from context.

```tsx
// Unique gradient id per instance (useId) to avoid clashes between icons.
function FlameIcon(props) {
  const id = useId();
  return (
    <svg viewBox="0 0 24 24" className="ui-ico" aria-hidden {...props}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.32" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <path d="..." fill={`url(#${id})`} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
```
- It inherits color and size. Give it a `.ui-ico` class.
- Add one vivid solid accent for live or emphasis bits (a pupil, a live dot).
- Figurative concepts become clean symbols, not literal faces or hands. Sleep is a moon plus Z, Cool is sunglasses, Alert is a triangle. Literal little faces and hands look cheap.

## Tier 3: bespoke SVG art (brand and signature objects)
For the brand and signature objects: the logo, a coin, medallions, crests. Drawn by hand, multi-stop gradients, `useId`, optional tasteful animation (float, light sweep) with a `prefers-reduced-motion` guard.
- Make brand objects visually distinct from the logo (a different silhouette) so users do not confuse the two.

## Choosing a tier
| Element | Tier |
|---|---|
| Dashboard or home card, primary nav, shop tile | 1 (dimensional) |
| Button, heading, badge, or row icon | 2 (duotone inline) |
| Logo, coin, reward medallion, crest | 3 (bespoke art) |

## Size inside containers
When an icon sits in a tile or pill, leave air but do not shrink it to a dot. Aim for the icon at about 70 to 80% of the tile. Too small reads broken, too tight reads cramped.

## Sourcing and porting
Libraries like 21st.dev or React Bits are excellent sources to PORT from: take one precise effect and re-implement it on your own tokens and CSS rather than installing a whole framework. That keeps your identity intact and avoids the generic look.
