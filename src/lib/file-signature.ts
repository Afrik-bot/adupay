// Identifies an uploaded file from its first bytes ("magic bytes"), so a file
// that only claims to be an image or a PDF is refused.

export type DocumentMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const EXTENSIONS: Record<DocumentMime, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

export function detectDocumentType(bytes: Uint8Array): DocumentMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  return null;
}

/** True when the content is an accepted type and the file name's extension says the same. */
export function contentMatchesName(bytes: Uint8Array, path: string): boolean {
  const type = detectDocumentType(bytes);
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return type !== null && EXTENSIONS[type].includes(extension);
}
