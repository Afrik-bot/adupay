// A minimal PDF writer for tabular statements: A4 pages, the built-in Helvetica
// fonts (no embedding), WinAnsi encoding so French accents print. Enough for a
// tontine statement without shipping a PDF library to the server bundle.

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const LINE = 15;

export interface PdfTable {
  title: string;
  subtitle: string[];
  columns: { header: string; x: number; align?: "left" | "right"; width?: number }[];
  rows: string[][];
  footer: string;
}

// Characters outside Latin-1 that WinAnsi still has.
const WIN_ANSI: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "–": 0x96, "—": 0x97,
  " ": 0xa0, " ": 0x20,
};

function encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = WIN_ANSI[char] ?? char.codePointAt(0)!;
    bytes.push(code <= 0xff ? code : 0x3f); // "?" for anything else
  }
  return bytes;
}

/** A PDF string literal, with ( ) \ escaped. */
function literal(text: string): string {
  return (
    "(" +
    String.fromCharCode(...encode(text))
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)") +
    ")"
  );
}

// Rough Helvetica advance width (per 1000 em) for right-aligning numbers.
function approxWidth(text: string, size: number): number {
  let units = 0;
  for (const char of text) units += /[0-9]/.test(char) ? 556 : char === " " || char === " " ? 278 : /[A-Z]/.test(char) ? 667 : 520;
  return (units / 1000) * size;
}

function fit(text: string, width: number | undefined, size: number): string {
  if (!width || approxWidth(text, size) <= width) return text;
  let cut = text;
  while (cut.length > 1 && approxWidth(cut + "…", size) > width) cut = cut.slice(0, -1);
  return cut + "…";
}

function textAt(x: number, y: number, text: string, font: "F1" | "F2", size: number, align: "left" | "right" = "left") {
  const left = align === "right" ? x - approxWidth(text, size) : x;
  return `BT /${font} ${size} Tf ${left.toFixed(2)} ${y.toFixed(2)} Td ${literal(text)} Tj ET`;
}

export function renderTablePdf(table: PdfTable): Buffer {
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = PAGE_HEIGHT - MARGIN;

  const header = () => {
    ops.push(textAt(MARGIN, y, table.title, "F2", 16));
    y -= LINE * 1.6;
    for (const line of table.subtitle) {
      ops.push(textAt(MARGIN, y, line, "F1", 10));
      y -= LINE;
    }
    y -= LINE * 0.5;
    for (const col of table.columns) ops.push(textAt(col.x, y, col.header, "F2", 9, col.align));
    y -= 4;
    ops.push(`${MARGIN} ${y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${y.toFixed(2)} l 0.5 w S`);
    y -= LINE;
  };

  header();
  for (const row of table.rows) {
    if (y < MARGIN + LINE * 2) {
      pages.push(ops);
      ops = [];
      y = PAGE_HEIGHT - MARGIN;
      header();
    }
    table.columns.forEach((col, i) => ops.push(textAt(col.x, y, fit(row[i] ?? "", col.width, 9), "F1", 9, col.align)));
    y -= LINE;
  }
  pages.push(ops);

  // Objects: 1 catalog, 2 pages, 3-4 fonts, then a page + content stream per page.
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((pageOps, i) => {
    const footer = textAt(MARGIN, MARGIN / 2, `${table.footer} · ${i + 1}/${pages.length}`, "F1", 8);
    const content = [...pageOps, footer].join("\n");
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });

  let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(body, "latin1");
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
