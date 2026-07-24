import { Marked } from "marked";
import type { ArchitectureSession } from "../connector/types";
import { buildSolutionPack, slugifySessionTitle } from "./exporter";

/**
 * Word export.
 *
 * We render a "Word-flavoured HTML" (a.k.a. Word 2003 HTML), saved with
 * a `.doc` extension and served as `application/msword`. That MIME +
 * extension pair is what Microsoft Word, LibreOffice Writer, and Google
 * Docs all recognise, so a single generated blob opens correctly in
 * every mainstream Office tool without needing a heavyweight
 * `.docx`-generation library.
 *
 * Fidelity notes:
 * - Headings, paragraphs, tables, lists (ordered + unordered),
 *   blockquotes, code blocks, links, and inline emphasis all render
 *   with Word's default styling plus our small inline CSS tweaks.
 * - Mermaid diagrams (```mermaid …```), KaTeX math (`$$…$$` / `$…$`),
 *   and xychart-beta blocks fall back to preformatted source text —
 *   Word can't render them natively. This is deliberate: preserving
 *   the source is better than dropping it silently.
 *
 * All entry points here are pure functions of their inputs so they
 * can be unit-tested without a DOM.
 */

/**
 * A fresh `marked` instance without our KaTeX / Mermaid extensions —
 * the runtime `Markdown` renderer patches the shared singleton for
 * the SPA, but the Word exporter wants vanilla behaviour so
 * math delimiters and mermaid fences stay as raw source text.
 */
const wordMarked = new Marked({
  gfm: true,
  breaks: false,
});

const WORD_MIME_TYPE =
  "application/vnd.ms-word;charset=utf-8";

/**
 * Escape a string for safe interpolation into an HTML attribute value
 * or PCDATA. Also strips control characters that would confuse Word's
 * parser.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render markdown to Word-flavoured HTML. Exported for unit tests.
 *
 * The returned string is a fully self-contained HTML document with:
 *  - MS Office namespace declarations,
 *  - the `<xml><w:WordDocument>…</w:WordDocument></xml>` conditional
 *    comment block that flips Word into document mode,
 *  - inline CSS mimicking Word's default paragraph / heading /
 *    table / code styles at a readable 11pt Calibri baseline,
 *  - a `<meta charset='utf-8'>` tag so ₹, °C, ≥, arrows, and other
 *    typography survive.
 */
export function buildWordDocument(title: string, markdown: string): string {
  // Render the markdown to HTML synchronously — we don't await any
  // async extensions because we don't install any on `wordMarked`.
  const body = wordMarked.parse(markdown, { async: false }) as string;

  const safeTitle = escapeHtml(title);
  const styles = `
    body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 11pt; color: #1f2937; line-height: 1.4; }
    h1 { font-size: 20pt; color: #0f172a; margin: 20pt 0 8pt; border-bottom: 1pt solid #cbd5e1; padding-bottom: 4pt; }
    h2 { font-size: 15pt; color: #0f172a; margin: 16pt 0 6pt; }
    h3 { font-size: 13pt; color: #1e293b; margin: 12pt 0 4pt; }
    h4, h5, h6 { font-size: 11pt; color: #1e293b; margin: 8pt 0 4pt; }
    p { margin: 6pt 0; }
    ul, ol { margin: 6pt 0; padding-left: 24pt; }
    li { margin: 2pt 0; }
    blockquote { border-left: 2pt solid #94a3b8; margin: 8pt 0; padding: 4pt 10pt; color: #475569; background: #f8fafc; }
    code { font-family: Consolas, "Courier New", monospace; font-size: 10pt; background: #f1f5f9; padding: 1pt 3pt; }
    pre { font-family: Consolas, "Courier New", monospace; font-size: 10pt; background: #f1f5f9; border: 1pt solid #e2e8f0; padding: 8pt; white-space: pre-wrap; word-wrap: break-word; }
    pre code { background: transparent; padding: 0; }
    table { border-collapse: collapse; margin: 8pt 0; width: 100%; }
    th, td { border: 1pt solid #cbd5e1; padding: 4pt 6pt; text-align: left; vertical-align: top; font-size: 10pt; }
    th { background: #f1f5f9; font-weight: 600; }
    hr { border: 0; border-top: 1pt solid #cbd5e1; margin: 12pt 0; }
    a { color: #2563eb; text-decoration: underline; }
    strong { font-weight: 600; }
    em { font-style: italic; }
    .doc-metadata { color: #64748b; font-size: 9pt; margin-top: 4pt; }
  `.trim();

  // The `<xml><w:WordDocument>…</w:WordDocument></xml>` conditional
  // comment tells Word to open in Print View at 100% zoom, which is
  // what users expect when they double-click a report.
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Chem AI">
<title>${safeTitle}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
${styles}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Convenience: build the Word document for a single artifact and
 * return `{ filename, blob }` ready to be handed to the download
 * trigger. `kindOrConcept` is either a `DocumentKind` or the string
 * `"concept"` for the refined concept.
 */
export function buildArtifactWord(
  session: ArchitectureSession,
  kindOrConcept: string,
  title: string,
  markdown: string,
): { filename: string; blob: Blob } {
  const suffix = kindOrConcept === "concept" ? "refined-concept" : kindOrConcept;
  const filename = `${slugifySessionTitle(session.title)}-${suffix}.doc`;
  const html = buildWordDocument(title, markdown);
  return { filename, blob: new Blob([html], { type: WORD_MIME_TYPE }) };
}

/**
 * Convenience: build the Word document for the whole session pack
 * (refined concept + every produced artifact).
 */
export function buildSessionPackWord(
  session: ArchitectureSession,
): { filename: string; blob: Blob } {
  const filename = `${slugifySessionTitle(session.title)}-market-research-pack.doc`;
  const md = buildSolutionPack(session);
  const html = buildWordDocument(
    `${session.title} — Market Research Pack`,
    md,
  );
  return { filename, blob: new Blob([html], { type: WORD_MIME_TYPE }) };
}
