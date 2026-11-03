import { describe, expect, it } from "vitest";
import { renderTablePdf } from "./pdf";

const table = (rows: string[][]) => ({
  title: "Relevé · Tontine des Amies",
  subtitle: ["Gestionnaire : Awa Koné", "Édité le 3 novembre 2026"],
  columns: [
    { header: "Date", x: 40 },
    { header: "Membre", x: 140, width: 150 },
    { header: "Montant", x: 555, align: "right" as const },
  ],
  rows,
  footer: "AduPay — mode démo",
});

describe("renderTablePdf", () => {
  it("writes a structurally valid PDF whose xref points at every object", () => {
    const pdf = renderTablePdf(table([["03/11", "Awa Koné", "10\u00A0000 FCFA"]]));
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    entries.forEach((offset, i) => expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it("encodes French accents and symbols in WinAnsi and escapes parentheses", () => {
    const pdf = renderTablePdf(table([["03/11", "Koné (trésorière)", "5\u00A0000 FCFA"]]));
    expect(pdf.includes(Buffer.from([0xe9]))).toBe(true); // é
    expect(pdf.includes(Buffer.from([0x97]))).toBe(true); // — in the footer
    expect(pdf.toString("latin1")).toContain("\\(tr\xE9sori\xE8re\\)");
  });

  it("each content stream's /Length matches its bytes", () => {
    const pdf = renderTablePdf(table(Array.from({ length: 120 }, (_, i) => [`${i}`, `Membre ${i}`, `${i} FCFA`]))).toString("latin1");
    const streams = [...pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)];
    expect(streams.length).toBeGreaterThan(1); // 120 rows need more than one page
    for (const [, length, content] of streams) expect(Buffer.byteLength(content, "latin1")).toBe(Number(length));
    expect(pdf).toMatch(/\/Count (\d+)/);
  });

  it("shortens values that do not fit their column", () => {
    const pdf = renderTablePdf(table([["03/11", "A".repeat(80), "1 FCFA"]])).toString("latin1");
    expect(pdf).toContain("\x85"); // …
    expect(pdf).not.toContain("A".repeat(80));
  });
});
