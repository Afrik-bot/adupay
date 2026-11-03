import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SIGNED_URL_SECONDS = 60;

/**
 * Opens one KYC document through a short-lived signed URL. Runs as the caller:
 * RLS on kyc_records and storage.objects lets owners see their own documents
 * and admins see everyone's; anyone else gets a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: record } = await supabase.from("kyc_records").select("document_path").eq("id", id).maybeSingle();
  if (!record?.document_path) return NextResponse.json({ ok: false }, { status: 404 });

  const { data, error } = await supabase.storage
    .from("kyc-documents")
    .createSignedUrl(record.document_path, SIGNED_URL_SECONDS);
  if (error || !data) return NextResponse.json({ ok: false }, { status: 404 });

  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
