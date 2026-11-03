import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/server/auth";
import { VerificationForm } from "./verification-form";

export default async function VerificationPage() {
  const profile = await requireProfile();
  const t = await getTranslations("kyc");
  const supabase = await createClient();
  const { data: records } = await supabase.from("kyc_records").select("document_type, status").eq("user_id", profile.id);

  const pending = new Set((records ?? []).filter((r) => r.status === "pending").map((r) => r.document_type));
  const step = profile.kyc_tier >= 2 ? "done" : profile.kyc_tier === 1 ? "address" : "id";
  const waiting =
    (step === "id" && (pending.has("selfie") || ["cni", "passport", "residence_permit"].some((d) => pending.has(d)))) ||
    (step === "address" && pending.has("proof_of_address"));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/profil" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {t("form.back")}
      </Link>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {step === "done" ? (
        <p>{t("done")}</p>
      ) : waiting ? (
        <p className="rounded-xl border bg-card p-5">{t("form.alreadyPending")}</p>
      ) : (
        <VerificationForm userId={profile.id} step={step} residentAbroad={profile.user_type === "diaspora"} />
      )}
    </div>
  );
}
