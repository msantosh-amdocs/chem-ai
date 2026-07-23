import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  /** Backward-compatible: either `text` or `source` may be used. */
  text?: string;
  source?: string;
}

/**
 * Mermaid diagram-type keywords that are valid at the start of a block.
 * Used by `normalizeMermaidFences` to recognise bare (un-fenced) diagrams
 * emitted by the LLM. Keep in sync with mermaid's grammar; new diagram
 * types added by mermaid can be appended here without touching the rest
 * of the parser.
 */
const MERMAID_KEYWORDS = [
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "gantt",
  "pie",
  "journey",
  "mindmap",
  "timeline",
  "gitGraph",
  "quadrantChart",
  "requirementDiagram",
  "C4Context",
  "C4Container",
  "C4Component",
  "xychart-beta",
  "sankey-beta",
  "block-beta",
];
const MERMAID_KEYWORD_RE = new RegExp(
  "^(?:" + MERMAID_KEYWORDS.map((k) => k.replace(/[-]/g, "\\$&")).join("|") + ")\\b",
);

/**
 * Recover Mermaid diagrams that the LLM emitted without a proper
 * ```` ```mermaid ```` fence.
 *
 * The models (Claude Opus / Sonnet / GPT-5) frequently ignore the "wrap
 * it in a fenced code block" instruction and instead write:
 *
 *   **Mermaid diagram:**
 *
 *   mermaid
 *   graph LR
 *       A[...] --> B[...]
 *
 * Because `marked` sees no fence, our post-render effect never finds a
 * `pre > code.language-mermaid` node and the diagram is left as plain
 * text (or, worse, as an indented code block with no language). This
 * pre-processor detects the pattern — a bare `mermaid` line followed
 * by a valid diagram keyword — and rewraps the block in proper fences
 * before marked runs, so the standard rendering path takes over.
 *
 * Block terminates when we hit a blank line followed by a "structural"
 * markdown line (heading, list bullet, HR, another fence, or plain
 * non-indented text that doesn't look like mermaid continuation).
 */
export function normalizeMermaidFences(md: string): string {
  if (!md.includes("mermaid")) return md;
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  const looksLikeMermaidBody = (line: string): boolean => {
    const t = line.trim();
    if (!t) return false;
    if (/^\s+/.test(line)) return true; // indented — belongs to the diagram
    return (
      MERMAID_KEYWORD_RE.test(t) ||
      /^(subgraph|end|style|linkStyle|classDef|class|click|direction|%%)\b/.test(t) ||
      // Common edge / node syntax at column 0:
      /^[A-Za-z0-9_-]+\s*(?:-->|-\.->|--|==>|:::|\[|\()/.test(t) ||
      /^[A-Za-z0-9_-]+\(/.test(t)
    );
  };

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "mermaid") {
      // Look ahead — is the next non-blank line a valid mermaid start?
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() === "") j++;
      if (j < lines.length && MERMAID_KEYWORD_RE.test(lines[j]!.trim())) {
        const block: string[] = [lines[j]!.trim()];
        let k = j + 1;
        let pendingBlanks = 0;
        while (k < lines.length) {
          const cur = lines[k]!;
          if (cur.trim() === "") {
            pendingBlanks++;
            k++;
            continue;
          }
          if (!looksLikeMermaidBody(cur)) break;
          // Absorb any pending blank lines we buffered — they're inside the
          // diagram (mermaid tolerates them and they preserve author intent).
          for (let b = 0; b < pendingBlanks; b++) block.push("");
          pendingBlanks = 0;
          // Strip leading indentation so mermaid parses cleanly regardless
          // of how the LLM chose to indent the body.
          block.push(cur.replace(/^\s+/, ""));
          k++;
        }
        out.push("```mermaid");
        out.push(...block);
        out.push("```");
        // Emit any blank lines we buffered after the diagram body as
        // paragraph-break separators — they belonged to the surrounding
        // markdown, not the diagram, so preserving them keeps the
        // downstream document layout intact.
        for (let b = 0; b < pendingBlanks; b++) out.push("");
        i = k;
        continue;
      }
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

/**
 * Best-effort cleanup on the mermaid source *just before* mermaid.render
 * runs. Fixes the LLM-shaped syntax errors we've observed on real
 * chemistry output:
 *   - Non-breaking spaces smuggled inside labels (U+00A0) that mermaid's
 *     lexer treats as identifier characters and then rejects.
 *   - Zero-width joiners / BOM markers pasted from Word-style prompts.
 *   - Node labels that contain parentheses, pipes, or square brackets
 *     but weren't wrapped in double quotes — mermaid's lexer then treats
 *     the `(` as an alternate node-shape delimiter and errors. We
 *     auto-quote those labels so a diagram like
 *       B[2,3-Dichloro-5-(trichloromethyl)pyridine<br/>C6H2Cl5N]
 *     becomes
 *       B["2,3-Dichloro-5-(trichloromethyl)pyridine<br/>C6H2Cl5N"]
 * We only touch labels that contain the offending characters; anything
 * that's already quoted or purely alphanumeric is left alone.
 */
export function sanitizeMermaidSource(src: string): string {
  let s = src.replace(/\u00A0/g, " ").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  // Match a node header `ID[...]` at column 0 or after whitespace where
  // `...` is neither empty nor already quoted, and contains at least one
  // character that mermaid would fumble outside quotes: ( ) | # : ;.
  // The label is captured lazily so we bind on the FIRST balanced `]`
  // rather than devouring across multiple nodes.
  s = s.replace(
    /(\b[A-Za-z0-9_-]+)\[((?!")[^\]\n]*[()#|:;][^\]\n]*)\]/g,
    (_full, id, label) => `${id}["${label.replace(/"/g, "'")}"]`,
  );
  return s;
}

/**
 * Mermaid v11 renders each diagram into a hidden temporary DOM node
 * named `d<id>` while it parses; on parse failure it *also* injects an
 * error `<svg id="<id>">` into `document.body` describing the syntax
 * error ("Syntax error in text — mermaid version 11.16.0"). When
 * `render()` throws, that DOM debris is left behind. Our `<figure>`
 * fallback already shows the user a clean error note, so the leftover
 * SVG only serves to duplicate the failure and confuse readers.
 * Remove both artefacts before we insert our own error figure.
 */
function purgeMermaidDebris(id: string): void {
  for (const sel of [`#${CSS.escape(id)}`, `#d${CSS.escape(id)}`]) {
    const node = document.querySelector(sel);
    node?.remove();
  }
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
      // Recover any bare mermaid blocks *before* marked runs so they
      // flow through the same fenced-code-block path.
      const normalized = normalizeMermaidFences(raw);
      return marked.parse(normalized, { async: false }) as string;
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
    // Ids generated during THIS effect run. Cleaned up on unmount so we
    // don't leak mermaid's hidden temp containers — but we do NOT touch
    // ids from other effect runs, because a concurrent run (dev-mode
    // StrictMode double-mount, streamed content re-render) may still be
    // rendering into them. Sweeping them mid-render surfaces as a
    // "Cannot read properties of null (reading 'firstChild')" from
    // deep inside mermaid.
    const ownedIds: string[] = [];
    (async () => {
      const mermaid = await getMermaid();
      if (cancelled) return;
      for (const codeEl of codeBlocks) {
        const preEl = codeEl.parentElement as HTMLElement | null;
        if (!preEl) continue;
        // `textContent` returns the already-unescaped source (marked HTML-
        // escapes `<`, `>`, `&` inside code fences, so we can't rely on
        // `innerHTML` here).
        const src = sanitizeMermaidSource(codeEl.textContent ?? "");
        if (!src) continue;
        const id = nextMermaidId();
        ownedIds.push(id);
        const fig = document.createElement("figure");
        fig.className = "md-mermaid";
        try {
          const { svg } = await mermaid.render(id, src);
          if (cancelled) return;
          fig.innerHTML = svg;
        } catch (err) {
          // Mermaid leaves temp/error DOM behind on failure — remove it
          // so the user doesn't see two overlapping error indicators
          // (ours + mermaid's built-in "Syntax error in text" SVG).
          purgeMermaidDebris(id);
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
      // Only remove the temp render containers we ourselves created.
      // The rendered SVGs are inside `<figure>` elements which unmount
      // with the surrounding React tree; the temp containers, however,
      // live directly on `document.body` and would otherwise leak.
      for (const id of ownedIds) purgeMermaidDebris(id);
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
