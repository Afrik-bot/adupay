import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("messages", () => {
  // FR-8: every UI string exists in French and English.
  it("fr and en define exactly the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(fr).sort());
  });

  it("no string is empty", () => {
    for (const [name, messages] of Object.entries({ fr, en })) {
      for (const key of keys(messages)) {
        const value = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], messages);
        expect(String(value).trim(), `${name}:${key}`).not.toBe("");
      }
    }
  });
});
