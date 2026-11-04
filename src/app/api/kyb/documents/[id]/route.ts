import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Opens one KYB document through a 60-second signed URL. RLS on kyb_documents
 * and storage lets the business's owner and admins see it; anyone else gets 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: doc } = await supabase.from("kyb_documents").select("document_path").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ ok: false }, { status: 404 });
  const { data, error } = await supabase.storage.from("kyb-documents").createSignedUrl(doc.document_path, 60);
  if (error || !data) return NextResponse.json({ ok: false }, { status: 404 });
  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
