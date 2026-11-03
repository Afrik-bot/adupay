import { describe, expect, it } from "vitest";
import { formatE164, PHONE_COUNTRIES, toE164 } from "./phone";

describe("toE164", () => {
  it("keeps the leading 0 of Ivorian numbers", () => {
    expect(toE164("07 00 00 00 01", "CI")).toBe("+2250700000001");
    expect(toE164("0700000001", "CI")).toBe("+2250700000001");
    expect(toE164("01.02.03.04.05", "CI")).toBe("+2250102030405");
    expect(toE164("27 22 00 00 00", "CI")).toBe("+2252722000000"); // landline
  });

  it("rejects old 8-digit Ivorian numbers and wrong lengths", () => {
    expect(toE164("07000001", "CI")).toBeNull();
    expect(toE164("070000000123", "CI")).toBeNull();
  });

  it("drops the French trunk 0", () => {
    expect(toE164("06 12 34 56 78", "FR")).toBe("+33612345678");
    expect(toE164("612345678", "FR")).toBe("+33612345678");
    expect(toE164("0012345678", "FR")).toBeNull();
  });

  it("handles the other UEMOA countries", () => {
    expect(toE164("77 000 00 01", "SN")).toBe("+221770000001");
    expect(toE164("70 00 00 01", "ML")).toBe("+22370000001");
    expect(toE164("70 00 00 01", "BF")).toBe("+22670000001");
    expect(toE164("90 00 00 01", "NE")).toBe("+22790000001");
    expect(toE164("90 00 00 01", "TG")).toBe("+22890000001");
    expect(toE164("01 90 00 00 01", "BJ")).toBe("+2290190000001");
    expect(toE164("90 00 00 01", "BJ")).toBeNull(); // pre-2024 Benin format
    expect(toE164("955 000 001", "GW")).toBe("+245955000001");
  });

  it("handles US and Canadian numbers", () => {
    expect(toE164("(713) 555-0101", "US")).toBe("+17135550101");
    expect(toE164("514 555 0101", "CA")).toBe("+15145550101");
    expect(toE164("113 555 0101", "US")).toBeNull();
  });

  it("accepts a number typed in international form", () => {
    expect(toE164("+225 07 00 00 00 01", "FR")).toBe("+2250700000001");
    expect(toE164("0033 6 12 34 56 78", "CI")).toBe("+33612345678");
    expect(toE164("+44 7700 900000", "CI")).toBeNull(); // UK is not supported
  });

  it("rejects junk", () => {
    for (const bad of ["", "abc", "07-00-00-00-0a", "+", "++2250700000001"]) expect(toE164(bad, "CI"), bad).toBeNull();
  });

  it("every country's example is valid", () => {
    for (const country of PHONE_COUNTRIES) expect(toE164(country.example, country.iso), country.iso).not.toBeNull();
  });
});

describe("formatE164", () => {
  it("groups digits per country", () => {
    expect(formatE164("+2250700000001")).toBe("+225 07 00 00 00 01");
    expect(formatE164("+33612345678")).toBe("+33 6 12 34 56 78");
    expect(formatE164("+17135550101")).toBe("+1 713 555 0101");
  });
});
