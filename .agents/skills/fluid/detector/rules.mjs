// Deterministic anti-pattern rules for the `fluid` detector. No API calls.
// Each rule: { id, severity: 'error'|'warn'|'info', files?: RegExp(pathTest),
//   pattern?: RegExp(global), scan?: (content, file) => [{index, message?}], message, hint? }
// Rules split in two halves: MOTION (how it moves) and GENERIC LOOK (how it looks).
// Philosophy: these flag GENERIC or JANKY motion, never the presence of motion.
// fluid loves animation. The detector catches the wrong kind, not the act of animating.

const CODE = /\.(css|scss|sass|less|html|htm|jsx|tsx|js|ts|mjs|cjs|vue|svelte|astro)$/i;
const MARKUP = /\.(html|htm|jsx|tsx|vue|svelte|astro)$/i;

export const rules = [
  // ---------- MOTION ----------
  {
    id: "transition-all",
    severity: "info",
    files: CODE,
    pattern: /transition:\s*all\b|(?<![\w-])transition-all(?![\w-])/g,
    message: "transition: all animates every property, including layout. Name the properties you actually animate.",
    hint: "transition: color .2s, background-color .2s;",
  },
  {
    id: "animate-layout-property",
    severity: "warn",
    files: CODE,
    pattern: /transition(?:-property)?:\s*[^;{}\n]*\b(?:width|height|top|left|right|bottom|margin|padding)\b/gi,
    message: "Transitioning a layout property triggers reflow and stutters. Animate transform and opacity instead.",
    hint: "Use transform: translate()/scale() for movement and size changes.",
  },
  {
    id: "ease-in",
    severity: "info",
    files: CODE,
    pattern: /\bease-in\b(?!-out)/g,
    message: "ease-in suits exits more than enters. For enters use ease-out (the house --out).",
    hint: "transition-timing-function: var(--out, cubic-bezier(.22,1,.36,1));",
  },
  {
    id: "scale-zero",
    severity: "warn",
    files: CODE,
    pattern: /scale\(\s*0(?![\d.])\s*\)|(?<![\w-])scale:\s*0(?![\d.])/g,
    message: "Animating from scale(0) makes elements materialise from nothing. Start near 0.93 so it grows.",
    hint: "initial scale 0.93, or scale-95 in Tailwind.",
  },
  {
    id: "long-duration",
    severity: "info",
    files: CODE,
    scan: (content) => {
      const out = [];
      const re = /\b(?:transition|animation|duration)\b[^;{}\n]*?(?<![\d.])(\d+(?:\.\d+)?|\.\d+)(ms|s)\b/gi;
      let m;
      while ((m = re.exec(content))) {
        const v = parseFloat(m[1]);
        const ms = m[2].toLowerCase() === "s" ? v * 1000 : v;
        if (ms > 1200) out.push({ index: m.index, message: `Animation runs ${ms}ms. Fine for a deliberate reveal or ambient loop, sluggish on a frequent interaction.` });
      }
      return out;
    },
    message: "Very long animation. Fine for a deliberate reveal or ambient loop, sluggish on a frequent interaction.",
    hint: "Micro-interactions ~150 to 250ms; reveals and heroes can run longer.",
  },
  {
    id: "dated-bounce-ease",
    severity: "info",
    files: CODE,
    pattern: /cubic-bezier\(\s*[^)]*?-\d*\.?\d+[^)]*\)/g,
    message: "A cubic-bezier with a negative control point is the dated back/anticipate bounce. Prefer a real spring or the house --spring.",
    hint: "--spring: cubic-bezier(.34, 1.4, .5, 1); or a framer spring (damping, stiffness).",
  },
  {
    id: "bouncy-spring",
    severity: "info",
    files: CODE,
    scan: (content) => {
      const out = [];
      const re = /damping:\s*(\d+(?:\.\d+)?)/gi;
      let m;
      while ((m = re.exec(content))) {
        const d = parseFloat(m[1]);
        if (d > 10) continue;
        const w = content.slice(Math.max(0, m.index - 90), m.index + 90);
        if (/stiffness:|useSpring|type:\s*["']?spring/i.test(w)) out.push({ index: m.index, message: `A spring with damping ${d} wobbles before settling, the dated bounce. Raise damping (~18+) for UI motion.` });
      }
      return out;
    },
    message: "Low spring damping makes elements wobble before settling, the dated bounce. Raise damping for UI motion.",
    hint: "Critically damped UI springs sit around stiffness 120, damping 20. Overshoot is a slight lean, never a wobble.",
  },

  // ---------- GENERIC LOOK (the anti-generic core) ----------
  {
    id: "generic-font",
    severity: "warn",
    files: CODE,
    pattern: /(?:font-family\s*:|fontFamily\s*[:=])\s*\[?\s*["']?(?:Inter|Roboto|Arial|Helvetica)\b/gi,
    message: "Generic font set as the primary family (Inter/Roboto/Arial) is the top AI-slop tell. Pick a distinctive typeface (fallbacks are fine).",
    hint: "Pair a characterful display font with a refined body font.",
  },
  {
    id: "cliche-purple-gradient",
    severity: "warn",
    files: CODE,
    pattern: /(?:linear|radial|conic)-gradient\([^)]*(?:\b(?:purple|violet|indigo|fuchsia)\b|#(?:8b5cf6|a855f7|7c3aed|9333ea|6366f1|818cf8|c084fc|d8b4fe|a78bfa|c4b5fd)\b)[^)]*\)|(?<![\w-])(?:from|via|to)-(?:purple|violet|indigo|fuchsia)-\d{2,3}(?![\w-])|(?<![\w-])(?:from|via|to)-\[#(?:8b5cf6|a855f7|7c3aed|9333ea|6366f1|818cf8|c084fc|d8b4fe|a78bfa|c4b5fd)\](?![\w-])/gi,
    message: "The purple/violet gradient is the canonical AI-app look. Use a brand-specific palette and ration the accent.",
    hint: "Commit to a distinctive dominant color with one sharp accent, not a default purple wash.",
  },
  {
    id: "flat-purple-default",
    severity: "info",
    files: CODE,
    // The flat indigo/violet default (bg-indigo-500 button, text-indigo-600 link) is
    // the 2026 Tailwind AI tell. Info, not warn: a brand may legitimately be indigo,
    // so this nudges rather than blocks. Scoped to bg/text at the vivid default shades.
    pattern: /(?<![\w-])(?:bg|text)-(?:indigo|violet|purple)-(?:400|500|600|700)(?![\w-])/g,
    message: "A flat indigo or violet at the default shade (bg-indigo-500, text-indigo-600) is the 2026 AI default palette. Keep it only if indigo is genuinely the brand, otherwise commit to a distinctive color.",
    hint: "Commit to a brand-specific dominant color; do not ship the default indigo just because it is the default.",
  },
  {
    id: "purple-glow-shadow",
    severity: "info",
    files: CODE,
    // The "neon-on-dark" v0/Cursor signature: a colored purple/violet glow
    // via box-shadow instead of a neutral one. Scoped to the Tailwind
    // shadow-color utility for the purple family (shadow-violet-600/40) and
    // to shadow declarations that carry one of the known vibecode-purple
    // hexes (the same list cliche-purple-gradient uses), so a plain neutral
    // shadow-lg or a black/gray glow never fires.
    pattern: /(?<![\w-])shadow-(?:purple|violet|indigo|fuchsia)-\d{2,3}(?:\/\d{1,3})?(?![\w-])|(?:box-shadow:\s*[^;{}\n]*|shadow-\[[^\]]*)#(?:8b5cf6|a855f7|7c3aed|9333ea|6366f1|818cf8|c084fc|d8b4fe|a78bfa|c4b5fd)\b/gi,
    message: "A colored purple/violet glow shadow is the neon-on-dark v0/Cursor signature. Use a neutral shadow, or a restrained glow in the brand color.",
    hint: "box-shadow: 0 8px 24px rgba(0,0,0,.35); or a single low-opacity brand-color glow, not a default indigo one.",
  },
  {
    id: "pure-black",
    severity: "info",
    files: CODE,
    pattern: /#000(?:000)?\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|(?<![\w-])(?:text|bg|border)-black(?![\w-])/g,
    message: "Pure black reads harsh and generic. Use a tuned near-black.",
    hint: "e.g. #0e1326, or the house dark #08080a, instead of #000.",
  },
  {
    id: "emoji-icon",
    severity: "info",
    files: MARKUP,
    pattern: /\p{Extended_Pictographic}/gu,
    message: "Emoji used in markup. Emojis render inconsistently across platforms; use an SVG icon or your bespoke set.",
    hint: "Lucide or Phosphor, or hand-drawn SVG for signature work.",
  },
  {
    id: "template-signature",
    severity: "info",
    files: CODE,
    pattern: /\b(?:BackgroundBeams|BorderBeam|border-beam|animate-aurora|animate-shimmer|text-shimmer|Meteors|TracingBeam|HeroHighlight|GlowingStars|bg-grid-|bg-dot-|BorderTrail|border-trail|GlowEffect|glow-effect|SpinningText|spinning-text|TextShimmerWave|text-shimmer-wave|ProgressiveBlur|progressive-blur|WavyBackground|wavy-background|RetroGrid|retro-grid)\b/g,
    message: "Recognisable template component from a motion or UI library (Aceternity, Magic UI, 21st, motion-primitives). Re-skin with your tokens and motion, do not ship verbatim.",
    hint: "Keep the structure, replace the look (color, type, easing) with your design system.",
  },
  {
    id: "space-grotesk",
    severity: "info",
    files: CODE,
    pattern: /Space\s+Grotesk/gi,
    message: "Space Grotesk is the display font AI generations converge on. Vary it to stay distinctive.",
    hint: "Pick a heading font with more specific character.",
  },
  {
    id: "overused-display-font",
    severity: "info",
    files: CODE,
    // Satoshi is deliberately NOT on this list: the design-system's own type pairings
    // use it as a body face under a distinctive display (Clash Display + Satoshi, the
    // Bitcoin pairing), and this regex cannot tell display from body usage. Flagging it
    // would turn the detector against the house database and the shipped bitcoin example.
    pattern: /(?:font-family\s*:|fontFamily\s*[:=])\s*\[?\s*["']?(?:Geist\b(?!\s+Mono)|Plus\s+Jakarta(?:\s+Sans)?|Poppins|DM\s+Sans|Cal\s+Sans)\b/gi,
    message: "Geist, Plus Jakarta Sans, Poppins, DM Sans and Cal Sans are the faces AI generations converge on. Vary the headline font to stay distinctive, and rotate it across a multi-page suite.",
    hint: "Pick a heading font with more specific character; do not reuse one default across every page.",
  },
  {
    id: "gradient-text",
    severity: "info",
    files: CODE,
    pattern: /(?:-webkit-)?background-clip:\s*text|(?<![\w-])bg-clip-text(?![\w-])/gi,
    message: "Gradient text is a common AI tell when used everywhere. Ration it to one accent word, or use a solid color.",
    hint: "Keep clipped-gradient text for a single hero word, not whole paragraphs.",
  },
  {
    id: "glassmorphism-blur",
    severity: "info",
    files: CODE,
    pattern: /backdrop-filter:\s*[^;{}\n]*\bblur\(|(?<![\w-])backdrop-blur(?:-(?:none|sm|md|lg|xl|2xl|3xl))?(?![\w-])/gi,
    message: "Frosted-glass via backdrop-filter blur is the canonical 2024-2025 AI look, and it ships a Chrome compositing bug (a hard rectangle on hover). Fake the depth with a translucent gradient.",
    hint: "A layered translucent gradient reads as glass without the GPU blur or the hover rectangle.",
  },
  {
    id: "blur-orb",
    severity: "info",
    files: CODE,
    // The decorative blurred gradient orb (a big absolutely-positioned rounded-full
    // element under a heavy blur) is the canonical 2025-2026 AI hero glow. Scoped to
    // the co-occurrence of absolute + rounded-full + a HEAVY blur (blur-2xl/3xl, or an
    // arbitrary blur-[>=40px]) in one class attribute, so a restrained small blur
    // (blur-sm/blur/blur-md/blur-lg/blur-xl) on a rounded element stays silent.
    scan: (content) => {
      const out = [];
      const heavy = /(?<![\w-])blur-(?:2xl|3xl)(?![\w-])|(?<![\w-])blur-\[(\d+)px\](?![\w-])/;
      const round = /(?<![\w-])rounded-full(?![\w-])/;
      const abs = /(?<![\w-])absolute(?![\w-])/;
      const attr = /(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|\{`([^`]*)`\})/gi;
      let m;
      while ((m = attr.exec(content))) {
        const cls = m[1] || m[2] || m[3] || m[4] || "";
        const hb = heavy.exec(cls);
        if (!hb) continue;
        if (hb[1] !== undefined && parseInt(hb[1], 10) < 40) continue; // arbitrary blur must be a large radius
        if (round.test(cls) && abs.test(cls)) out.push({ index: m.index });
      }
      return out;
    },
    message: "A big blurred gradient orb (absolute, rounded-full, heavy blur) behind the hero is the default AI glow. Make the depth bespoke, or drop it.",
    hint: "Replace the blurred blob with a real gradient mesh, grain, or a single restrained glow in a brand color.",
  },
  {
    id: "colored-left-border",
    severity: "info",
    files: CODE,
    // A thick saturated strip down one side of a card is a top AI-card tell. Scoped
    // to the Tailwind form: border-l-2/3/4 plus a saturated border-<hue>-<n> in the
    // same class. Excluded so they never false-positive: neutral hues, hairline
    // widths, and callouts / admonitions (a colored edge paired with a light bg tint
    // of the same family, e.g. border-l-4 border-blue-500 bg-blue-50), which are legit UI.
    scan: (content) => {
      const out = [];
      const SAT = "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
      const strip = new RegExp("(?<![\\w-])border-l-[234](?![\\w-])");
      const satBorder = new RegExp(`(?<![\\w-])border-(?:${SAT})-\\d{2,3}(?![\\w-])`);
      const calloutTint = new RegExp(`(?<![\\w-])bg-(?:${SAT})-(?:50|100|200)(?![\\w-])`);
      const attr = /(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|\{`([^`]*)`\})/gi;
      let m;
      while ((m = attr.exec(content))) {
        const cls = m[1] || m[2] || m[3] || m[4] || "";
        if (strip.test(cls) && satBorder.test(cls) && !calloutTint.test(cls)) out.push({ index: m.index });
      }
      return out;
    },
    message: "A thick colored strip down one side of a card is one of the most recognisable AI-card tells. Drop it, or carry the accent through type and spacing instead.",
    hint: "Remove the side strip; if you need emphasis, use a full hairline border or a background tint in a brand color.",
  },
  {
    id: "justified-text",
    severity: "info",
    files: CODE,
    pattern: /text-align:\s*justify|(?<![\w-])text-justify(?![\w-])/g,
    message: "Justified text creates rivers of whitespace on the web. Use left-aligned.",
    hint: "text-align: left;",
  },
  {
    id: "tiny-text",
    severity: "info",
    files: CODE,
    pattern: /font-size:\s*[1-9]px\b/gi,
    message: "Text under 10px is hard to read. Lift it.",
    hint: "Smallest readable label is around 11 to 12px.",
  },
  {
    id: "em-dash",
    severity: "warn",
    files: CODE,
    pattern: /—|–/g,
    message: "An em-dash or en-dash in output. The house style bans them. Use a comma, a period, or a colon.",
    hint: "Replace with , . or :",
  },
  {
    id: "crushed-tracking",
    severity: "info",
    files: CODE,
    // CSS letter-spacing tighter than -0.04em, plus the Tailwind `tracking-tighter`
    // utility (-0.05em), the same crush in class form. `tracking-tight` (-0.025em)
    // sits above the threshold and is deliberately left alone.
    pattern: /letter-spacing:\s*-0?\.(?:0[5-9]|[1-9])\d*em|(?<![\w-])tracking-tighter(?![\w-])/gi,
    message: "Letter-spacing tighter than -0.04em (or the Tailwind tracking-tighter utility) crushes characters together. Ease it.",
    hint: "Large headings -0.02 to -0.03em, body 0.",
  },
  {
    id: "marketing-buzzword",
    severity: "info",
    files: MARKUP,
    pattern: /\b(?:streamline|supercharge|empower|seamless(?:ly)?|cutting-edge|next-level|game-?chang(?:er|ing)|unlock your|effortless(?:ly)?)\b/gi,
    message: "Generic SaaS buzzword. Say the specific thing the product does.",
    hint: "Replace 'supercharge your workflow' with the concrete benefit.",
  },
  {
    id: "numbered-section-markers",
    severity: "info",
    files: CODE,
    pattern: /(?<![\w.#-])0\d\s*(?:·|\/|\.)\s*[A-Za-z]/g,
    message: "Zero-padded section numbers (01, 02, 00 / INDEX) used as eyebrows are a generated-layout tell. Let the section titles carry themselves.",
    hint: "Drop the 01 / 02 markers, or keep them only where a real sequence matters.",
  },
  {
    id: "hero-eyebrow-chip",
    severity: "info",
    files: MARKUP,
    pattern: /class="[^"]*\b(?:eyebrow|kicker|overline)\b[^"]*"[^>]*>[^<]{1,48}<\/[a-z]+>\s*<h1/gi,
    message: "A small label sitting right above the h1 (the eyebrow or kicker chip) is the default AI hero. Fold it into the headline or drop it.",
    hint: "Integrate the kicker into the headline, or run it as a breadcrumb in the nav.",
  },
  {
    id: "oversized-type",
    severity: "info",
    files: CODE,
    pattern: /font-size:\s*(?:1[2-9]\d|[2-9]\d\d)px/gi,
    message: "A fixed font-size of 120px or more does not scale. Use a responsive clamp() so the hero holds on every screen.",
    hint: "font-size: clamp(40px, 6vw, 76px);",
  },
];

export const projectRules = [
  {
    id: "no-reduced-motion",
    severity: "warn",
    test: (fileData) => {
      const hasMotion = fileData.some((f) => /@keyframes|animation:\s|transition:\s|framer-motion|\bmotion\b|whileInView|animate=\{|useScroll|\blenis\b/i.test(f.content));
      const hasGuard = fileData.some((f) => /prefers-reduced-motion|useReducedMotion/.test(f.content));
      if (hasMotion && !hasGuard) {
        return [{ file: "(project)", line: 0, message: "The project animates but has no prefers-reduced-motion path anywhere. Add reduced-motion handling.", hint: "@media (prefers-reduced-motion: reduce) { ... } or useReducedMotion()." }];
      }
      return [];
    },
  },
];
