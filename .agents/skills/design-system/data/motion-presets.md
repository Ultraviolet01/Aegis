# Motion preset database

Ready-to-use motion recipes in the house language. Each preset names the easing, the duration, and the properties to animate (transform and opacity only). Pick one, drop in the values, ship the reduced-motion path. These obey the `fluid` SKILL and pass the detector.

House easing tokens (declare once in `:root`):
```css
--out:    cubic-bezier(.22, 1, .36, 1);    /* enters, reveals: decelerate */
--spring: cubic-bezier(.34, 1.4, .5, 1);   /* micro-interactions: slight overshoot */
--ease:   cubic-bezier(.32, .72, 0, 1);    /* MVP smooth, long travel */
--ios:    cubic-bezier(.4, 0, .2, 1);      /* neutral, system-like */
```
Format: `name — when. values. note.`

## Reveals (on scroll, via IntersectionObserver, never scroll listeners)
- **Soft rise** — text blocks, cards. `opacity 0 to 1, translateY(16px to 0)`, 600ms, `--out`. The default reveal. Stagger children by 60 to 90ms.
- **Fade lift** — images, media. `opacity 0 to 1, translateY(24px to 0), scale(.98 to 1)`, 700ms, `--out`. A touch more travel for hero media.
- **Clip wipe** — headlines, editorial. `clip-path inset(0 0 100% 0) to inset(0)`, 800ms, `--ease`. Reveals line by line; pair with overflow hidden.
- **Stagger grid** — a gallery or list. each item Soft rise, delay `index * 70ms`, cap the cascade at ~8 items then group the rest.

## Hovers (frequent, stay fast)
- **Lift** — cards, tiles. `translateY(-4px), shadow grows`, 200ms, `--spring`. The signature card hover.
- **Accent underline** — links. `background-size 0% to 100% on a 1px gradient underline`, 220ms, `--out`. Grows from left.
- **Image zoom** — media in a frame. `scale(1 to 1.04)` on the inner img, 300ms, `--out`, frame keeps `overflow:hidden`.
- **Icon nudge** — a CTA with an arrow. `translateX(2px)` on the icon, 180ms, `--spring`.

## Press (tactile feedback, required on primary actions)
- **Push** — buttons. `:active { scale(.97) }`, 120ms, `--spring`. Never skip this on a primary button.
- **Key press** — toggles, segmented controls. `scale(.96), brightness down 4%`, 100ms, `--ios`.

## Page and section transitions
- **Cross-fade up** — route change. outgoing `opacity to 0`, incoming Soft rise, 400ms, `--out`. Keep enter and exit symmetric.
- **Shared element** — a thumbnail to a detail hero. animate `transform` between measured rects (FLIP), 500ms, `--ease`. The premium move; measure, do not guess.

## Overlays (layered, never fade-while-sliding)
- **Sheet** — bottom sheet, drawer. panel `translateY(100% to 0)` opaque, 420ms, `--ease`; dimmer `opacity 0 to 1` separately, 300ms. Two layers, never one.
- **Popover** — menus, tooltips. `opacity 0 to 1, scale(.96 to 1)`, 160ms, `--spring`, `transform-origin` at the trigger. Grows from where it was opened.
- **Modal** — center dialog. backdrop fades, panel `scale(.96 to 1), opacity`, 220ms, `--spring`. Drive visibility from its own intent, not a side effect.

## Numbers and ambient
- **Count up** — stats, balances. animate the value with `--ease` over 900 to 1400ms, tabular mono, ease-out the last digits. Under reduced motion, snap to final.
- **Drift field** — ambient hero background. two or three radial blobs translating on a 12 to 20s loop, `globalCompositeOperation lighter`, very low opacity. Freeze under reduced motion.
- **Marquee** — logo or text strip. `translateX` linear loop, 30 to 60s, pause on hover, duplicate content for seamlessness. `linear` is correct here.

## Reduced motion (always ship both)
```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
}
```
And in JS, gate observers and loops on `matchMedia('(prefers-reduced-motion: reduce)').matches`. Counters snap, drift fields hold, marquees stop. CSS and JS, both, never one.

## Rules when picking
- Transform and opacity only. Never animate width, height, top, margin (reflow).
- Frequent interaction stays fast (120 to 250ms). Reveals, heroes, ambient can run longer (600ms and up) on purpose.
- One scroll velocity, one progress source: many small animations should share a personality (`flow`).
- Start scale from `.93` to `.98`, never `0`. Set `transform-origin` on anything that grows from a point.
