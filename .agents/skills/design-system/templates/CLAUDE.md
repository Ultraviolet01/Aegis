# Design System: {{BRAND}} · Brand rules for generating UI

> This file is the **brand context**. When asked to create a UI, a page, a component, or a
> mockup, apply these rules STRICTLY. Do not invent colors, fonts, or spacing outside this
> system. Use the CSS variables from `tokens.css`. Pair with the `fluid` skill for motion.

## Identity
- **Product**: {{BRAND}}: {{ONE_LINE_POSITIONING}}.
- **Personality**: {{PERSONALITY}} (e.g. refined, editorial, techy, playful).
- **Surface language**: {{flat | soft | glass}}.
- **Language**: {{fr | en}} by default, sentence case.

## Golden rules (always)
1. **Action color = `{{BRAND_HEX}}`** (`--brand`): primary CTAs, links, focus.
2. **Accent `{{ACCENT_HEX}}`** (`--accent`), rationed: one sharp accent, never a wash.
3. **Text** via `--text` / `--text-secondary`. Never pure black `#000`.
4. **Backgrounds** via `--bg-base` / `--surface`. Tuned near-black in dark, never `#000`.
5. **Display font = {{DISPLAY_FONT}}**, **body/UI = {{BODY_FONT}}**. Nothing else. Never Inter/Roboto/Arial as primary.
6. **Spacing = multiples of 8** (`--space-*`). No arbitrary values.
7. **Radii**: `--radius-control` ({{RADIUS_CONTROL}}), `--radius-card` ({{RADIUS_CARD}}), pill, full.
8. **Every color/space/radius/shadow is a `var(--token)`**. No raw hex on text or surface.
9. **Container** centered, `--container-max` (1280px), side padding 16 to 64px.
10. **Bespoke SVG icons, zero decorative emoji.** Glossy 3D for big elements, duotone inline for UI, SVG art for brand marks.

## Motion (defer to the fluid skill)
- Easings from tokens: `--ease-out`, `--spring`, `--ease-in-out`. Never `linear` (except marquees).
- Under 300ms for UI. Animate transform/opacity only.
- Reduced-motion at two levels: the CSS guard in `tokens.css` AND a JS guard (`useReducedMotion()` / `<MotionConfig reducedMotion="user">`).
- Global `:focus-visible` ring is in `tokens.css`. Keep keyboard focus visible.

## How to produce
- **HTML/CSS**: import `tokens.css`, use the variables and the base classes `.btn`, `.btn--primary`, `.card`, `.badge`, `.container`, `.section`.
- **Tailwind**: use `tailwind.config.js`, classes map to the same tokens.
- Load the two brand fonts (self-host woff2).
- Prefer: big display headings, secondary body text, the brand CTA, airy sections, {{surface}} cards.
- Avoid: hard shadows, generic fonts, off-palette colors, pure black, the purple gradient, emoji.

## Files
- `tokens.css`: variables + base classes
- `tailwind.config.js`: Tailwind equivalent
- `storybook.html`: live showcase
- `DESIGN_SYSTEM.md`: detailed spec
