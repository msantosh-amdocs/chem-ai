import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  /** Backward-compatible: either `text` or `source` may be used. */
  text?: string;
  source?: string;
}

/**
 * Lazy singleton for the Mermaid module. Mermaid is ~1.5 MB gzipped and the
 * Markdown component is used in many places (Documents, Pipeline debate view,
 * History drawer, etc.), so we only pay the cost when a Mermaid fenced block
 * is actually present in the rendered content.
 */
type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};
let mermaidPromise: Promise<MermaidApi> | null = null;
async function getMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const m = (mod.default ?? mod) as MermaidApi;
      m.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "strict",
        flowchart: { htmlLabels: true, curve: "basis" },
        gantt: { fontSize: 12 },
        themeVariables: {
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        },
      });
      return m;
    });
  }
  return mermaidPromise;
}

let mermaidIdCounter = 0;
const nextMermaidId = () => `md-mermaid-${++mermaidIdCounter}`;

/**
 * Sandbox primitive: renders a Markdown string as GFM-flavored HTML, with
 * fenced ```mermaid``` blocks upgraded to real SVG diagrams on the fly.
 *
 * Rendering strategy:
 *   1. Parse Markdown → HTML via `marked` (synchronous).
 *   2. Set the HTML via a ref; mermaid blocks appear initially as their raw
 *      source in a preformatted block so screen readers and no-JS scenarios
 *      still see something meaningful.
 *   3. In a `useEffect`, find every `pre > code.language-mermaid` node,
 *      run it through mermaid, and swap the parent `<pre>` for a
 *      `<figure class="md-mermaid">` containing the rendered SVG.  On any
 *      mermaid parse error the fallback shows the raw source with a small
 *      "diagram render failed" note so the reader still gets the info.
 */
export function Markdown({ text, source }: Props) {
  const raw = text ?? source ?? "";
  const html = useMemo(() => {
    if (!raw) return "";
    try {
      return marked.parse(raw, { async: false }) as string;
    } catch {
      return raw.replace(/</g, "&lt;");
    }
  }, [raw]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const codeBlocks = Array.from(
      container.querySelectorAll<HTMLElement>("pre > code.language-mermaid"),
    );
    if (!codeBlocks.length) return;

    let cancelled = false;
    (async () => {
      const mermaid = await getMermaid();
      if (cancelled) return;
      for (const codeEl of codeBlocks) {
        const preEl = codeEl.parentElement as HTMLElement | null;
        if (!preEl) continue;
        // `textContent` returns the already-unescaped source (marked HTML-
        // escapes `<`, `>`, `&` inside code fences, so we can't rely on
        // `innerHTML` here).
        const src = codeEl.textContent ?? "";
        if (!src.trim()) continue;
        const id = nextMermaidId();
        const fig = document.createElement("figure");
        fig.className = "md-mermaid";
        try {
          const { svg } = await mermaid.render(id, src);
          if (cancelled) return;
          fig.innerHTML = svg;
        } catch (err) {
          fig.className = "md-mermaid md-mermaid-error";
          const note = document.createElement("div");
          note.className = "md-mermaid-error-note";
          note.textContent = `Diagram render failed: ${
            err instanceof Error ? err.message : String(err)
          }`;
          const pre = document.createElement("pre");
          const code = document.createElement("code");
          code.textContent = src;
          pre.appendChild(code);
          fig.appendChild(note);
          fig.appendChild(pre);
        }
        preEl.replaceWith(fig);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="md"
      data-testid="markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
