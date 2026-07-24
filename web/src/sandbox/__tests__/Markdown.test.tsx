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

  it("passes a mermaid `pie` block through so the Finance CAPEX chart can render", () => {
    // Charts required by the Finance prompt (§3.1 / §5.1) — verify the
    // fenced block survives the markdown pipeline intact and lands in a
    // `code.language-mermaid` so the async renderer can pick it up.
    const src = [
      "```mermaid",
      "pie showData title CAPEX Breakdown (INR ₹80 Cr)",
      '    "Process Equipment" : 45',
      '    "Building & Civil" : 20',
      '    "Utilities & Services" : 8',
      '    "Contingency & Preop" : 4',
      '    "IT & Automation" : 3',
      "```",
    ].join("\n");
    const { container } = render(<Markdown source={src} />);
    const code = container.querySelector("code.language-mermaid");
    expect(code).not.toBeNull();
    expect(code!.textContent).toContain("pie showData");
    expect(code!.textContent).toContain("Process Equipment");
  });

  it("passes a mermaid `xychart-beta` bar block through so the Finance revenue chart can render", () => {
    const src = [
      "```mermaid",
      "xychart-beta",
      '    title "5-Year Revenue (INR ₹ Cr)"',
      "    x-axis [Y1, Y2, Y3, Y4, Y5]",
      '    y-axis "Revenue (INR ₹ Cr)" 0 --> 500',
      "    bar [80, 180, 320, 420, 470]",
      "```",
    ].join("\n");
    const { container } = render(<Markdown source={src} />);
    const code = container.querySelector("code.language-mermaid");
    expect(code).not.toBeNull();
    expect(code!.textContent).toContain("xychart-beta");
    expect(code!.textContent).toContain("bar [80, 180, 320, 420, 470]");
  });

  it("passes a mermaid `xychart-beta` combined bar+line block for the P&L chart", () => {
    const src = [
      "```mermaid",
      "xychart-beta",
      '    title "Revenue (bar) vs EBITDA (line) — INR ₹ Cr"',
      "    x-axis [Y1, Y2, Y3, Y4, Y5]",
      '    y-axis "INR ₹ Cr" -50 --> 500',
      "    bar [80, 180, 320, 420, 470]",
      "    line [-10, 25, 90, 140, 170]",
      "```",
    ].join("\n");
    const { container } = render(<Markdown source={src} />);
    const code = container.querySelector("code.language-mermaid");
    expect(code).not.toBeNull();
    // Both series survive so mermaid can overlay them.
    expect(code!.textContent).toMatch(/bar \[/);
    expect(code!.textContent).toMatch(/line \[-10/);
  });

  it("leaves `pie` and `xychart-beta` source untouched through the sanitiser (no node-shape mangling)", () => {
    // The mermaid sanitiser rewrites labels like `A[foo (bar)]` because
    // mermaid's flowchart lexer would fail on bare parens. Pie and
    // xychart-beta use a different grammar (bracketed x-axis, quoted
    // slice labels), so the sanitiser must leave them ALONE — otherwise
    // we'd corrupt e.g. `x-axis [Y1, Y2, Y3]` into gibberish.
    const pieSrc = [
      "pie showData title CAPEX Breakdown (INR ₹80 Cr)",
      '    "Process Equipment" : 45',
      '    "Building & Civil" : 20',
    ].join("\n");
    expect(sanitizeMermaidSource(pieSrc)).toBe(pieSrc);

    const xySrc = [
      "xychart-beta",
      '    title "5-Year Revenue"',
      "    x-axis [Y1, Y2, Y3, Y4, Y5]",
      '    y-axis "INR ₹ Cr" 0 --> 500',
      "    bar [80, 180, 320, 420, 470]",
    ].join("\n");
    expect(sanitizeMermaidSource(xySrc)).toBe(xySrc);
  });

  it("normaliser recognises bare `pie` and `xychart-beta` diagrams and re-fences them", () => {
    // Some models emit a bold label + bare mermaid body without the
    // opening fence. The Markdown component has a defensive normaliser
    // that recognises the keyword and wraps it — verify the new chart
    // types are on that whitelist.
    const bareSrc = [
      "**Chart:**",
      "",
      "mermaid",
      "pie showData title Mix",
      '    "A" : 50',
      '    "B" : 30',
      '    "C" : 20',
    ].join("\n");
    const normalized = normalizeMermaidFences(bareSrc);
    expect(normalized).toMatch(/^```mermaid$/m);
    expect(normalized).toContain("pie showData");
  });

  it("renders a block math `$$…$$` as a .md-math-block placeholder carrying the TeX source in data-math", () => {
    const src = [
      "Chemistry:",
      "",
      "$$\\ce{CH4 + 2 O2 -> CO2 + 2 H2O}$$",
      "",
      "Rest of the text.",
    ].join("\n");
    const { container } = render(<Markdown source={src} />);
    const block = container.querySelector<HTMLDivElement>(
      "div.md-math.md-math-block",
    );
    expect(block).not.toBeNull();
    // Attribute round-trips as decoded text — `-&gt;` etc. is un-escaped.
    expect(block!.getAttribute("data-math")).toBe(
      "\\ce{CH4 + 2 O2 -> CO2 + 2 H2O}",
    );
  });

  it("renders inline `$…$` math as a .md-math-inline placeholder", () => {
    const src = "The enthalpy is $\\Delta H = -890$ kJ/mol.";
    const { container } = render(<Markdown source={src} />);
    const inline = container.querySelector<HTMLSpanElement>(
      "span.md-math.md-math-inline",
    );
    expect(inline).not.toBeNull();
    expect(inline!.getAttribute("data-math")).toBe("\\Delta H = -890");
  });

  it("does NOT treat currency-like `$5` or `$100 to $200` as math", () => {
    const src = "The price is $100 to $200 per unit — that's about $5 apiece.";
    const { container } = render(<Markdown source={src} />);
    expect(container.querySelector(".md-math")).toBeNull();
    // Dollar signs remain in the rendered prose.
    expect(container.textContent).toContain("$100");
    expect(container.textContent).toContain("$200");
    expect(container.textContent).toContain("$5");
  });

  it("does NOT convert `$…$` that spans a newline (guard against runaway matches)", () => {
    const src = "First $ then a newline\ncontinues $ done.";
    const { container } = render(<Markdown source={src} />);
    expect(container.querySelector(".md-math")).toBeNull();
  });

  it("HTML-escapes the TeX source in the placeholder attribute so `>` / `&` can't break out", () => {
    const src = "$$\\ce{A + B -> C & D}$$";
    const { container } = render(<Markdown source={src} />);
    const block = container.querySelector<HTMLDivElement>(".md-math-block");
    expect(block).not.toBeNull();
    // getAttribute returns decoded text — the round-trip proves that the
    // raw HTML attribute in the innerHTML wasn't malformed.
    expect(block!.getAttribute("data-math")).toBe("\\ce{A + B -> C & D}");
    // And the placeholder is not accidentally injected as sibling text.
    expect(container.textContent?.trim()).toBe("");
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
