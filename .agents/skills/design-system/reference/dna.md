# House design DNA

The constant across every PLR system (MVP, LeCoffre, PLR, Vigie). These never change; only the brand variables do.

## Tokens first
- Every color, spacing, radius, shadow, font, and easing is a CSS variable in `:root`. Components reference `var(--token)`, never a raw value. This is what lets light/dark and rebrands work, and what keeps a system coherent.
- Base-8 spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 90, 112.

## Light and dark, always through tokens
- Support both. Light is the default `:root`, dark overrides the theme tokens.
- Two strategies, pick by project: `@media (prefers-color-scheme: dark)` for auto (apps), `:root[data-theme="dark"]` / `.dark` for a manual toggle (vitrine sites).
- Brand hues and the accent usually stay constant; bg, surface, text, separators, glass, tints and on-tint text invert.

## Signature motion (shared with `fluid`)
- The easings live in the tokens:
  - `--ease-out: cubic-bezier(0.32, 0.72, 0, 1)` (the Vaul/iOS curve, sheets and most enters; on marketing sites the stronger `cubic-bezier(0.22, 1, 0.36, 1)` is also house-correct)
  - `--spring: cubic-bezier(0.34, 1.3, 0.4, 1)` (gentle overshoot, micro-interactions)
  - `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)` (on-screen morph)
- Never `linear` except for marquees and time-based motion.
- Motion is useful and restrained, 150 to 600ms, always with a reduced-motion path at **two levels**: the CSS filter (`@media (prefers-reduced-motion: reduce)`) and the JS guard (`useReducedMotion()` / `<MotionConfig reducedMotion="user">`).

## Identity, not decoration
- Distinctive, self-hosted type. A display font paired with a body font. Never Inter/Roboto/Arial as the primary (fallbacks are fine).
- One dominant brand color, one sharp accent, rationed. Tuned near-black, never `#000`.
- Bespoke SVG icons, drawn by hand, zero decorative emoji. MVP runs a 3-tier icon system: glossy 3D for large elements, duotone gradient-sheen inline (`stroke="currentColor"` + a gradient fill of currentColor, unique id per instance via `useId`), bespoke SVG art for brand marks. Recipes and code in `icons.md`.
- A clear surface language: flat, soft shadow, or liquid glass (translucent + inner sheen + soft halo). Pick one per brand and hold it. The glass recipe and the shimmer button are in `glass.md`.

## Premium is in the details
- A global `:focus-visible` ring, defined with `:where(...)` so its specificity is 0 and components can still override it. Keyboard accessibility is part of the brand, not an afterthought.
- Tabular figures for numbers in data, prices, timers.
- Letter-spacing -0.01 to -0.02em on large headings.

## Delivery shape (the LeCoffre pattern)
A system ships as a `design-system/` folder:
- `tokens.css` (source of truth: variables + base classes `.btn`/`.card`/`.badge`/`.container`/`.section`)
- `tailwind.config.js` (same tokens for Tailwind projects)
- `CLAUDE.md` (the brand rules the agent obeys)
- `storybook.html` (live showcase)
- `DESIGN_SYSTEM.md` (human spec)
