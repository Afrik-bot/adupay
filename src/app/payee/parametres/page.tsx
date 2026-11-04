import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { ContactForm, PayoutForm } from "./forms";

export default async function PayeeSettingsPage() {
  const user = (await getSessionUser())!;
  const t = await getTranslations("payee.settings");
  const accounts = await getTranslations("accounts");
  const register = await getTranslations("payee.register");
  const supabase = await createClient();
  const { data: payee } = await supabase
    .from("payees")
    .select("name, rccm_number, category, city, address, contact_phone, payout_provider, payout_account_masked, kyb_status")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!payee) redirect("/payee");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Card>
        <CardTitle>{payee.name}</CardTitle>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{register("rccm")}</dt>
          <dd className="font-mono">{payee.rccm_number}</dd>
          <dt className="text-muted-foreground">{register("category")}</dt>
          <dd>{register(`categories.${payee.category}`)}</dd>
          <dt className="text-muted-foreground">{t("status")}</dt>
          <dd>{t(`statuses.${payee.kyb_status}`)}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">{t("identityHint")}</p>
      </Card>
      <ContactForm phone={payee.contact_phone ?? ""} address={payee.address ?? ""} />
      <PayoutForm
        current={payee.payout_account_masked ? `${accounts(`providers.${payee.payout_provider ?? "bank"}`)} · ${payee.payout_account_masked}` : t("noPayout")}
      />
    </div>
  );
}
