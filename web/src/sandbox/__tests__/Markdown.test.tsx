import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Markdown,
  normalizeMermaidFences,
  sanitizeMermaidSource,
} from "../Markdown";

describe("<Markdown>", () => {
  it("renders headings, paragraphs, and lists", () => {
    const source = ["# Title", "", "Some **bold** text.", "", "- one", "- two"].join(
      "\n",
    );
    const { container } = render(<Markdown source={source} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Title");
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
  });

  it("renders empty output when the source is empty", () => {
    const { container } = render(<Markdown source="" />);
    expect(container.textContent).toBe("");
  });

  it("renders a properly-fenced mermaid block into a pre>code.language-mermaid so the effect can upgrade it", () => {
    const src = [
      "Some prose.",
      "",
      "```mermaid",
      "graph LR",
      "  A --> B",
      "```",
      "",
      "More prose.",
    ].join("\n");
    const { container } = render(<Markdown source={src} />);
    // The effect that swaps `pre>code.language-mermaid` for real SVG runs
    // asynchronously; in jsdom we just verify the pre-swap DOM has the
    // expected classed code node.
    const code = container.querySelector("code.language-mermaid");
    expect(code).not.toBeNull();
    expect(code!.textContent).toContain("graph LR");
  });
});

describe("normalizeMermaidFences", () => {
  it("leaves content without any mermaid keyword untouched", () => {
    const src = "# Title\n\nSome content.\nAnother line.";
    expect(normalizeMermaidFences(src)).toBe(src);
  });

  it("leaves already-fenced mermaid blocks untouched", () => {
    const src = "```mermaid\ngraph LR\n  A --> B\n```\n";
    expect(normalizeMermaidFences(src)).toBe(src);
  });

  it("rewraps a bare `mermaid\\n<body>` block into a proper fence", () => {
    const src = [
      "**Mermaid diagram:**",
      "",
      "mermaid",
      "graph LR",
      "    A[Foo] --> B[Bar]",
      "    B --> C[Baz]",
      "",
      "Next section body.",
    ].join("\n");
    const out = normalizeMermaidFences(src);
    expect(out).toContain("```mermaid");
    expect(out).toContain("graph LR");
    // The paragraph after the block is preserved and not consumed:
    expect(out).toContain("Next section body.");
    // Indentation stripped so mermaid parses cleanly at column 0:
    expect(out).toMatch(/```mermaid\ngraph LR\nA\[Foo\] --> B\[Bar\]/);
  });

  it("recognises a bare gantt diagram (mermaid keyword + gantt body)", () => {
    const src = [
      "mermaid",
      "gantt",
      "    title Sample",
      "    section S",
      "    Task 1 :2026-01-01, 30d",
      "",
      "Follow-up paragraph.",
    ].join("\n");
    const out = normalizeMermaidFences(src);
    expect(out.split("```mermaid").length - 1).toBe(1);
    expect(out).toContain("gantt");
    expect(out).toContain("Follow-up paragraph.");
  });

  it("does NOT trigger on a lonely `mermaid` word without a valid diagram keyword after it", () => {
    const src = "The word mermaid alone is fine.\n\nmermaid\n\nJust a paragraph.";
    // Word "mermaid" on its own line is followed by blank + non-mermaid
    // paragraph — must NOT be rewrapped.
    expect(normalizeMermaidFences(src)).toBe(src);
  });

  it("does not modify a legit standalone `mermaid` keyword when the next non-blank line is another `mermaid` keyword line (edge case)", () => {
    // A mermaid keyword line followed by another mermaid keyword line
    // isn't a valid diagram; the parser should refuse to consume it.
    const src = "mermaid\n\nmermaid";
    expect(normalizeMermaidFences(src)).toBe(src);
  });

  it("stops absorbing lines when a Markdown heading begins the next section", () => {
    const src = [
      "mermaid",
      "graph LR",
      "  A --> B",
      "",
      "## New heading",
      "Text.",
    ].join("\n");
    const out = normalizeMermaidFences(src);
    // Heading must still appear as a heading, not inside the fence:
    expect(out).toMatch(/```\n\n## New heading/);
  });
});

describe("sanitizeMermaidSource", () => {
  it("strips zero-width and non-breaking spaces", () => {
    const src = "graph LR\n\u00A0A --> B\u200B";
    expect(sanitizeMermaidSource(src)).toBe("graph LR\n A --> B");
  });

  it("auto-quotes node labels that contain parentheses so mermaid parses them", () => {
    const src =
      "graph LR\n  B[2,3-Dichloro-5-(trichloromethyl)pyridine<br/>C6H2Cl5N]";
    const out = sanitizeMermaidSource(src);
    expect(out).toContain(
      'B["2,3-Dichloro-5-(trichloromethyl)pyridine<br/>C6H2Cl5N"]',
    );
  });

  it("leaves already-quoted labels alone", () => {
    const src = 'graph LR\n  A["Already (quoted)"] --> B["fine"]';
    expect(sanitizeMermaidSource(src)).toBe(src.trim());
  });

  it("leaves plain identifier labels alone", () => {
    const src = "graph LR\n  A[Foo] --> B[Bar]";
    // No parens / pipes / colons inside — stays as-is.
    expect(sanitizeMermaidSource(src)).toBe(src.trim());
  });

  it("quotes labels containing colons or pipes (common in mermaid pitfalls)", () => {
    const src = "graph LR\n  X[Step 1: prepare feed] --> Y[branch|option]";
    const out = sanitizeMermaidSource(src);
    expect(out).toContain('X["Step 1: prepare feed"]');
    expect(out).toContain('Y["branch|option"]');
  });
});
