# Liquid glass and surface recipes

Concrete recipes for premium surfaces, harvested from production. Depth comes from light (sheen, shadow, blur), not from hard borders. Glass is one surface option, use it only when the brand earns it. Flat and soft are equally valid (see `dna.md`).

## The glass recipe (the signature)

A glass surface is a translucent fill, plus a backdrop blur and saturate, plus inner reflections, sitting over a colored halo that the blur refracts.

```css
:root {
  --glass: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(255, 255, 255, 0.6);
  /* The reflect: top sheen, a 0.5px bright edge, a soft low glow.
     Set it as a box-shadow on every glass surface. This is what sells it. */
  --glass-reflect:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.25),
    inset 0 -18px 30px -18px rgba(255, 255, 255, 0.2);
  --glass-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
}
@media (prefers-color-scheme: dark) {
  :root {
    --glass: rgba(40, 40, 48, 0.55);
    --glass-border: rgba(255, 255, 255, 0.12);
    --glass-shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
  }
}

.glass {
  background: var(--glass);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  backdrop-filter: blur(20px) saturate(1.8);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow), var(--glass-reflect);
  border-radius: var(--radius-card);
}
```

### Colored halo behind the glass

This gives the refraction instead of a flat fill: a blurred radial-gradient pseudo-element at `z-index: -1`, opacity around 0.5, tinted by the accent. The glass blur refracts it.

```css
.card { position: relative; isolation: isolate; overflow: hidden; }
.card .halo {
  position: absolute; z-index: -1; inset: -40% -10% auto -10%; height: 150%;
  background: radial-gradient(closest-side, var(--accent), transparent 70%);
  opacity: 0.5; filter: blur(6px);
}
```

### Gotchas
- `backdrop-filter` needs the `-webkit-` prefix for Safari and iOS.
- Heavy blur costs GPU. Do not stack dozens of large blurred layers.
- Glass needs something behind it (a halo, content) or it looks flat.

## The shimmer button (a premium micro-interaction)

A solid CTA with a one-pass light sweep on hover, plus an instant press.

```css
button.primary {
  position: relative; overflow: hidden; color: #fff; border: none;
  border-radius: 999px; font-weight: 650; padding: 0.6rem 1.1rem; cursor: pointer;
  background: linear-gradient(135deg, var(--accent), var(--accent-deep));
  box-shadow: 0 8px 22px color-mix(in srgb, var(--accent) 35%, transparent),
              inset 0 1px 0 rgba(255, 255, 255, 0.35);
  transition: transform 0.14s var(--ease-out), box-shadow 0.28s ease, background 0.2s ease;
}
button.primary:hover { transform: translateY(-1px); }
button.primary:active { transform: scale(0.96); }   /* instant press */
button.primary::after {
  content: ""; position: absolute; top: 0; left: -70%; width: 45%; height: 100%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.45), transparent);
  transform: skewX(-18deg); transition: left 0.6s ease; pointer-events: none;
}
button.primary:hover::after { left: 130%; }
```

## Card

```css
.card {
  background: var(--glass);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  backdrop-filter: blur(20px) saturate(1.8);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow), var(--glass-reflect);
  border-radius: var(--radius-card); padding: 1rem;
}
```

For sheets and modals, and their open and close motion (the dimmer fades on its own layer while the panel slides in opaque, never unmount a modal as a side-effect of an unrelated state, attach global click listeners in the capture phase), see the `fluid` skill.
