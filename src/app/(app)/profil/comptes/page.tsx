import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, BadgeCheck, Star } from "lucide-react";
import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/server/auth";
import { makeDefault, unlinkAccount } from "./actions";
import { LinkAccountForm } from "./link-account-form";

export default async function ComptesPage() {
  const profile = await requireProfile();
  const t = await getTranslations("accounts");
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("linked_accounts")
    .select("id, provider, account_masked, label, is_default, verified_at")
    .eq("user_id", profile.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/profil" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {t("back")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("lead")}</p>
      </div>

      {accounts && accounts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {accounts.map((account) => (
            <li key={account.id}>
              <Card className="gap-3 p-4">
                <div className="flex items-center gap-3">
                  <ProviderIcon provider={account.provider} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{account.label || t(`providers.${account.provider}`)}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {account.label ? `${t(`providers.${account.provider}`)} · ` : ""}
                      {account.account_masked}
                    </p>
                  </div>
                  {account.is_default && (
                    <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                      <Star aria-hidden className="size-3.5" />
                      {t("default")}
                    </span>
                  )}
                </div>
                {account.verified_at && (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                    <BadgeCheck aria-hidden className="size-4" />
                    {t("verified")}
                  </p>
                )}
                <div className="flex gap-2">
                  {!account.is_default && (
                    <form action={makeDefault.bind(null, account.id)} className="flex-1">
                      <Button type="submit" variant="outline" size="sm" className="w-full">
                        {t("makeDefault")}
                      </Button>
                    </form>
                  )}
                  <form action={unlinkAccount.bind(null, account.id)} className="flex-1">
                    <Button type="submit" variant="ghost" size="sm" className="w-full text-destructive">
                      {t("remove")}
                    </Button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>
      )}

      <LinkAccountForm />
    </div>
  );
}
