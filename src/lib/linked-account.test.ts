import { describe, expect, it } from "vitest";
import { formatIban, ibanChecksumOk, maskAccount, validateAccount } from "./linked-account";

/** Builds a valid IBAN for a country and BBAN by computing the check digits. */
function iban(country: string, bban: string) {
  const numeric = (bban + country + "00").replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  return country + String(98 - remainder).padStart(2, "0") + bban;
}

describe("validateAccount: mobile wallets", () => {
  it("accepts each network's own prefix", () => {
    expect(validateAccount("orange_money", "07 00 00 00 01")).toEqual({ canonical: "+2250700000001", masked: "•••• 0001" });
    expect(validateAccount("mtn_momo", "05 12 34 56 78")).toEqual({ canonical: "+2250512345678", masked: "•••• 5678" });
    expect(validateAccount("moov_money", "0102030405")).toMatchObject({ canonical: "+2250102030405" });
  });

  it("flags a number from another network", () => {
    expect(validateAccount("orange_money", "05 12 34 56 78")).toEqual({ error: "wrongNetwork" });
    expect(validateAccount("mtn_momo", "07 00 00 00 01")).toEqual({ error: "wrongNetwork" });
  });

  it("Wave takes a number from any network", () => {
    for (const n of ["07 00 00 00 01", "05 00 00 00 01", "01 00 00 00 01"]) {
      expect(validateAccount("wave", n), n).toHaveProperty("canonical");
    }
  });

  it("rejects landlines, foreign and malformed numbers", () => {
    expect(validateAccount("orange_money", "27 22 00 00 00")).toEqual({ error: "invalidNumber" });
    expect(validateAccount("orange_money", "+33 6 12 34 56 78")).toEqual({ error: "invalidNumber" });
    expect(validateAccount("wave", "123")).toEqual({ error: "invalidNumber" });
  });
});

describe("validateAccount: bank IBAN", () => {
  const good = iban("CI", "CI0080111301134291200589");

  it("accepts a valid UEMOA IBAN with or without spaces", () => {
    expect(validateAccount("bank", formatIban(good).toLowerCase())).toEqual({ canonical: good, masked: `•••• ${good.slice(-4)}` });
    expect(validateAccount("bank", iban("SN", "SN0100152000048500003035"))).toHaveProperty("canonical");
  });

  it("rejects a wrong check digit, wrong length or non-UEMOA country", () => {
    const tampered = good.slice(0, -1) + (good.endsWith("9") ? "8" : "9");
    expect(validateAccount("bank", tampered)).toEqual({ error: "invalidIban" });
    expect(validateAccount("bank", good.slice(0, 27))).toEqual({ error: "invalidIban" });
    expect(validateAccount("bank", iban("FR", "300060000112345678901893"))).toEqual({ error: "invalidIban" });
  });

  it("ibanChecksumOk matches the published example", () => {
    expect(ibanChecksumOk("GB82WEST12345698765432")).toBe(true);
    expect(ibanChecksumOk("GB82WEST12345698765431")).toBe(false);
  });
});

describe("maskAccount", () => {
  it("shows only the last four characters", () => {
    expect(maskAccount("+2250700000001")).toBe("•••• 0001");
  });
});
