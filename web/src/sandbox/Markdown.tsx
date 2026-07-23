import { useMemo } from "react";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  /** Backward-compatible: either `text` or `source` may be used. */
  text?: string;
  source?: string;
}

/**
 * Sandbox primitive: renders a Markdown string as GFM-flavored HTML.
 * Pure presentational.
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
  return <div className="md" data-testid="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
