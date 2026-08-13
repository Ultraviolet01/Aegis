# Principles, condensed to rules

## Fluid interface principles

A fluid interface feels like an extension of the user's mind and body. Eight principles, as rules:

1. Response: respond instantly to every input. Hunt down and remove latency and timers. Delay breaks the feeling of connection.
2. Redirectable: let the user change their mind mid-gesture. Gestures should be interruptible and reversible at any point.
3. Spatial consistency: things return the way they left. If a panel slides in from the right, it slides back to the right, not down.
4. Hint toward the gesture: feedback grows toward the final state as the user acts, so the outcome feels predictable.
5. Light input, amplified output: capture position, velocity, and force, build an inertial profile, and let momentum carry the result far. No laborious long swipes.
6. Soft boundaries: rubber-band at edges instead of hard stops. Always signal "I see you", never freeze.
7. Rich frames: smoothness is what is in each frame, not just frame rate. Use motion blur and elastic stretch to carry more information per frame.
8. Behavior over animation: design a physical behavior driven by forces, not a fixed animation curve. Heavier objects carry more momentum, lighter ones respond faster.

Spring model: control damping (overshoot) and response (how fast it reaches target). Never think in duration. Default to 100 percent damping (no overshoot); add bounce only when the gesture had momentum.

## When not to animate

You often do not need animation:
- Do not animate high-frequency interactions (menus opened hundreds of times a day, keyboard actions, repeated hovers). Instant is better.
- Animate the occasional, the educational, and the spatial. A rarely seen morph is a delight; a daily one is an annoyance.

Seven practical tips:
1. Scale buttons down on `:active` (`scale(0.97)`) for instant tactile feedback.
2. Never animate from `scale(0)`. Start near `0.93` so it grows, not appears from nothing.
3. Do not delay repeated tooltips. Delay the first, make the rest instant.
4. Choose the right easing: `ease-out` for enter and exit, never `ease-in`.
5. Make scaling origin-aware: popovers grow from their trigger via the transform-origin variable.
6. Keep it fast: under 300ms, selects around 180ms.
7. Use `filter: blur(2px)` when easing and timing alone do not fix a janky transition.

Developing taste: surround yourself with great work, rationalize why something works instead of trusting gut feel, then practice and seek critique.

## House synthesis

It all points one way: motion is a tool, not a flourish. Decide if it should move first. When it moves, make it fast, responsive, physical, interruptible, spatially honest, and always with a reduced-motion path. Ration the brand: a 2px gradient hairline beats a full-screen light show.

## Across a suite (more than one page)

Build one page and the risk is too little motion. Build ten and the risk inverts: the same motion on all of them. Generated suites converge, and motion converges hardest, because the same premium kit gets pasted onto every page. The set, repeated, reads as a template even when each effect passes every per-page rule.

The quartet that signals "AI premium" right now: cards that tilt toward the cursor, buttons that stick to it, numbers that count up, a spotlight glow that trails the pointer. None is wrong on its own (fluid ships the pointer and counter recipes). Wrong is shipping all four on every page. Used once, deliberately, a single one is a signature; used everywhere, the four together are wallpaper.

The rule: no two pages alike. Give each page one signature interaction and make it on theme, something that dramatizes what the page is actually about. A deploy view earns a pipeline that fills, a fundraiser earns a funding meter, a course earns a chart that draws itself. That beats a generic stat count-up every time, because it carries meaning, not just motion. Vary the display face the same way: one headline font per page, no shared default.

## Interaction craft (from production)

Hard-won on real builds, the kind of detail that separates a polished app from a janky one:
- Modal layering: the dimmer (backdrop) fades on its OWN layer, the panel slides in opaque. If the panel is a child of a fading backdrop, it fades while it slides and reads as a flash. Keep them on separate layers.
- Never unmount a modal or overlay as a side-effect of an unrelated state change (a counter hitting 0 that hides its parent, a fetch resolving). The reward vanishes mid-reveal. Drive visibility from its own intent, not a coincidental condition.
- Global click listeners (click sparks, dismiss-on-outside) must attach in the capture phase (`addEventListener('click', fn, true)`). In the bubble phase a modal's `stopPropagation()` swallows them.
- Reduced motion at two levels: the CSS guard (`@media (prefers-reduced-motion: reduce)`) AND the JS guard (`useReducedMotion()` / `<MotionConfig reducedMotion="user">`). One without the other leaves gaps.
