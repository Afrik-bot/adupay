import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { formatMsisdn, formatVolume, operatorFor } from "./airtime";
import { renderNotification } from "./notifications";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("operatorFor", () => {
  it("suggests the network from the Ivorian prefix", () => {
    expect(operatorFor("2250700000099")).toBe("orange");
    expect(operatorFor("+225 05 11 22 33 44")).toBe("mtn");
    expect(operatorFor("2250111223344")).toBe("moov");
    expect(operatorFor("2250211223344")).toBeNull(); // fixed line
    expect(operatorFor("33600000003")).toBeNull(); // abroad
  });
});

describe("formatting", () => {
  it("shows volumes the way each language says them", () => {
    expect(plain(formatVolume(500, "fr"))).toBe("500 Mo");
    expect(plain(formatVolume(1500, "fr"))).toBe("1,5 Go");
    expect(plain(formatVolume(1500, "en"))).toBe("1.5 GB");
  });
  it("groups Ivorian numbers in pairs", () => {
    expect(formatMsisdn("2250711223344")).toBe("+225 07 11 22 33 44");
  });
});

describe("Data offerte messages", () => {
  const t = (locale: "fr" | "en") => {
    const tr = createTranslator({ locale, messages: locale === "fr" ? fr : en, namespace: "notifications.templates" });
    return (key: string, values?: Record<string, string | number>) => tr(key as never, values as never);
  };
  it("says the volume won, in French and English", () => {
    expect(plain(renderNotification(t("fr"), "reward_on_time_contribution", { data_mb: 500 }, "fr"))).toBe(
      "AduPay : Bravo ! Vous avez gagné 500 Mo pour votre cotisation à l’heure.",
    );
    expect(plain(renderNotification(t("en"), "reward_clean_cycle", { data_mb: 1500, group_name: "Famille" }, "en"))).toBe(
      "AduPay: Well done! Everyone in “Famille” paid on time: you win 1.5 GB.",
    );
  });
});
