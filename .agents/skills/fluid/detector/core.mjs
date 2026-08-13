// fluid detector core: the importable scan engine behind detect.mjs and the
// fluid-skills CLI. Zero dependencies. The regex pass stays pure; the optional
// --deep (jsdom) pass is loaded lazily by runDetect only when asked for.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, sep } from "node:path";
import { rules, projectRules } from "./rules.mjs";

export const CODE_EXT = /\.(css|scss|sass|less|html|htm|jsx|tsx|js|ts|mjs|cjs|vue|svelte|astro)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".tanstack", ".vercel", ".claude"]);

export function loadConfig(cwd = ".") {
  const p = join(cwd, "fluid.config.json");
  if (existsSync(p)) {
    try { return { ignore: [], disabledRules: [], ...JSON.parse(readFileSync(p, "utf8")) }; } catch { /* ignore bad config */ }
  }
  return { ignore: [], disabledRules: [] };
}

export function collectFiles(roots, { includeUi = false, ignore = [], selfDir = "" } = {}) {
  const IG = ["node_modules", "/.git/", "/dist/", "/build/", "/.next/", "/.tanstack/", "/.vercel/", "/.claude/", ".min.", ...(selfDir ? [selfDir] : []), ...ignore];
  if (!includeUi) IG.push("/components/ui/", "/ui/");
  const ignored = (p) => { const u = p.split(sep).join("/"); return IG.some((ig) => u.includes(ig)); };
  const out = [];
  const walk = (root) => {
    let st;
    try { st = statSync(root); } catch { return; }
    if (st.isFile()) { if (CODE_EXT.test(root) && !ignored(root)) out.push(root); return; }
    if (st.isDirectory()) for (const name of readdirSync(root)) { if (SKIP_DIRS.has(name)) continue; walk(join(root, name)); }
  };
  for (const r of roots) walk(r);
  return out;
}

export function readFiles(files) {
  const fd = [];
  for (const f of files) { try { fd.push({ file: f, content: readFileSync(f, "utf8") }); } catch { /* unreadable */ } }
  return fd;
}

export function lineIndexer(content) {
  const starts = [0];
  for (let i = 0; i < content.length; i++) if (content[i] === "\n") starts.push(i + 1);
  return (idx) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, col: idx - starts[lo] + 1 };
  };
}

export function scanFileData(fileData, { disabledRules = [] } = {}) {
  const disabled = new Set(disabledRules);
  const findings = [];
  for (const { file, content } of fileData) {
    const lines = content.split("\n");
    const at = lineIndexer(content);
    const suppressed = (line, id) => {
      const match = (s, kind) => {
        if (!s) return false;
        const m = s.match(new RegExp(`fluid-disable-${kind}\\b\\s*([a-zA-Z][\\w-]*)?`));
        return m ? !m[1] || m[1] === id : false;
      };
      return match(lines[line - 2], "next-line") || match(lines[line - 1], "line");
    };
    for (const rule of rules) {
      if (disabled.has(rule.id)) continue;
      if (rule.files && !rule.files.test(file)) continue;
      const hits = [];
      if (rule.pattern) for (const m of content.matchAll(rule.pattern)) hits.push({ index: m.index, message: rule.message });
      if (rule.scan) for (const h of rule.scan(content, file)) hits.push({ index: h.index, message: h.message || rule.message });
      for (const h of hits) {
        const { line, col } = at(h.index);
        if (suppressed(line, rule.id)) continue;
        findings.push({ file, line, col, id: rule.id, severity: rule.severity, message: h.message, hint: rule.hint });
      }
    }
  }
  for (const pr of projectRules) {
    if (disabled.has(pr.id)) continue;
    for (const f of pr.test(fileData)) findings.push({ file: f.file, line: f.line, col: 1, id: pr.id, severity: pr.severity, message: f.message, hint: f.hint || pr.hint });
  }
  return findings;
}

export function tally(findings) {
  const c = { error: 0, warn: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

export function sortFindings(findings) {
  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  return findings;
}

// One call both entry points share. Lazily pulls the jsdom engine only for --deep,
// so the regex core never imports jsdom and stays dependency-free.
export async function runDetect(roots, { includeUi = false, disabledRules = [], ignore = [], deep = false, selfDir = "" } = {}) {
  const files = collectFiles(roots, { includeUi, ignore, selfDir });
  const fileData = readFiles(files);
  const findings = scanFileData(fileData, { disabledRules });
  let deepError = null;
  if (deep) {
    try {
      const { scanDeep } = await import("./deep.mjs");
      findings.push(...(await scanDeep(fileData, { disabledRules })));
    } catch (e) { deepError = e; }
  }
  sortFindings(findings);
  return { files, fileCount: files.length, findings, counts: tally(findings), deepError };
}

export function render(findings, fileCount, { json = false } = {}) {
  const counts = tally(findings);
  if (json) return JSON.stringify({ files: fileCount, counts, findings }, null, 2);
  const tag = { error: "error", warn: "warn ", info: "info " };
  if (!findings.length) return `fluid · no anti-patterns found across ${fileCount} files.`;
  const out = [];
  let cur = null;
  for (const f of sortFindings(findings)) {
    if (f.file !== cur) { cur = f.file; out.push("\n" + f.file); }
    out.push(`  ${String(f.line).padStart(4)}:${String(f.col).padEnd(3)} ${tag[f.severity]}  ${f.id.padEnd(24)} ${f.message}`);
    if (f.hint) out.push(`        ↳ ${f.hint}`);
  }
  out.push(`\n${findings.length} findings  (${counts.error} error, ${counts.warn} warn, ${counts.info} info)  in ${fileCount} files`);
  return out.join("\n");
}
