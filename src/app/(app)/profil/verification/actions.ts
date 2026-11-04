"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { allow } from "@/server/rate-limit";
import { verifyUploadedDocuments } from "@/server/uploads";
import { ID_DOCUMENT_TYPES, KYC_DOCUMENT_TYPES, protectIdNumber, type KycDocumentType } from "@/server/kyc";

export type SubmitKycError = "missing" | "idNumber" | "type" | "alreadyPending" | "tooMany" | "generic";

/**
 * Records documents the browser has already uploaded to the user's own folder in
 * the private kyc-documents bucket. Inserts run as the user, so RLS checks the
 * path is theirs; status starts as pending and only an admin can change it.
 */
export async function submitKycDocuments(input: {
  documents: { documentType: string; path: string }[];
  idNumber?: string;
}): Promise<{ error: SubmitKycError } | { ok: true }> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  if (!(await allow("kyc", user.id))) return { error: "tooMany" };

  const documents = input.documents;
  const types = documents.map((d) => d.documentType);
  const valid =
    documents.length > 0 &&
    new Set(types).size === types.length &&
    documents.every(
      (d) => KYC_DOCUMENT_TYPES.includes(d.documentType as KycDocumentType) && d.path.startsWith(`${user.id}/`),
    );
  if (!valid) return { error: "missing" };

  const hasId = types.some((t) => (ID_DOCUMENT_TYPES as readonly string[]).includes(t));
  // An ID document always travels with a selfie, and needs its number.
  if (hasId !== types.includes("selfie")) return { error: "missing" };
  const idNumber = hasId ? protectIdNumber(input.idNumber ?? "") : null;
  if (hasId && !idNumber) return { error: "idNumber" };
  if (!(await verifyUploadedDocuments("kyc-documents", documents.map((d) => d.path)))) return { error: "type" };

  const supabase = await createClient();
  const { error } = await supabase.from("kyc_records").insert(
    documents.map((d) => {
      const isId = (ID_DOCUMENT_TYPES as readonly string[]).includes(d.documentType);
      return {
        user_id: user.id,
        tier_requested: d.documentType === "proof_of_address" ? 2 : 1,
        document_type: d.documentType,
        document_path: d.path,
        id_number_hash: isId ? idNumber!.hash : null,
        id_number_last4: isId ? idNumber!.last4 : null,
      };
    }),
  );
  if (error) return { error: error.code === "23505" ? "alreadyPending" : "generic" };

  revalidatePath("/profil");
  return { ok: true };
}
