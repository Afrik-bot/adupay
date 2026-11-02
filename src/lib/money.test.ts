import { describe, expect, it } from "vitest";
import { applyBps, formatMoney, NBSP, parseMoney } from "./money";

// Tests write a plain space for readability; formatted output uses NBSP.
const s = (text: string) => text.replaceAll(" ", NBSP);

describe("formatMoney", () => {
  it("formats FCFA with grouped thousands and no decimals", () => {
    expect(formatMoney(150000, "XOF")).toBe(s("150 000 FCFA"));
    expect(formatMoney(0, "XOF")).toBe(s("0 FCFA"));
    expect(formatMoney(999, "XOF")).toBe(s("999 FCFA"));
    expect(formatMoney(2_000_000, "XOF")).toBe(s("2 000 000 FCFA"));
    expect(formatMoney(150000, "XOF", "en")).toBe(s("150,000 FCFA"));
  });

  it("formats EUR, USD and CAD from cents in French", () => {
    expect(formatMoney(123456, "EUR")).toBe(s("1 234,56 €"));
    expect(formatMoney(5, "EUR")).toBe(s("0,05 €"));
    expect(formatMoney(25000, "USD")).toBe(s("250,00 $ US"));
    expect(formatMoney(99, "CAD")).toBe(s("0,99 $ CA"));
  });

  it("formats EUR, USD and CAD in English with the symbol first", () => {
    expect(formatMoney(123456, "EUR", "en")).toBe("€1,234.56");
    expect(formatMoney(25000, "USD", "en")).toBe("US$250.00");
    expect(formatMoney(1_000_000, "CAD", "en")).toBe("CA$10,000.00");
  });

  it("handles negatives and bigint", () => {
    expect(formatMoney(-500, "XOF")).toBe(s("-500 FCFA"));
    expect(formatMoney(9_007_199_254_740_993n, "XOF")).toBe(s("9 007 199 254 740 993 FCFA"));
  });

  it("refuses fractional or unsafe numbers", () => {
    expect(() => formatMoney(10.5, "XOF")).toThrow(RangeError);
    expect(() => formatMoney(Number.MAX_SAFE_INTEGER + 2, "XOF")).toThrow(RangeError);
  });
});

describe("parseMoney", () => {
  it("parses FCFA written the usual ways", () => {
    expect(parseMoney("150000", "XOF")).toBe(150000);
    expect(parseMoney("150 000", "XOF")).toBe(150000);
    expect(parseMoney(`150${NBSP}000`, "XOF")).toBe(150000);
    expect(parseMoney("150.000", "XOF")).toBe(150000);
    expect(parseMoney("1,500,000", "XOF")).toBe(1500000);
  });

  it("rejects decimals for FCFA", () => {
    expect(parseMoney("150,5", "XOF")).toBeNull();
    expect(parseMoney("10.25", "XOF")).toBeNull();
  });

  it("parses euros and dollars into cents", () => {
    expect(parseMoney("12,50", "EUR")).toBe(1250);
    expect(parseMoney("12.5", "USD")).toBe(1250);
    expect(parseMoney("1 234,56", "EUR")).toBe(123456);
    expect(parseMoney("1,234.56", "USD")).toBe(123456);
    expect(parseMoney("1.234,56", "EUR")).toBe(123456);
    expect(parseMoney("1,234", "CAD")).toBe(123400);
    expect(parseMoney("20", "CAD")).toBe(2000);
  });

  it("rejects junk", () => {
    for (const bad of ["", "abc", "-5", "1,2,3", "12.345.6", "12,5555", "1e5", "12.5.0"]) {
      expect(parseMoney(bad, "EUR"), bad).toBeNull();
    }
  });
});

describe("applyBps", () => {
  it("computes a 1.9 % fee rounded half up", () => {
    expect(applyBps(10000, 190)).toBe(190);
    expect(applyBps(150000, 190)).toBe(2850);
    expect(applyBps(25, 190)).toBe(0); // 0.475 -> 0
    expect(applyBps(27, 190)).toBe(1); // 0.513 -> 1
    expect(applyBps(50, 100)).toBe(1); // 0.5 -> 1
  });
});
