import { describe, expect, it } from "vitest";
import { contentMatchesName, detectDocumentType } from "./file-signature";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, "JFIF");
const PNG = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d);
const WEBP = bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 ");
const PDF = bytes("%PDF-1.7\n");

describe("detectDocumentType", () => {
  it("recognises the accepted formats from their first bytes", () => {
    expect(detectDocumentType(JPEG)).toBe("image/jpeg");
    expect(detectDocumentType(PNG)).toBe("image/png");
    expect(detectDocumentType(WEBP)).toBe("image/webp");
    expect(detectDocumentType(PDF)).toBe("application/pdf");
  });

  it("refuses anything else, including look-alikes", () => {
    expect(detectDocumentType(bytes("MZ", 0x90, 0))).toBeNull(); // Windows executable
    expect(detectDocumentType(bytes("<html><script>"))).toBeNull();
    expect(detectDocumentType(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBeNull();
    expect(detectDocumentType(bytes(0xff, 0xd8))).toBeNull(); // too short
    expect(detectDocumentType(new Uint8Array())).toBeNull();
  });
});

describe("contentMatchesName", () => {
  it("needs the content and the extension to agree", () => {
    expect(contentMatchesName(JPEG, "u/selfie-1.jpg")).toBe(true);
    expect(contentMatchesName(PDF, "u/rccm-1.PDF")).toBe(true);
    expect(contentMatchesName(PDF, "u/selfie-1.jpg")).toBe(false);
    expect(contentMatchesName(bytes("<svg onload=alert(1)>"), "u/selfie-1.png")).toBe(false);
  });
});
