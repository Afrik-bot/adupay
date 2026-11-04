"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALE_COOKIE } from "@/i18n/config";
import type { Currency, Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { runUssd, type UssdBackend, type UssdReply } from "@/lib/ussd";
import { getSessionUser } from "@/server/auth";
import { payShare } from "@/server/tontines";

/**
 * One USSD round trip: the simulator sends everything typed so far ("2*1*1"),
 * as a gateway would. Every option calls the same functions as the app screens.
 */
export async function ussdStep(input: string): Promise<UssdReply | { error: true }> {
  if (!/^[0-9*#]{0,40}$/.test(input)) return { error: true };
  const user = await getSessionUser();
  if (!user) return { error: true };
  const supabase = await createClient();

  const backend: UssdBackend = {
    async balances() {
      const { data } = await supabase.rpc("my_balances");
      return (data ?? []).map((b) => ({ currency: b.currency as Currency, balance: b.balance }));
    },
    async dues() {
      const { data } = await supabase.rpc("my_upcoming_dues");
      return (data ?? []).map((d) => ({
        groupId: d.group_id,
        groupName: d.group_name,
        cycleNumber: d.cycle_number,
        amount: d.amount,
        currency: d.currency as Currency,
        dueDate: d.due_date,
        paid: d.paid,
      }));
    },
    async tontines() {
      const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
      const ids = (memberships ?? []).map((m) => m.group_id);
      if (!ids.length) return [];
      const { data: groups } = await supabase.from("groups").select("id, name").in("id", ids).order("name");
      return (groups ?? []).map((g) => ({ groupId: g.id, name: g.name }));
    },
    async payShare(groupId) {
      const result = await payShare(user.id, groupId);
      if ("error" in result) return result;
      revalidatePath("/accueil");
      revalidatePath(`/tontines/${groupId}`);
      return { ok: true };
    },
    async setLocale(locale) {
      (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
      await supabase.from("profiles").update({ locale }).eq("id", user.id);
    },
  };

  const translators = {
    fr: await getTranslations({ locale: "fr", namespace: "ussd" }),
    en: await getTranslations({ locale: "en", namespace: "ussd" }),
  };
  try {
    return await runUssd(input, {
      locale: ((await getLocale()) === "en" ? "en" : "fr") as Locale,
      backend,
      translator: (locale) => (key, values) => translators[locale](key as never, values as never),
    });
  } catch (error) {
    console.error("ussd step failed", error);
    return { error: true };
  }
}
