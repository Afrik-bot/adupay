import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { MfaForm } from "./mfa-form";

// Staff pass a second factor (an authenticator app code) before the admin
// console. The database also refuses staff actions without it (has_role).
export default async function StaffMfaPage() {
  if (!(await getSessionUser())) redirect("/connexion?next=/admin");
  const supabase = await createClient();
  const { data: access } = await supabase.rpc("staff_access");
  if (access === "ok") redirect("/admin");
  if (access !== "mfa") notFound();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const t = await getTranslations("auth.mfa");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("lead")}</p>
      </div>
      <MfaForm factorId={factors?.totp[0]?.id ?? null} />
    </div>
  );
}
