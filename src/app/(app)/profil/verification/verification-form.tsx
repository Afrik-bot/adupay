"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { compressImage } from "@/lib/compress-image";
import { createClient } from "@/lib/supabase/client";
import { submitKycDocuments, type SubmitKycError } from "./actions";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

type FormError = SubmitKycError | "tooLarge" | "type";

function FilePicker({
  id,
  label,
  hint,
  file,
  onChange,
  capture,
  allowPdf,
}: {
  id: string;
  label: string;
  hint?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  capture?: "user" | "environment";
  allowPdf?: boolean;
}) {
  const t = useTranslations("kyc.form");
  const Icon = allowPdf ? FileUp : Camera;
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <label
        htmlFor={id}
        className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed bg-card px-4 font-medium hover:border-muted-foreground"
      >
        <Icon aria-hidden className="size-6 shrink-0" />
        <span className="truncate">{file ? t("chosen", { name: file.name }) : allowPdf ? t("chooseFile") : t("takePhoto")}</span>
      </label>
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={allowPdf ? "image/*,application/pdf" : "image/*"}
        capture={capture}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </Field>
  );
}

export function VerificationForm({
  userId,
  step,
  residentAbroad,
}: {
  userId: string;
  step: "id" | "address";
  residentAbroad: boolean;
}) {
  const t = useTranslations("kyc");
  const router = useRouter();
  const [idType, setIdType] = useState(residentAbroad ? "passport" : "cni");
  const [idNumber, setIdNumber] = useState("");
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [address, setAddress] = useState<File | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const picked: [string, File | null][] =
      step === "id"
        ? [
            [idType, idPhoto],
            ["selfie", selfie],
          ]
        : [["proof_of_address", address]];
    if (picked.some(([, f]) => !f)) return setError("missing");
    if (step === "id" && idNumber.trim().length < 5) return setError("idNumber");

    setBusy(true);
    try {
      const storage = createClient().storage.from("kyc-documents");
      const documents: { documentType: string; path: string }[] = [];
      for (const [documentType, original] of picked) {
        const file = await compressImage(original!);
        if (!ACCEPTED.includes(file.type)) throw new Error("type");
        if (file.size > MAX_BYTES) throw new Error("tooLarge");
        const path = `${userId}/${documentType}-${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
        const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error("generic");
        documents.push({ documentType, path });
      }
      const result = await submitKycDocuments({ documents, idNumber: step === "id" ? idNumber : undefined });
      if ("error" in result) return setError(result.error);
      setSent(true);
      router.refresh();
    } catch (e) {
      const code = e instanceof Error ? e.message : "generic";
      setError(code === "type" || code === "tooLarge" ? code : "generic");
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <p className="rounded-xl border bg-card p-5 font-medium">{t("form.sent")}</p>;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold">{step === "id" ? t("form.titleId") : t("form.titleAddress")}</h2>
      {step === "id" ? (
        <>
          <Field label={t("form.idType")} htmlFor="idType">
            <select id="idType" value={idType} onChange={(e) => setIdType(e.target.value)} className={inputClass}>
              {(["cni", "passport", "residence_permit"] as const).map((type) => (
                <option key={type} value={type}>
                  {t(`docTypes.${type}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t("form.idNumber")}
            htmlFor="idNumber"
            hint={t("form.idNumberHint")}
            error={error === "idNumber" ? t("form.errors.idNumber") : null}
          >
            <input
              id="idNumber"
              autoComplete="off"
              autoCapitalize="characters"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              aria-invalid={error === "idNumber"}
              className={inputClass}
            />
          </Field>
          <FilePicker id="idPhoto" label={t("form.idPhoto")} file={idPhoto} onChange={setIdPhoto} capture="environment" />
          <FilePicker
            id="selfie"
            label={t("form.selfie")}
            hint={t("form.selfieHint")}
            file={selfie}
            onChange={setSelfie}
            capture="user"
          />
        </>
      ) : (
        <FilePicker
          id="address"
          label={t("form.address")}
          hint={t("form.addressHint")}
          file={address}
          onChange={setAddress}
          allowPdf
        />
      )}
      {error && error !== "idNumber" && (
        <p role="alert" className="font-medium text-destructive">
          {error === "alreadyPending" ? t("form.alreadyPending") : t(`form.errors.${error}`)}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? t("form.sending") : t("form.submit")}
      </Button>
    </form>
  );
}
