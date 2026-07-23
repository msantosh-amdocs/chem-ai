import { extractPdfText } from "./pdf.js";
import { extractDocxText } from "./docx.js";

export type DocKind = "pdf" | "docx" | "text";

export function detectKind(filename: string, mimetype?: string): DocKind {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mimetype === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  return "text";
}

export async function extractText(
  buffer: Buffer,
  kind: DocKind,
): Promise<string> {
  switch (kind) {
    case "pdf":
      return extractPdfText(buffer);
    case "docx":
      return extractDocxText(buffer);
    case "text":
      return buffer.toString("utf8");
  }
}
