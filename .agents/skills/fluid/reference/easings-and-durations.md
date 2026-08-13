# Easings and durations

## Easing map (pick by intent)

| Curve | Use it for | Avoid for |
|-------|-----------|-----------|
| `ease-out` | Almost all enters and exits: dropdowns, modals, reveals, marketing intros. Feels responsive because it starts fast. | Continuous loops. |
| `ease-in-out` | Elements that move or morph while staying on screen: timelines, expanding containers, position changes. | Enters and exits (feels heavy). |
| `ease-in` | Practically nothing. It feels slow and unresponsive. | UI in general. |
| `linear` | Marquees, hold-to-confirm progress, 3D rotation. Anything tied to real time. | Anything that should feel alive. |
| `ease` (default) | Tiny hover and color transitions only. | Movement and reveals (too generic). |

## House signature curves (PLR Studio)

These are the curves proven on plrstudio.fr. Prefer them over browser defaults, which under-accelerate. Copy as CSS variables or framer-motion arrays.

```
--out:    cubic-bezier(0.22, 1, 0.36, 1);   /* house ease-out: enters, exits, hovers. The default. */
--spring: cubic-bezier(0.34, 1.4, 0.5, 1);  /* gentle overshoot: press release, pop-in, playful accents */
--fr:     cubic-bezier(0.27, 0, 0.51, 1);   /* Framer-style ease-in-out: on-screen morph and position changes */
--ios:    cubic-bezier(0.32, 0.72, 0, 1);   /* iOS sheet / Vaul: drawers and bottom sheets (the MVP default) */
```

framer-motion equivalents:
- ease-out: `ease: [0.22, 1, 0.36, 1]`
- the `Reveal` component uses a slightly stronger expo variant `[0.16, 1, 0.3, 1]` for large section reveals. Both are house-correct.

Note: `--spring` is a bezier with overshoot, fine for a short CSS transition (a button settling, a small pop-in). For anything gesture-driven or physical, use a real spring (damping and response), not a bezier. See the springs table below.

Generic fallbacks if a softer curve is ever needed: `cubic-bezier(0.25, 1, 0.5, 1)` (quart-out, gentler enter), `cubic-bezier(0.76, 0, 0.24, 1)` (quart-in-out, symmetric morph).

## Springs (gesture-driven or physical motion)

Describe a spring with damping and response, not a duration. The motion should be a conversation with the user, not a fixed clip.

| Feel | framer-motion values |
|------|----------------------|
| No overshoot, settles cleanly (default) | `{ type: "spring", stiffness: 120, damping: 20 }` |
| Light, slightly bouncy (had momentum) | `{ type: "spring", stiffness: 200, damping: 18 }` |
| Snappy popover | `{ type: "spring", stiffness: 300, damping: 26 }` |

Rule: default to no overshoot. Add bounce only when the gesture carried momentum (a flick, a drag with velocity), never on a plain tap.

## Duration table

| Interaction | Duration |
|-------------|----------|
| Button press `:active` `scale(0.97)` | 120 to 150ms |
| Hover, color, background | 150 to 200ms |
| Select, small popover, tooltip | 150 to 200ms |
| Dropdown, menu, modal enter | 200 to 300ms |
| Section reveal on scroll | 600 to 700ms (expo-out, fires once) |
| Marquee full loop | 25 to 40s (linear) |

Hard ceiling for repeated UI motion: 300ms. Past that it reads as sluggish.

## What to animate

Only `transform` (translate, scale, rotate) and `opacity`. They are GPU-composited and never trigger layout. Everything else (width, height, top, left, margin, padding) causes reflow and stutters. Name the properties in `transition`, never use `all`.
