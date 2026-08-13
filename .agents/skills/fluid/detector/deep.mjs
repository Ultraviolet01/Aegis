// fluid detector, Tier 3 (--deep): DOM-aware checks that the regex core cannot
// see. Runs on real HTML documents through jsdom. Opt-in: the base detector
// stays zero-dependency, this engine is loaded only when --deep is passed and
// jsdom is available. jsdom does no layout, so structural rules are exact and
// the contrast rule is best-effort (literal colors only, var() is skipped).

// ---- helpers ----------------------------------------------------------------

function snippetLine(content, el) {
  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  const cls = el.getAttribute ? el.getAttribute("class") : null;
  let idx = cls ? content.indexOf(`class="${cls}"`) : -1;
  if (idx < 0 && tag) idx = content.indexOf(`<${tag}`);
  if (idx < 0) return 1;
  return content.slice(0, idx).split("\n").length;
}

const classesOf = (el) => ((el.getAttribute && el.getAttribute("class")) || "").trim();

// parse "#abc", "#aabbcc", "rgb()/rgba()" -> [r,g,b] (0-255), or null
function firstColor(str) {
  if (!str) return null;
  if (/\b(transparent|currentcolor|inherit)\b/i.test(str)) return null;
  if (/var\(|gradient/i.test(str)) return null; // can't resolve variables or gradients reliably
  const hex = str.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = str.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/i);
  if (rgb) { if (rgb[4] !== undefined && parseFloat(rgb[4]) < 0.5) return null; return [+rgb[1], +rgb[2], +rgb[3]]; }
  return null;
}

function luminance([r, g, b]) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg), l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// best-effort selector -> {color, bg} map from inline <style> blocks. Only the
// trailing simple class of each selector is indexed, no specificity or cascade.
function parseStyleMap(doc) {
  const map = {};
  for (const style of doc.querySelectorAll("style")) {
    const css = (style.textContent || "").replace(/\/\*[\s\S]*?\*\//g, "");
    const re = /([^{}]+)\{([^{}]+)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const decls = m[2];
      const color = firstColor((decls.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i) || [])[1] || "");
      const bg = firstColor((decls.match(/background(?:-color)?\s*:\s*([^;]+)/i) || [])[1] || "");
      if (!color && !bg) continue;
      for (let sel of m[1].split(",")) {
        sel = sel.trim();
        let k = null;
        const cm = sel.match(/\.([\w-]+)\s*(?::[\w-]+)?$/);
        if (cm) k = cm[1];                              // trailing simple class
        else if (/^[a-z][\w-]*$/i.test(sel)) k = sel.toLowerCase(); // bare tag (body, html, ...)
        if (!k) continue;
        map[k] = map[k] || {};
        if (color) map[k].color = color;
        if (bg) map[k].bg = bg;
      }
    }
  }
  return map;
}

// ---- rules ------------------------------------------------------------------

const CARD = /\b(card|panel|tile)\b/;
const ICON = /\b(icon|ic|ico)\b/;
const CAPPED = /\b(prose|measure|max-w|lead|narrow|copy|content|col|wrap)\b/;

const deepRules = [
  {
    id: "skipped-heading",
    severity: "info",
    hint: "Use the next level down, or restyle a correct-level heading with CSS.",
    run(doc, content) {
      let prev = 0;
      for (const h of doc.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
        const lvl = +h.tagName[1];
        if (prev && lvl > prev + 1) return [{ line: snippetLine(content, h), message: `Heading order skips a level (h${prev} to h${lvl}); breaks the outline and screen-reader nav. First skip shown.` }];
        prev = lvl;
      }
      return [];
    },
  },
  {
    id: "multiple-h1",
    severity: "info",
    hint: "Demote the extras to h2.",
    run(doc, content) {
      const h1 = [...doc.querySelectorAll("h1")];
      if (h1.length < 2) return [];
      return h1.slice(1).map((h) => ({ line: snippetLine(content, h), message: `More than one <h1> (${h1.length} total). Use a single h1 as the page title.` }));
    },
  },
  {
    id: "nested-card",
    severity: "info",
    hint: "Drop the outer card's chrome or the inner one's; do not stack borders and shadows.",
    run(doc, content) {
      const cards = [...doc.querySelectorAll("*")].filter((el) => CARD.test(classesOf(el)));
      const set = new Set(cards);
      const out = [];
      for (const el of cards) {
        let p = el.parentElement, d = 0;
        while (p && d < 4) {
          if (set.has(p)) { out.push({ line: snippetLine(content, el), message: "A card nested directly inside another card (cards in cards). Flatten one level." }); break; }
          p = p.parentElement; d++;
        }
      }
      return out;
    },
  },
  {
    id: "icon-tile-stack",
    severity: "info",
    hint: "Use inline icons, numbers, or a custom illustration instead of identical icon chips.",
    run(doc, content) {
      for (const parent of doc.querySelectorAll("*")) {
        const kids = [...parent.children];
        if (kids.length < 4) continue;
        const withTile = kids.filter((k) => [...k.querySelectorAll("*")].some((e) => ICON.test(classesOf(e))));
        if (withTile.length >= 4 && withTile.length >= kids.length * 0.7) {
          return [{ line: snippetLine(content, parent), message: `${withTile.length} sibling cards each lead with an icon tile. The repeated rounded-square icon chip is a default AI feature grid; vary it.` }];
        }
      }
      return [];
    },
  },
  {
    id: "line-length",
    severity: "info",
    hint: "Cap body copy with max-width: 60 to 72ch (or a measure/prose class).",
    run(doc, content) {
      const out = [];
      for (const p of doc.querySelectorAll("p")) {
        const txt = (p.textContent || "").trim();
        if (txt.length < 160) continue;
        let el = p, capped = false, d = 0;
        while (el && d < 5) {
          if (CAPPED.test(classesOf(el)) || /max-width/.test((el.getAttribute && el.getAttribute("style")) || "")) { capped = true; break; }
          el = el.parentElement; d++;
        }
        if (!capped) out.push({ line: snippetLine(content, p), message: `Paragraph of ${txt.length} characters with no max-width; it runs past a comfortable reading measure (~65 to 75 characters).` });
      }
      return out;
    },
  },
  {
    // High-confidence only: a single class that sets BOTH text color and its own
    // background (a badge, chip, button, banner). jsdom has no cascade, so we do
    // not try to resolve a text colour against an ancestor's background, that
    // route produces false positives. One finding per offending class.
    id: "low-contrast",
    severity: "info",
    hint: "Aim for a 4.5:1 contrast ratio on body text (3:1 on large text).",
    run(doc, content) {
      const map = parseStyleMap(doc);
      const out = [];
      for (const [cls, v] of Object.entries(map)) {
        if (!v.color || !v.bg) continue;
        const ratio = contrastRatio(v.color, v.bg);
        if (ratio >= 4.5) continue;
        const el = [...doc.querySelectorAll("." + (cls.replace(/[^\w-]/g, "")))][0]
          || [...doc.querySelectorAll("*")].find((e) => classesOf(e).split(/\s+/).includes(cls));
        out.push({ line: el ? snippetLine(content, el) : 1, message: `.${cls} sets text and background at ~${ratio.toFixed(2)}:1, below the 4.5:1 AA floor (best-effort, literal colors only).` });
      }
      return out;
    },
  },
];

export async function scanDeep(fileData, { disabledRules = [] } = {}) {
  let JSDOM;
  try { ({ JSDOM } = await import("jsdom")); }
  catch { throw new Error("--deep needs jsdom. The fluid-skills CLI bundles it; for the raw script run `npm i jsdom` first."); }
  const disabled = new Set(disabledRules);
  const findings = [];
  for (const { file, content } of fileData) {
    if (!/\.html?$/i.test(file)) continue; // jsdom needs a real HTML document
    let doc;
    try { doc = new JSDOM(content).window.document; } catch { continue; }
    for (const rule of deepRules) {
      if (disabled.has(rule.id)) continue;
      for (const h of rule.run(doc, content)) {
        findings.push({ file, line: h.line || 1, col: 1, id: rule.id, severity: rule.severity, message: h.message, hint: rule.hint });
      }
    }
  }
  return findings;
}

export { deepRules };
