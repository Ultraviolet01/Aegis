# Motion craft (implementation recipes)

The how, at the level of real code. `principles.md` says why, `easings-and-durations.md` gives the values, this gives the recipes for the motion that reads as expensive.

The bar is the best motion component libraries. The difference is that fluid ships the same craft with the discipline they skip: a `prefers-reduced-motion` path in the same change, transform and opacity only, calibrated stagger, and restraint instead of bounce. Match their finish, keep your discipline, and the result looks authored rather than pulled from a registry.

Stack assumed: React 19 + framer-motion (Motion) + Tailwind v4. The patterns translate to plain CSS where noted.

## 1. Text reveal (the blur reveal)

The premium tell on a headline is a soft focus-in, not a slide. Animate `opacity`, a small `y`, and `filter: blur()` together, split into segments with a calibrated stagger.

```tsx
// item variant: the segment
const item = {
  hidden:  { opacity: 0, y: '0.35em', filter: 'blur(10px)' },
  visible: { opacity: 1, y: 0,        filter: 'blur(0px)'  },
};
// container: orchestrates the stagger
const container = {
  visible: { transition: { staggerChildren: STAGGER, delayChildren: delay } },
};
```

Calibrate the stagger to the unit, smaller unit means tighter, or a char reveal drags:

| per | staggerChildren | segment duration |
|---|--:|--:|
| char | 0.03s | 0.3s |
| word | 0.05s | 0.4s |
| line | 0.10s | 0.5s |

Easing on the segment is the house `--out` (`cubic-bezier(.22,1,.36,1)`). Ration this: one hero line or one accent word, not every paragraph.

Accessibility, non negotiable: the split breaks screen readers, so restore it.

```tsx
<p>
  <span className="sr-only">{text}</span>          {/* real text for AT */}
  <span aria-hidden="true">                         {/* animated, hidden from AT */}
    {segments.map((s, i) => <motion.span key={i} variants={item} className="inline-block whitespace-pre">{s}</motion.span>)}
  </span>
</p>
```

Reduced motion: render the plain text, skip the split and the variants entirely.

## 2. Pointer physics (magnetic, tilt)

Both follow the same idiom: a raw `motionValue` from the pointer, smoothed through `useSpring`, mapped with `useTransform`, written as a transform. Never read layout, never animate layout.

Magnetic (an element that leans toward the cursor):

```tsx
const x = useMotionValue(0), y = useMotionValue(0);
const sx = useSpring(x, { stiffness: 150, damping: 15, mass: 0.3 }); // loose, not wild
const sy = useSpring(y, { stiffness: 150, damping: 15, mass: 0.3 });
// on mousemove, with a distance falloff so the pull fades with range:
const scale = 1 - dist / RANGE;          // RANGE ~ 100px
x.set(dx * INTENSITY * scale);           // INTENSITY ~ 0.4, gentler than most libs
// style={{ x: sx, y: sy }}
```

Tilt (a card that rotates under the cursor):

```tsx
const rx = useTransform(sy, [-0.5, 0.5], [TILT, -TILT]);   // TILT <= 12deg, restraint
const ry = useTransform(sx, [-0.5, 0.5], [-TILT, TILT]);
const transform = useMotionTemplate`perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
// normalise pointer to [-0.5, 0.5] over the element rect; transformStyle: 'preserve-3d'
```

The falloff and the spring are the craft. Keep `INTENSITY` and `TILT` lower than the generic defaults: a hint of pull reads premium, a big lurch reads like a demo. Reduced motion: disable the listener, leave the element static.

## 3. Number roll (shortest path)

A rolling digit must take the short way round, 9 to 0 rolls forward one step, not back nine. Stack the ten digits and spring the column with a modular offset.

```tsx
const offset = (10 + target - current) % 10;     // steps forward
let memo = offset * digitHeight;
if (offset > 5) memo -= 10 * digitHeight;         // go backward when it is closer
// y = memo, spring { stiffness: 120, damping: 20 } (the house counter spring)
```

Use `tabular-nums` so the width never jumps. Reduced motion: set the final value with no transition. This is what `Odometer` does; reach for it before rewriting.

## 4. Spring discipline (the line generic libraries cross)

Think in stiffness and damping, never duration. The house springs:

- UI and counters: `stiffness 120, damping 20`. Critically damped, no wobble.
- A gentle overshoot when motion carried momentum: the curve `--spring: cubic-bezier(.34, 1.4, .5, 1)`.

The tell to avoid: the tacky bounce. Generic libraries ship "bounce" and "swing" presets at `damping 8 to 10` with high stiffness, so elements oscillate before settling. It feels dated. Hard rule: for UI motion, damping does not drop below ~18, and overshoot is a slight lean, never a wobble. If it bounces more than once, it is wrong.

## 5. Stagger orchestration (groups, reveals)

A container holds the timing, each child holds the move. The house reveal is a blur slide, opacity plus a small `y` plus a small blur, staggered.

```tsx
const container = { visible: { transition: { staggerChildren: 0.08 } } };
const itemReveal = {
  hidden:  { opacity: 0, y: 20, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0,  filter: 'blur(0px)' },
};
```

Stagger 0.06 to 0.10s for a handful of items, tighter for many. Fire once on scroll in (see `Reveal`). Never start a child from `scale(0)`, start near `0.96`.

## 6. Self-drawing SVG (the path draw)

A stroke that draws itself reads as craft and costs almost nothing. Set the dash array to the path length and animate the offset to zero. Use `pathLength="1"` so the maths is unit-free: the same code drives a ring, an underline, a signature, or a chart curve.

```html
<path pathLength="1" class="draw" d="..." />
```

```css
.draw   { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 1.2s var(--out); }
.draw.in { stroke-dashoffset: 0; }   /* add .in once, on scroll into view */
```

`stroke-dashoffset` is a presentation attribute, not a layout property, so it animates without reflow. Drive `.in` from an `IntersectionObserver` and fire once. For a live progress meter, set the offset from a value (`1 - pct`) instead of a transition. Reduced motion: skip the transition and render the stroke full (`stroke-dashoffset: 0`), never leave it half drawn.

## Non negotiables (every recipe)

- `transform`, `opacity`, `filter` only (plus `stroke-dashoffset` for the path draw, also non-layout). Never animate width, height, top, margin, padding.
- The `prefers-reduced-motion` path ships in the same change, not later. Disable pointer and scroll inertia, snap counters, render text plain, freeze ambient canvases.
- Stagger is calibrated to the unit, not a flat number.
- Restraint over bounce. Lower the intensity, tilt, and overshoot below the generic defaults.
- Animated text keeps its accessible copy (`sr-only` real text, `aria-hidden` on segments).
- Run the detector before calling it done.
