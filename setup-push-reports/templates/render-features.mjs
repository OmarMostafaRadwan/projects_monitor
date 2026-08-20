#!/usr/bin/env node
/**
 * Render docs/features.md into a PDF and a DOCX that are pleasant to read.
 *
 *   node .github/render-features.mjs [in.md] [out.pdf] [out.docx]
 *
 * These two files are what a non-technical reader actually opens, so they are
 * typeset rather than dumped: a cover, a restrained accent colour, real
 * typographic hierarchy, breathing room, and page numbers.
 *
 * NO DEPENDENCIES, deliberately. The setup skill promises it adds nothing to a
 * project's package.json, and that promise is the reason people accept it into
 * a repository they care about. A PDF is bytes with an xref table, and a DOCX
 * is a ZIP of XML — both are writable with what Node already ships.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

const IN = process.argv[2] ?? "docs/features.md";
const OUT_PDF = process.argv[3] ?? "docs/features.pdf";
const OUT_DOCX = process.argv[4] ?? "docs/features.docx";

/* -------------------------------------------------------------------------- */
/*  Parse                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A deliberately small Markdown subset: title, lead paragraph, sections,
 * subsections, bullets, paragraphs, and `**bold**` inline.
 *
 * Small because both renderers below have to agree on it exactly. A parser that
 * accepts everything would drift between the two outputs, and a features
 * document that reads differently in PDF and DOCX is worse than one that
 * supports fewer shapes.
 */
function parse(markdown) {
  const doc = { title: "Features", lead: "", blocks: [] };
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph = [];

  const flush = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (!text) return;
    if (!doc.blocks.length && !doc.lead) doc.lead = text;
    else doc.blocks.push({ type: "p", text });
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (trimmed.startsWith("# ") && doc.title === "Features" && !doc.blocks.length) {
      flush();
      doc.title = trimmed.slice(2).trim();
    } else if (trimmed.startsWith("## ")) {
      flush();
      doc.blocks.push({ type: "h2", text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith("### ")) {
      flush();
      doc.blocks.push({ type: "h3", text: trimmed.slice(4).trim() });
    } else if (/^[-*]\s+/.test(trimmed)) {
      flush();
      doc.blocks.push({ type: "li", text: trimmed.replace(/^[-*]\s+/, "") });
    } else {
      paragraph.push(trimmed);
    }
  }
  flush();
  return doc;
}

/** Split `**bold**` into runs so both renderers emphasise identically. */
function runs(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.length ? out : [{ text, bold: false }];
}

const plain = (text) => text.replace(/\*\*(.+?)\*\*/g, "$1");

/* -------------------------------------------------------------------------- */
/*  Shared look                                                               */
/* -------------------------------------------------------------------------- */

const ACCENT = { r: 0.11, g: 0.36, b: 0.62 };
const ACCENT_HEX = "1C5C9E";
const INK_HEX = "1A1A1A";
const MUTED_HEX = "6B6B6B";

/* -------------------------------------------------------------------------- */
/*  PDF                                                                       */
/* -------------------------------------------------------------------------- */

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

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 64;
const MAX_W = PAGE_W - MARGIN * 2;
const BOTTOM = MARGIN + 30;

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

/** The base 14 fonts are WinAnsi; substitute rather than emit mojibake. */
function toWinAnsi(text) {
  return String(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E]/g, "?");
}

const esc = (t) => toWinAnsi(t).replace(/([\\()])/g, "\\$1");

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

function renderPdf(doc, generatedAt) {
  const pages = [];
  let ops = [];
  let y = 0;

  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = PAGE_H - MARGIN;
  };
  const ensure = (needed) => {
    if (y - needed < BOTTOM) newPage();
  };
  const write = (text, { size = 10.5, bold = false, x = MARGIN, gray = 0.1 } = {}) => {
    ops.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${gray} g 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${esc(text)}) Tj ET`,
    );
  };
  const rect = (x, yy, w, h, color) => {
    ops.push(
      `${color.r} ${color.g} ${color.b} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
    );
  };

  /* --- Cover ------------------------------------------------------------- */
  newPage();
  rect(0, PAGE_H - 210, PAGE_W, 210, ACCENT);

  y = PAGE_H - 96;
  for (const line of wrap(doc.title, 30, MAX_W, true)) {
    ops.push(
      `BT /F2 30 Tf 1 1 1 rg 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${esc(line)}) Tj ET`,
    );
    y -= 36;
  }
  ops.push(
    `BT /F1 11 Tf 0.85 0.9 0.96 rg 1 0 0 1 ${MARGIN} ${(PAGE_H - 180).toFixed(2)} Tm (${esc("What this project does, as of " + generatedAt)}) Tj ET`,
  );

  y = PAGE_H - 268;
  if (doc.lead) {
    for (const line of wrap(plain(doc.lead), 12.5, MAX_W, false)) {
      write(line, { size: 12.5, gray: 0.25 });
      y -= 18;
    }
    y -= 10;
  }

  /* --- Body -------------------------------------------------------------- */
  for (const block of doc.blocks) {
    if (block.type === "h2") {
      // Headings reserve room for what follows them. A heading alone at the
      // foot of a page, with its text overleaf, is the most obvious way a
      // generated document looks generated.
      ensure(132);
      y -= 16;
      rect(MARGIN, y - 4, 26, 2.5, ACCENT);
      y -= 20;
      for (const line of wrap(plain(block.text), 16, MAX_W, true)) {
        write(line, { size: 16, bold: true, gray: 0.08 });
        y -= 21;
      }
      y -= 4;
    } else if (block.type === "h3") {
      ensure(86);
      y -= 8;
      for (const line of wrap(plain(block.text), 12, MAX_W, true)) {
        write(line, { size: 12, bold: true, gray: 0.15 });
        y -= 17;
      }
    } else if (block.type === "li") {
      const parts = runs(block.text);
      const lines = wrap(plain(block.text), 10.5, MAX_W - 18, false);
      ensure(lines.length * 15 + 6);
      // A round accent bullet reads calmer than a hyphen at this size.
      rect(MARGIN + 3, y + 3, 3, 3, ACCENT);
      for (const line of lines) {
        // Bold survives only when a run covers the whole line; splitting mid-line
        // would need per-run measurement, and a features list rarely needs it.
        const bold = parts.length === 1 && parts[0].bold;
        write(line, { size: 10.5, bold, x: MARGIN + 18, gray: 0.15 });
        y -= 15;
      }
      y -= 3;
    } else {
      const lines = wrap(plain(block.text), 10.5, MAX_W, false);
      ensure(lines.length * 15 + 6);
      for (const line of lines) {
        write(line, { size: 10.5, gray: 0.2 });
        y -= 15;
      }
      y -= 7;
    }
  }

  /* --- Footers ----------------------------------------------------------- */
  pages.forEach((page, i) => {
    if (i === 0) return;
    page.push(
      `BT /F1 8.5 Tf 0.55 g 1 0 0 1 ${MARGIN} ${(MARGIN - 12).toFixed(2)} Tm (${esc(doc.title)}) Tj ET`,
    );
    const label = `${i + 1} / ${pages.length}`;
    const x = PAGE_W - MARGIN - textWidth(label, 8.5, false);
    page.push(`BT /F1 8.5 Tf 0.55 g 1 0 0 1 ${x.toFixed(2)} ${(MARGIN - 12).toFixed(2)} Tm (${esc(label)}) Tj ET`);
  });

  /* --- Assemble ---------------------------------------------------------- */
  const objects = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  // Objects are 1-based: catalog, pages, placeholder, then a page + a content
  // stream per page, then the two fonts. Getting this wrong points /F1 at a
  // content stream, and a PDF viewer answers that by drawing nothing at all —
  // headings survived because they used the other slot, so the file looked
  // merely sparse rather than broken.
  const fontA = 4 + pages.length * 2;
  const fontB = fontA + 1;

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.push("<< >>"); // placeholder keeping ids stable
  pages.forEach((page, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontA} 0 R /F2 ${fontB} 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`,
    );
    const stream = page.join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/* -------------------------------------------------------------------------- */
/*  DOCX                                                                      */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Minimal ZIP writer. A DOCX is a ZIP, and Node ships deflate, so this is the
 * whole of the "docx library" this needs.
 */
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const [name, content] of files) {
    const data = Buffer.from(content, "utf8");
    const deflated = deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const sum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time — fixed, so output is reproducible
    local.writeUInt16LE(0x21, 12); // date — 1 Jan 1996
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, deflated);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(0, 38); // external attributes
    entry.writeUInt32LE(offset, 42); // offset of the local header
    central.push(entry, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

const xmlEscape = (t) =>
  String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function docxRuns(text) {
  return runs(text)
    .map(
      (r) =>
        `<w:r>${r.bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${xmlEscape(r.text)}</w:t></w:r>`,
    )
    .join("");
}

function renderDocx(doc, generatedAt) {
  const body = [];

  body.push(
    `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${docxRuns(doc.title)}</w:p>`,
    `<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape("What this project does, as of " + generatedAt)}</w:t></w:r></w:p>`,
  );
  if (doc.lead) {
    body.push(`<w:p><w:pPr><w:pStyle w:val="Lead"/></w:pPr>${docxRuns(doc.lead)}</w:p>`);
  }

  for (const block of doc.blocks) {
    if (block.type === "h2") {
      body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${docxRuns(block.text)}</w:p>`);
    } else if (block.type === "h3") {
      body.push(`<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${docxRuns(block.text)}</w:p>`);
    } else if (block.type === "li") {
      body.push(
        `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${docxRuns(block.text)}</w:p>`,
      );
    } else {
      body.push(`<w:p>${docxRuns(block.text)}</w:p>`);
    }
  }

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418"/></w:sectPr></w:body></w:document>`;

  const style = (id, name, opts) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:pPr>${opts.spacing}</w:pPr><w:rPr>${opts.run}</w:rPr></w:style>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="${INK_HEX}"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
${style("Title", "Title", {
  spacing: '<w:spacing w:after="60"/>',
  run: `<w:b/><w:color w:val="${ACCENT_HEX}"/><w:sz w:val="56"/>`,
})}
${style("Subtitle", "Subtitle", {
  spacing: '<w:spacing w:after="360"/>',
  run: `<w:color w:val="${MUTED_HEX}"/><w:sz w:val="20"/>`,
})}
${style("Lead", "Lead", {
  spacing: '<w:spacing w:after="280"/>',
  run: `<w:color w:val="333333"/><w:sz w:val="24"/>`,
})}
${style("Heading1", "heading 1", {
  spacing: '<w:spacing w:before="360" w:after="140"/>',
  run: `<w:b/><w:color w:val="${ACCENT_HEX}"/><w:sz w:val="30"/>`,
})}
${style("Heading2", "heading 2", {
  spacing: '<w:spacing w:before="240" w:after="100"/>',
  run: `<w:b/><w:color w:val="${INK_HEX}"/><w:sz w:val="24"/>`,
})}
${style("ListBullet", "List Bullet", {
  spacing: '<w:spacing w:after="80"/>',
  run: "",
})}
</w:styles>`;

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr><w:rPr><w:color w:val="${ACCENT_HEX}"/></w:rPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  return zip([
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ],
    [
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
    ],
    ["word/document.xml", document],
    ["word/styles.xml", styles],
    ["word/numbering.xml", numbering],
  ]);
}

/* -------------------------------------------------------------------------- */

let markdown;
try {
  markdown = readFileSync(IN, "utf8");
} catch {
  console.error(`No ${IN} — nothing to render. Write it first.`);
  process.exit(1);
}

const doc = parse(markdown);
if (!doc.blocks.length && !doc.lead) {
  console.error(`${IN} has no content beyond a title. Not writing empty documents.`);
  process.exit(1);
}

// Stamped from the file's own commit date when available, so re-rendering an
// unchanged document does not produce a different file every run.
const generatedAt = (process.env.FEATURES_DATE || new Date().toISOString()).slice(0, 10);

writeFileSync(OUT_PDF, renderPdf(doc, generatedAt));
writeFileSync(OUT_DOCX, renderDocx(doc, generatedAt));

const counts = doc.blocks.reduce((acc, b) => ({ ...acc, [b.type]: (acc[b.type] ?? 0) + 1 }), {});
console.log(
  `Wrote ${OUT_PDF} and ${OUT_DOCX} — ${counts.h2 ?? 0} sections, ${counts.li ?? 0} bullets, ${counts.p ?? 0} paragraphs.`,
);
