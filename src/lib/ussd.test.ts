import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import type { Locale } from "./money";
import { runUssd, USSD_MAX, ussdPath, type UssdBackend, type UssdDue } from "./ussd";

const translator = (locale: Locale) => {
  const t = createTranslator({ locale, messages: locale === "fr" ? fr : en, namespace: "ussd" });
  return (key: string, values?: Record<string, string | number>) => t(key as never, values as never);
};
const due = (over: Partial<UssdDue> = {}): UssdDue => ({
  groupId: "g1",
  groupName: "Tontine du marché d'Adjamé",
  cycleNumber: 2,
  amount: 10_000,
  currency: "XOF",
  dueDate: "2026-11-20",
  paid: false,
  ...over,
});

function backend(over: Partial<UssdBackend> = {}): UssdBackend {
  return {
    balances: async () => [{ currency: "XOF", balance: 150_000 }],
    dues: async () => [due(), due({ groupId: "g2", groupName: "Épargne Yopougon", amount: 25_000, paid: true })],
    tontines: async () => [
      { groupId: "g1", name: "Tontine du marché d'Adjamé" },
      { groupId: "g2", name: "Épargne Yopougon" },
      { groupId: "g3", name: "Nouvelle tontine" },
    ],
    payShare: vi.fn(async () => ({ ok: true as const })),
    setLocale: vi.fn(async () => {}),
    ...over,
  };
}
const run = (input: string, b = backend(), locale: Locale = "fr") => runUssd(input, { locale, backend: b, translator });
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("ussdPath", () => {
  it("applies back (0) and home (00)", () => {
    expect(ussdPath("")).toEqual([]);
    expect(ussdPath("2*1")).toEqual(["2", "1"]);
    expect(ussdPath("2*0*3")).toEqual(["3"]);
    expect(ussdPath("2*1*00*1")).toEqual(["1"]);
  });
});

describe("*123# menu", () => {
  it("opens on the main menu in French", async () => {
    const r = await run("");
    expect(r.end).toBe(false);
    expect(r.text).toContain("1. Solde");
    expect(r.text).toContain("4. Langue");
  });

  it("1 shows the ledger balance and ends", async () => {
    const r = await run("1");
    expect(r.end).toBe(true);
    expect(plain(r.text)).toBe("Votre solde : 150 000 FCFA");
  });

  it("2 lists unpaid dues, asks to confirm, then pays through payShare", async () => {
    const b = backend();
    const list = await run("2", b);
    expect(list.end).toBe(false);
    expect(plain(list.text)).toContain("1. Tontine du marché… 10 000 FCFA");
    expect(list.text).not.toContain("Yopougon"); // already paid
    const confirm = await run("2*1", b);
    expect(plain(confirm.text)).toContain("Payer 10 000 FCFA");
    expect(confirm.text).toContain("1. Confirmer");
    expect(b.payShare).not.toHaveBeenCalled();
    const done = await run("2*1*1", b);
    expect(done.end).toBe(true);
    expect(b.payShare).toHaveBeenCalledWith("g1");
  });

  it("cancelling does not pay", async () => {
    const b = backend();
    const r = await run("2*1*2", b);
    expect(r.text).toBe("Paiement annulé.");
    expect(b.payShare).not.toHaveBeenCalled();
  });

  it("shows payShare errors in plain words", async () => {
    const r = await run("2*1*1", backend({ payShare: async () => ({ error: "noAccount" }) }));
    expect(r.text).toContain("compte Mobile Money");
  });

  it("says when nothing is due", async () => {
    const r = await run("2", backend({ dues: async () => [] }));
    expect(r).toEqual({ end: true, text: "Aucune cotisation à payer. Merci !" });
  });

  it("3 lists tontines with their status", async () => {
    const r = await run("3");
    expect(r.end).toBe(true);
    expect(plain(r.text)).toContain("10 000 FCFA avant le 20/11");
    expect(r.text).toContain("Épargne Yopougon : payé (tour 2)");
    expect(r.text).toContain("Nouvelle tontine : pas de tour en cours");
  });

  it("4 switches language and answers in the new one", async () => {
    const b = backend();
    expect((await run("4", b)).text).toContain("2. English");
    const r = await run("4*2", b);
    expect(b.setLocale).toHaveBeenCalledWith("en");
    expect(r.text).toBe("Language: English.");
    expect((await run("", b, "en")).text).toContain("2. Pay my tontine");
  });

  it("rejects invalid choices without calling the backend", async () => {
    const b = backend();
    for (const input of ["9", "2*7", "2*1*5", "1*1", "4*3", "2*x"]) {
      const r = await run(input, b);
      expect(r.end, input).toBe(true);
      expect(r.text, input).toContain("Choix invalide");
    }
    expect(b.payShare).not.toHaveBeenCalled();
    expect(b.setLocale).not.toHaveBeenCalled();
  });

  it("keeps every screen within the USSD size", async () => {
    const many = Array.from({ length: 9 }, (_, i) => due({ groupId: `g${i}`, groupName: `Une très longue tontine numéro ${i}`, amount: 1_250_000 }));
    const b = backend({ dues: async () => many, tontines: async () => many.map((d) => ({ groupId: d.groupId, name: d.groupName })) });
    for (const input of ["", "2", "2*1", "3", "4"]) expect((await run(input, b)).text.length).toBeLessThanOrEqual(USSD_MAX);
  });
});
