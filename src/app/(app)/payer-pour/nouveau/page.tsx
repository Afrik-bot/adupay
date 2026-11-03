import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/server/auth";
import { PayForWizard } from "./wizard";

const DEFAULT_CURRENCY: Record<string, "EUR" | "USD" | "CAD"> = { US: "USD", CA: "CAD" };

export default async function NouveauPayerPourPage({ searchParams }: { searchParams: Promise<{ tontine?: string }> }) {
  const profile = await requireProfile();
  const { tontine } = await searchParams;
  const supabase = await createClient();
  const { data: sponsorships } = await supabase.rpc("my_sponsorships");
  return (
    <PayForWizard
      locale={await getLocale()}
      defaultCurrency={DEFAULT_CURRENCY[profile.country_code] ?? "EUR"}
      sponsorships={(sponsorships ?? []).filter((s) => s.group_status === "active")}
      preselectGroupId={tontine ?? null}
    />
  );
}
