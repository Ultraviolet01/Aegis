# Tech-stack database

A curated set of build stacks, one per project type. The `init` picks a stack here the same way it picks a palette or a type pairing: commit to one per project, do not assemble a generic toolchain from habit. Each entry names a real framework, a styling approach, an animation library, a data or charts layer, and the key supporting libraries, then ties them back to the house tokens and motion so the build ships on-brand by default, not after a retrofit.

Every stack assumes the same foundation: self-hosted fonts as woff2 with `font-display: swap` (`type-pairings.md`), the four easing tokens declared once in `:root` (`--out`, `--spring`, `--ease`, `--ios` from `motion-presets.md`), color rationed to one dominant plus one accent over tuned neutrals (`palettes.md`), a near-black that is never `#000`, and a `prefers-reduced-motion` path shipped in both CSS and JS. The stack is the plumbing; the tokens are the brand. Pick the stack for the product, then wire the tokens through it.

## Pick by intent

| Stack | Use when | Core |
|---|---|---|
| **Next.js product app** | a real app with auth, data, and routes (SaaS, dashboards, dev tools) | Next.js App Router · Tailwind · Framer Motion · TanStack Query |
| **Astro content site** | marketing, a blog, a landing page where content and speed win | Astro · Tailwind · GSAP or View Transitions · MDX |
| **SvelteKit app** | a snappy app or interactive site, less framework weight | SvelteKit · CSS or UnoCSS · native transitions + Motion One · LayerChart |
| **Nuxt / Vue site** | a Vue team, a marketing or content product | Nuxt · Tailwind or UnoCSS · @vueuse/motion · @unovis/vue |
| **Plain HTML and CSS** | a one-pager, a launch, a single landing where a framework is overkill | hand-written HTML · modern CSS · the Web Animations API · zero deps |
| **Tailwind component app** | a fast-moving product, a team that ships from utilities | Vite or Next.js · Tailwind · Radix primitives · Framer Motion |
| **Typed-token app** | a design system or a brand where tokens must be type-safe | vanilla-extract or CSS Modules · Sprinkles or typed vars · Framer Motion |
| **Static docs** | documentation, a handbook, an API reference | Astro Starlight or Nextra · MDX · Shiki · Pagefind |
| **Dashboard / data-heavy** | analytics, an admin panel, anything chart-first | Next.js · Tailwind · Visx or ECharts · TanStack Table + Query |
| **E-commerce** | a store, a product catalogue, checkout | Next.js Commerce or Astro · Tailwind · Framer Motion · Shopify Hydrogen or Medusa |

## Next.js product app

For a real product with authentication, data, and many routes. The default app stack when the brief is a tool, not a page.

- **Framework**: Next.js App Router, React Server Components, TypeScript strict. `next/font` self-hosts the type pairing, no font CDN.
- **Styling**: Tailwind with the palette wired into `tailwind.config` as semantic tokens (`bg-base`, `surface`, `text`, `dominant`, `accent`), not raw hexes scattered in class names.
- **Animation**: Framer Motion for component transitions, `prefers-reduced-motion` honored via its `useReducedMotion` hook so reveals snap.
- **Data**: TanStack Query for server state, Zod for validation, server actions or tRPC for mutations.
- **Key libraries**: Radix UI primitives for accessible menus and dialogs, `cmdk` for command palette, `sonner` for toasts.
- **House default**: map the four easings to Framer's `ease` arrays (`--out` as `[.22,1,.36,1]`), keep enters on `--out`, micro-interactions on `--spring`, route changes as a cross-fade up (400ms). One accent on the CTA and focus ring, everything else an ink tint. Never the split hero + three cards skeleton; pick a layout from `layouts.md`.

## Astro content site

For marketing, a blog, or a landing page where Lighthouse and content authoring matter more than client interactivity. Ships almost no JS by default.

- **Framework**: Astro with islands, partial hydration only where a widget needs it (`client:visible`).
- **Styling**: Tailwind, or plain CSS with custom properties if the site is small enough to hold in one head.
- **Animation**: GSAP with ScrollTrigger for scroll-driven reveals, or native View Transitions for page changes. IntersectionObserver for the soft-rise reveal, never scroll listeners.
- **Data**: MDX and content collections with a typed schema, no CMS unless the client edits daily.
- **Key libraries**: `astro-icon` for SVG icons, `@astrojs/sitemap`, `sharp` for responsive images.
- **House default**: build the visuals in CSS and SVG, one real photo where it earns its place. Reveals are soft rise (600ms, `--out`) staggered 60 to 90ms, capped at ~8 items. Run galleries and image heroes full-bleed, keep running text near 60ch. The accent appears once per section, not per element.

## SvelteKit app

For a fast interactive app or site when React's weight is not justified and the team likes the compiler. Less runtime, more done in CSS.

- **Framework**: SvelteKit, TypeScript, Vite under the hood.
- **Styling**: scoped component CSS with custom properties, or UnoCSS for atomic utilities. Tokens live in a single `app.css` `:root`.
- **Animation**: Svelte's built-in `transition:` and `animate:flip` for the FLIP shared-element move, Motion One for anything spring-based.
- **Data**: SvelteKit `load` functions and form actions, Zod for validation, native stores for client state.
- **Charts**: LayerChart or a hand-built SVG when the chart list in `chart-types.md` covers it.
- **House default**: Svelte's `cubicOut` is close but declare the exact `--out` curve and feed it to `transition:fly` so motion matches the rest of the system. The `flip` animation is the shared-element preset (500ms, `--ease`); measure rects, do not guess. Reduced motion gates the transitions in the component, not just CSS.

## Nuxt / Vue site

For a Vue team building a marketing or content product. The Vue counterpart to the Next.js and Astro stacks.

- **Framework**: Nuxt 3, TypeScript, auto-imported composables.
- **Styling**: Tailwind via `@nuxtjs/tailwindcss`, or UnoCSS for a lighter atomic engine. Palette as theme tokens, never inline hexes.
- **Animation**: `@vueuse/motion` for declarative directives, `@vueuse/core` for IntersectionObserver and `useReducedMotion`.
- **Data**: Nuxt `useFetch` and `useAsyncData`, Pinia for client state, Zod or Valibot for schemas.
- **Charts**: `@unovis/vue` for the data-heavy pages, styled to the house chart defaults.
- **House default**: bind `v-motion` presets to the four easings; the page enter is a cross-fade up, cards lift on hover (200ms, `--spring`). Content collections in `@nuxt/content` with MDC for editorial pages. Hold the layout choice across the site, vary the archetype between pages so two never share a silhouette.

## Plain HTML and CSS

For a one-pager, a launch page, or a single landing where a build step and a framework are pure overhead. Zero dependencies, instant load, nothing to maintain.

- **Framework**: none. Hand-written semantic HTML, one stylesheet, an optional small module script.
- **Styling**: modern CSS with custom properties for every token, `clamp()` for fluid type, container queries and `:has()` for layout logic, nesting natively.
- **Animation**: the Web Animations API (`element.animate`) for reveals and presses, CSS transitions for hovers, `IntersectionObserver` to trigger.
- **Data**: none, or a single `fetch` to a JSON file if a list is data-driven.
- **Key libraries**: none on purpose. Inline the critical CSS, lazy-load below the fold.
- **House default**: declare the four easings and the palette in `:root`, name nothing twice. Reveals via `element.animate([...], { easing: 'cubic-bezier(.22,1,.36,1)', duration: 600 })`. Press is `:active { scale(.97) }` at 120ms `--spring`. Gate everything on `matchMedia('(prefers-reduced-motion: reduce)').matches`. A one-pager is where restraint reads as craft; commit to one layout archetype and use the full width.

## Tailwind component app

For a fast-moving product or a team that ships from a utility-first system. The pragmatic default when velocity matters and the design language is consistent.

- **Framework**: Vite + React, or Next.js if routing and SSR are needed.
- **Styling**: Tailwind as the system, the palette and type scale defined in `tailwind.config` so utilities reference tokens, with `tailwind-merge` and `clsx` to compose variants cleanly.
- **Animation**: Framer Motion for orchestrated motion, `tailwindcss-animate` only for trivial entrance utilities.
- **Components**: Radix UI primitives for behavior, styled with Tailwind. Treat shadcn/ui as a starting point to retheme hard, never ship its defaults unedited.
- **House default**: the trap here is that Tailwind plus an unedited component kit is exactly the generic AI look. Retheme: replace the default radius, neutral, and accent with the chosen palette, swap the font, set the easing tokens. One accent class, near-black not `slate-950` raw. The utilities are a means to the tokens, not a substitute for them.

## Typed-token app

For a design system or a brand where tokens must be type-safe and themes must not drift. Catches a wrong color or a missing variant at compile time.

- **Framework**: Vite or Next.js, React, TypeScript strict.
- **Styling**: vanilla-extract with `createTheme` and Sprinkles for the token contract, or CSS Modules with typed CSS custom properties when the team prefers plain CSS. Tokens are a typed object, not a convention.
- **Animation**: Framer Motion, with the easing arrays exported from the same token file the styles import.
- **Data**: stack-agnostic; pair with TanStack Query if it is an app.
- **Key libraries**: `@vanilla-extract/sprinkles` for atomic typed utilities, Style Dictionary if tokens feed multiple platforms.
- **House default**: model the system as token tiers, a primitive layer (the raw palette hexes, the easing curves) and a semantic layer (`bg-base`, `surface`, `text`, `dominant`, `accent`). Light and dark are two `createTheme` contracts over the same contract shape. The point is that the near-black, the single accent, and the four easings are enforced by the types, so a teammate cannot quietly reintroduce `#000` or a second accent.

## Static docs

For documentation, a handbook, or an API reference. Reading-first, searchable, fast, low-ceremony to author.

- **Framework**: Astro Starlight for content-led docs, Nextra if the docs live beside a Next.js app.
- **Styling**: the framework's theme overridden with the house tokens, a single long column at a readable measure.
- **Animation**: almost none. Minimal fast reveals, instant navigation. Docs reward stillness.
- **Content**: MDX with frontmatter, Shiki for syntax highlighting themed to the palette, not a stock dark theme.
- **Key libraries**: Pagefind for static full-text search, `rehype-autolink-headings` for anchors, `expressive-code` for annotated snippets.
- **House default**: pick the single long-column archetype, dividers and an inset image, body at 16px line-height 1.5 near 60ch. Retheme Shiki so code blocks use the brand near-black and one accent for keywords, never the default Dracula purple. The accent marks the active nav item and inline links, nothing else. Reduced motion is effectively the baseline here.

## Dashboard / data-heavy

For analytics, an admin panel, or any chart-first product where the data is the interface. Density is allowed; honesty is mandatory.

- **Framework**: Next.js App Router, TypeScript strict, server components for the data shell.
- **Styling**: Tailwind with tabular-nums on every number, the chart defaults from `chart-types.md` wired as shared chart tokens.
- **Animation**: Framer Motion for panel transitions, count-up on stats with `--ease` over 900 to 1400ms, charts animate on first reveal only then hold.
- **Data**: TanStack Table for grids, TanStack Query for fetching, Visx (low-level, full control) or ECharts (batteries-included) for charts. Recharts only for a quick standard set.
- **Key libraries**: `date-fns` for time axes, `@tanstack/react-virtual` for long tables, Zod for the API contract.
- **House default**: ration color exactly like the rest of the system, the dominant and the accent carry meaning, everything else is an ink tint, never a rainbow categorical scale and never the purple default. Numbers right-aligned in the mono, hairline row separators only, gridlines as low ink tints behind the data. A table beats a chart when the reader needs exact values; reach for `chart-types.md` before inventing a visual.

## E-commerce

For a store, a product catalogue, or checkout. Conversion and speed first, the brand carried through every state.

- **Framework**: Next.js Commerce (headless) or Astro for a content-heavy catalogue, TypeScript.
- **Styling**: Tailwind with the palette as tokens, product imagery framed and consistent.
- **Animation**: Framer Motion for the cart sheet and product transitions, the shared-element FLIP move from a thumbnail to a product hero (500ms, `--ease`).
- **Commerce**: Shopify Hydrogen and the Storefront API, or Medusa for a self-hosted backend, Stripe for payments off-platform.
- **Key libraries**: `next/image` or `astro:assets` for responsive product photos, `zustand` for the cart, `embla-carousel` for galleries (paused, not auto-advancing).
- **House default**: the cart is a bottom or side sheet, panel and dimmer as two separate layers (420ms, `--ease`), never fade-while-sliding. Add-to-cart gets the press (scale .97, `--spring`) and a real state change, not just a toast. Image zoom on the product frame is `scale(1 to 1.04)` with `overflow:hidden`. A bento mosaic or gallery-first archetype suits a catalogue; keep one accent for price-and-buy, the metallic for hairlines if the brand earns it.

## Rules when picking

- One stack per project, chosen for the product. An app gets an app stack, a one-pager gets plain HTML and CSS; do not reach for Next.js to ship a single landing page.
- The framework is interchangeable, the tokens are not. Whatever the stack, the four easings, the single rationed accent, the tuned near-black, and the self-hosted type pairing are wired the same way.
- Utility frameworks and component kits ship a generic default look. If you use Tailwind or shadcn/ui, retheme hard: palette, radius, font, easing. An unedited kit is the converged AI aesthetic.
- Animate transform and opacity only, in any stack. Map the framework's easing API to the house curves rather than accepting its defaults.
- Ship the reduced-motion path in both CSS and JS, in every stack. Gate observers and loops on `matchMedia`, snap counters, freeze ambient.
- Self-host fonts, never a font CDN. No purple AI gradient, no `#000`, never Inter as the display face, whatever the toolchain.
