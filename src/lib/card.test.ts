import { describe, expect, it } from "vitest";
import { cardBrand, expiryValid, formatCardNumber, luhnValid, SANDBOX_TEST_CARDS, tokenizeCard, validateCard } from "./card";

const now = new Date("2026-11-03T12:00:00Z");

describe("card checks", () => {
  it("Luhn accepts the test cards and rejects a mistyped digit", () => {
    expect(luhnValid(SANDBOX_TEST_CARDS.success)).toBe(true);
    expect(luhnValid(SANDBOX_TEST_CARDS.declined)).toBe(true);
    expect(luhnValid("4242 4242 4242 4241")).toBe(false);
    expect(luhnValid("1234")).toBe(false);
  });

  it("detects brands and formats numbers", () => {
    expect(cardBrand("4242")).toBe("visa");
    expect(cardBrand("5555 5555 5555 4444")).toBe("mastercard");
    expect(cardBrand("2221 0000 0000 0009")).toBe("mastercard");
    expect(cardBrand("3782 822463 10005")).toBe("amex");
    expect(formatCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
  });

  it("expiry is valid through the end of its month", () => {
    expect(expiryValid("11/26", now)).toBe(true);
    expect(expiryValid("10/26", now)).toBe(false);
    expect(expiryValid("13/27", now)).toBe(false);
    expect(expiryValid("1127", now)).toBe(false);
  });

  it("CVC length depends on the brand", () => {
    expect(validateCard({ number: SANDBOX_TEST_CARDS.success, expiry: "12/29", cvc: "123" }, now)).toBeNull();
    expect(validateCard({ number: SANDBOX_TEST_CARDS.success, expiry: "12/29", cvc: "12" }, now)).toBe("cvc");
    expect(validateCard({ number: "3782 822463 10005", expiry: "12/29", cvc: "1234" }, now)).toBeNull();
  });
});

describe("tokenizeCard", () => {
  it("returns only a token, the brand and the last 4 digits", () => {
    const token = tokenizeCard({ number: SANDBOX_TEST_CARDS.declined, expiry: "12/29", cvc: "123" }, () => "abcdef12-3456-7890");
    expect(token).toEqual({ token: "sbxcard_abcdef123456_9992", brand: "visa", last4: "9992" });
    expect(JSON.stringify(token)).not.toContain("4000000000039992");
  });

  it("refuses invalid cards", () => {
    expect(tokenizeCard({ number: "4242 4242 4242 4241", expiry: "12/29", cvc: "123" })).toEqual({ error: "number" });
  });
});
