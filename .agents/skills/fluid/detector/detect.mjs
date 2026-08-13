#!/usr/bin/env node
// fluid detector: a deterministic scanner for motion and generic-look
// anti-patterns. Run with `node detect.mjs [paths...]` or `bun`.
//   --json          machine output for CI
//   --strict        exit 1 on warnings too (default: only on errors)
//   --include-ui    also scan components/ui (shadcn) folders
//   --deep          add the jsdom DOM pass (heading order, nested cards,
//                   icon-tile stacks, line length, best-effort contrast)
// Suppress inline with `fluid-disable-line [rule]` or `fluid-disable-next-line [rule]`.
// Optional config: fluid.config.json { "ignore": [...], "disabledRules": [...] }.
//
// The regex core is dependency-free. --deep needs jsdom; if it is missing the
// scan still runs and prints a one-line note instead of failing.

import { dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runDetect, render, loadConfig } from "./core.mjs";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const roots = argv.filter((a) => !a.startsWith("--"));
if (!roots.length) roots.push(".");

const config = loadConfig(".");
const selfDir = dirname(fileURLToPath(import.meta.url)).split(sep).join("/");

const result = await runDetect(roots, {
  includeUi: flags.has("--include-ui"),
  deep: flags.has("--deep"),
  disabledRules: config.disabledRules,
  ignore: config.ignore,
  selfDir,
});

if (result.deepError) console.error(`(--deep skipped: ${result.deepError.message})`);
process.stdout.write(render(result.findings, result.fileCount, { json: flags.has("--json") }) + "\n");
process.exitCode = result.counts.error > 0 || (flags.has("--strict") && result.counts.warn > 0) ? 1 : 0;
