#!/usr/bin/env node
/**
 * Adds an entry to reports/report.json and re-renders reports/report.pdf.
 *
 *   node .github/add-report-entry.mjs entry.json
 *   cat entry.json | node .github/add-report-entry.mjs -
 *
 * Exists so that writing a report is one command rather than hand-editing a
 * growing JSON file. Hand-editing is how you end up with a corrupted log, or
 * with the newest entry silently appended in the wrong place.
 *
 * Entries are PREPENDED (newest first) and existing ones are never touched.
 * Correcting something means adding an entry that says so — the log is a
 * record of what was believed at the time, not a document to be revised.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOC = process.env.REPORT_DOC ?? "reports/report.json";
const PDF = process.env.REPORT_PDF ?? "reports/report.pdf";

const AREAS = ["auth", "ui", "api", "database", "infra", "docs", "other"];
const TYPES = ["feature", "fix", "refactor", "chore"];

const REQUIRED_TEXT = ["title", "summary", "why"];
const REQUIRED_LISTS = [
  "what_changed",
  "decisions",
  "verification",
  "blockers",
  "next_steps",
];

function fail(message) {
  console.error(`add-report-entry: ${message}`);
  process.exit(1);
}

function readInput() {
  const arg = process.argv[2];
  if (!arg) fail("usage: add-report-entry.mjs <entry.json|->");
  const raw = arg === "-" ? readFileSync(0, "utf8") : readFileSync(arg, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`input is not valid JSON — ${error.message}`);
  }
}

const input = readInput();

/* -------------------------------------------------------------------------- */
/*  Validate before writing                                                   */
/* -------------------------------------------------------------------------- */

for (const key of REQUIRED_TEXT) {
  if (typeof input[key] !== "string" || input[key].trim() === "") {
    fail(`"${key}" is required and must be a non-empty string`);
  }
}

for (const key of REQUIRED_LISTS) {
  if (!Array.isArray(input[key])) {
    fail(`"${key}" is required and must be an array (use [] when empty)`);
  }
}

if (!AREAS.includes(input.area)) {
  fail(`"area" must be one of: ${AREAS.join(", ")}`);
}
if (!TYPES.includes(input.type)) {
  fail(`"type" must be one of: ${TYPES.join(", ")}`);
}

// A summary aimed at a non-technical reader cannot be one line. This is the
// single field the whole system exists to deliver, so it is worth being strict.
if (input.summary.trim().length < 80) {
  fail(
    "\"summary\" is too short. Write three to five sentences for a non-technical\n" +
      "reader: what capability now exists that didn't before, and what it means\n" +
      "for the project. Implementation detail belongs in what_changed.",
  );
}

if (input.what_changed.length === 0) {
  fail('"what_changed" cannot be empty — list the concrete changes');
}

const entry = {
  timestamp: input.timestamp ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  title: input.title.trim(),
  summary: input.summary.trim(),
  what_changed: input.what_changed,
  why: input.why.trim(),
  decisions: input.decisions,
  verification: input.verification,
  blockers: input.blockers,
  next_steps: input.next_steps,
  // Deliberately not taken from input: the Action overwrites this from
  // GitHub's own record of the push, which is authoritative.
  files_changed: [],
  area: input.area,
  type: input.type,
  generated_by: "claude-code",
};

/* -------------------------------------------------------------------------- */
/*  Prepend and write                                                         */
/* -------------------------------------------------------------------------- */

let doc = { schema_version: 2, entries: [] };
if (existsSync(DOC)) {
  try {
    const existing = JSON.parse(readFileSync(DOC, "utf8"));
    if (Array.isArray(existing.entries)) doc = existing;
    else fail(`${DOC} exists but has no "entries" array — refusing to overwrite`);
  } catch (error) {
    // Never clobber a file we cannot read: losing the log is unrecoverable.
    fail(`${DOC} exists but is not valid JSON (${error.message}) — fix it first`);
  }
}

doc.schema_version = 2;
if (input.repo) doc.repo = input.repo;
doc.entries.unshift(entry);

mkdirSync(path.dirname(DOC), { recursive: true });
writeFileSync(DOC, `${JSON.stringify(doc, null, 2)}\n`);
console.log(
  `Added entry "${entry.title}" — ${doc.entries.length} total in ${DOC}`,
);

/* -------------------------------------------------------------------------- */
/*  Re-render the PDF                                                         */
/* -------------------------------------------------------------------------- */

const renderer = path.join(HERE, "render-report-pdf.mjs");
if (existsSync(renderer)) {
  execFileSync(process.execPath, [renderer, DOC, PDF], { stdio: "inherit" });
} else {
  console.warn(`add-report-entry: no renderer at ${renderer}, skipped the PDF`);
}
