import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api.js";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const opts: DocumentInitParameters = {
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: VerbosityLevel.ERRORS,
  };
  const task = getDocument(opts);
  const doc = await task.promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = Math.round(item.transform[5]!);
      const x = Math.round(item.transform[4]!);
      const arr = rows.get(y) ?? [];
      arr.push({ x, str: item.str });
      rows.set(y, arr);
    }
    const ys = Array.from(rows.keys()).sort((a, b) => b - a);
    const lines: string[] = [];
    for (const y of ys) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x).map((p) => p.str);
      const line = parts.join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    }
    pages.push(lines.join("\n"));
  }
  await doc.destroy();
  return pages.join("\n\n");
}
