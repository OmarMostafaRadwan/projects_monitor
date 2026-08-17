#!/usr/bin/env node
/**
 * Renders reports/report.json as a multi-page, text-only PDF.
 *
 *   node .github/render-report-pdf.mjs [in.json] [out.pdf]
 *
 * Only the most recent entries are drawn (REPORT_PDF_ENTRIES, default 10). The
 * JSON keeps the whole history and the dashboard is the real archive — this
 * file is committed to git on every push, so an unbounded PDF would grow the
 * repo forever with no way to reclaim it short of rewriting history.
 *
 * Dependency-free by design: the setup skill has to work in any repo without
 * adding packages to someone else's project, so this emits PDF 1.4 by hand.
 */

import { readFileSync, writeFileSync } from "node:fs";

const IN = process.argv[2] ?? "reports/report.json";
const OUT = process.argv[3] ?? "reports/report.pdf";
const MAX_ENTRIES = Number(process.env.REPORT_PDF_ENTRIES ?? 10);

const PAGE_W = 595.28; // A4 points
const PAGE_H = 841.89;
const MARGIN = 56;
const MAX_W = PAGE_W - MARGIN * 2;
const BOTTOM = MARGIN + 28;

/** Helvetica advance widths (per 1000 units) for printable ASCII. */
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

const BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
  556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];

function textWidth(text, size, bold) {
  const table = bold ? BOLD_WIDTHS : WIDTHS;
  let total = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const w = code >= 32 && code <= 126 ? table[code - 32] : 556;
    total += (w * size) / 1000;
  }
  return total;
}

/**
 * The base 14 fonts are WinAnsi — anything outside it renders as garbage, so
 * substitute the punctuation that actually shows up in generated prose rather
 * than emitting mojibake.
 */
function toWinAnsi(text) {
  return String(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[ ]/g, " ")
    .replace(/[^\x20-\x7E]/g, "?");
}

const escapePdf = (t) => toWinAnsi(t).replace(/([\\()])/g, "\\$1");

function wrap(text, size, width, bold) {
  const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, bold) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/* -------------------------------------------------------------------------- */
/*  Page builder                                                              */
/* -------------------------------------------------------------------------- */

const doc = JSON.parse(readFileSync(IN, "utf8"));
const allEntries = Array.isArray(doc.entries) ? doc.entries : [];
const entries = allEntries.slice(0, Math.max(1, MAX_ENTRIES));

const pages = [];
let ops = [];
let y = PAGE_H - MARGIN;

function newPage() {
  if (ops.length) pages.push(ops);
  ops = [];
  y = PAGE_H - MARGIN;
}

function ensure(needed) {
  if (y - needed < BOTTOM) {
    newPage();
    return false;
  }
  return true;
}

function line(text, { size = 10, bold = false, gap = 13.5, indent = 0, gray = 0 } = {}) {
  for (const l of wrap(text, size, MAX_W - indent, bold)) {
    ensure(gap);
    const color = gray > 0 ? `${gray} ${gray} ${gray} rg ` : "0 0 0 rg ";
    ops.push(
      `${color}BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${(MARGIN + indent).toFixed(2)} ${y.toFixed(2)} Tm (${escapePdf(l)}) Tj ET`,
    );
    y -= gap;
  }
}

function bullets(items, { size = 10, gap = 13.5 } = {}) {
  for (const item of items) {
    const lines = wrap(`- ${item}`, size, MAX_W - 10, false);
    lines.forEach((l, i) => {
      ensure(gap);
      ops.push(
        `0 0 0 rg BT /F1 ${size} Tf 1 0 0 1 ${(MARGIN + (i === 0 ? 8 : 16)).toFixed(2)} ${y.toFixed(2)} Tm (${escapePdf(l)}) Tj ET`,
      );
      y -= gap;
    });
  }
}

function section(title, items) {
  if (!items?.length) return;
  y -= 4;
  ensure(16);
  line(title.toUpperCase(), { size: 7.5, bold: true, gap: 12, gray: 0.35 });
  bullets(items);
}

function rule(gray = 0.85) {
  ensure(12);
  ops.push(
    `${gray} ${gray} ${gray} RG 0.7 w ${MARGIN} ${y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`,
  );
  y -= 14;
}

// Document header
line("Project report", { size: 18, bold: true, gap: 22 });
if (doc.repo) line(doc.repo, { size: 9, gap: 13, gray: 0.4 });
line(
  `${allEntries.length} entr${allEntries.length === 1 ? "y" : "ies"}` +
    (allEntries.length > entries.length
      ? ` — showing the most recent ${entries.length}`
      : ""),
  { size: 9, gap: 16, gray: 0.4 },
);
rule(0.7);

entries.forEach((entry, index) => {
  // Keep an entry's heading with at least some of its body.
  if (index > 0) {
    y -= 8;
    if (y < BOTTOM + 120) newPage();
    else rule();
  }

  line(entry.title ?? "Untitled", { size: 13, bold: true, gap: 18 });
  const meta = [entry.timestamp, entry.area, entry.type, entry.generated_by]
    .filter(Boolean)
    .join("   |   ");
  line(meta, { size: 8, gap: 15, gray: 0.45 });

  if (entry.summary) line(entry.summary, { size: 10.5, gap: 15 });

  // Blockers first: this is the reason the whole system exists.
  if (entry.blockers?.length) {
    y -= 4;
    ensure(16);
    line("BLOCKED", { size: 7.5, bold: true, gap: 12, gray: 0.2 });
    bullets(entry.blockers, { size: 10.5, gap: 14 });
  }

  if (entry.why) {
    y -= 4;
    ensure(16);
    line("WHY", { size: 7.5, bold: true, gap: 12, gray: 0.35 });
    line(entry.why, { size: 10, gap: 13.5, indent: 8 });
  }

  section("What changed", entry.what_changed);
  section("Decisions", entry.decisions);
  section("Verification", entry.verification);
  section("Next steps", entry.next_steps);

  if (entry.files_changed?.length) {
    y -= 4;
    ensure(16);
    line(`FILES CHANGED (${entry.files_changed.length})`, {
      size: 7.5,
      bold: true,
      gap: 12,
      gray: 0.35,
    });
    line(entry.files_changed.join(", "), { size: 8.5, gap: 11.5, indent: 8, gray: 0.3 });
  }
});

newPage();

/* -------------------------------------------------------------------------- */
/*  Assemble the file                                                         */
/* -------------------------------------------------------------------------- */

const objects = [];
const pageIds = pages.map((_, i) => 4 + i * 2);

objects.push("<< /Type /Catalog /Pages 2 0 R >>");
objects.push(
  `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
);
objects.push(""); // placeholder for object 3, replaced below

pages.forEach((pageOps, i) => {
  const content = pageOps.join("\n");
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R /F2 ${4 + pages.length * 2} 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`,
  );
  objects.push(
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  );
});

// Object 3 is unused padding so page ids start at 4 and stay easy to compute.
objects[2] = "<< >>";
objects.push(
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
);
objects.push(
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
);

let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((body, index) => {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
});

const xrefStart = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) {
  pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

writeFileSync(OUT, Buffer.from(pdf, "latin1"));
console.log(
  `Wrote ${OUT} — ${pages.length} page(s), ${entries.length} of ${allEntries.length} entries, ${Buffer.byteLength(pdf, "latin1")} bytes`,
);
