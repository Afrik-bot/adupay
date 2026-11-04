import "server-only";
import { contentMatchesName } from "@/lib/file-signature";
import { createAdminClient } from "@/lib/supabase/admin";

const HEADER_BYTES = 16;

/**
 * Checks that every document the browser uploaded really is the image or PDF its
 * name says, from the file's first bytes. On a mismatch, all of them are deleted
 * (nothing is recorded) and the caller refuses the submission.
 */
export async function verifyUploadedDocuments(bucket: "kyc-documents" | "kyb-documents", paths: string[]): Promise<boolean> {
  const storage = createAdminClient().storage.from(bucket);
  const checks = await Promise.all(
    paths.map(async (path) => {
      const { data } = await storage.download(path);
      if (!data) return false;
      const header = new Uint8Array(await data.slice(0, HEADER_BYTES).arrayBuffer());
      return contentMatchesName(header, path);
    }),
  );
  if (checks.every(Boolean)) return true;
  await storage.remove(paths);
  return false;
}
