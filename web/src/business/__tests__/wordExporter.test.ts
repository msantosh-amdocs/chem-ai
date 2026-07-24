import { describe, it, expect } from "vitest";
import {
  buildWordDocument,
  buildArtifactWord,
  buildSessionPackWord,
} from "../wordExporter";
import { buildSolutionPack } from "../exporter";
import type { ArchitectureSession } from "../../connector/types";

function makeSession(overrides: Partial<ArchitectureSession> = {}): ArchitectureSession {
  return {
    id: "s1",
    title: "Chloropyridine 500 t/yr Gujarat",
    idea: "Set up a 500 t/yr chloropyridine plant in Gujarat.",
    status: "completed",
    createdAt: new Date("2026-05-01T00:00:00Z").toISOString(),
    updatedAt: new Date("2026-05-02T00:00:00Z").toISOString(),
    settings: { threshold: 95, maxRounds: 4 },
    specialists: {
      analyst: {
        id: "aarav",
        role: "analyst",
        name: "Aarav",
        tagline: "-",
        model: "gpt-4",
        avatarId: "aarav",
        accent: {
          solid: "bg-indigo-500",
          bg: "bg-indigo-50",
          border: "border-indigo-200",
          text: "text-indigo-700",
          ring: "ring-indigo-200",
        },
        params: {},
        roleDescription: "",
        tone: "",
      },
      teams: [],
    },
    documents: [],
    refinement: [],
    refinedIdea: { content: "Refined concept body.", createdAt: new Date().toISOString() },
    artifacts: [
      {
        kind: "market",
        title: "Market Analysis",
        producedBy: "ananya",
        content: "# Heading\n\nSome **bold** body with `code`.",
        createdAt: new Date().toISOString(),
        streaming: false,
        rounds: [],
        terminatedBy: "agreement",
        finalAgreements: {},
      },
    ],
    ...overrides,
  };
}

describe("buildWordDocument", () => {
  it("wraps rendered HTML in a Word-flavoured document shell", () => {
    const html = buildWordDocument("My Doc", "# Hello\n\nWorld");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('xmlns:o="urn:schemas-microsoft-com:office:office"');
    expect(html).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(html).toContain("<w:WordDocument>");
    expect(html).toContain("<title>My Doc</title>");
    expect(html).toContain('<meta name="ProgId" content="Word.Document">');
    expect(html).toContain('<meta name="Generator" content="Chem AI">');
  });

  it("renders headings, bold, and inline code from Markdown", () => {
    const html = buildWordDocument(
      "Doc",
      "# H1\n\nParagraph with **bold** and `code`.\n",
    );
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("renders GFM tables", () => {
    const md = [
      "| Col A | Col B |",
      "| ----- | ----- |",
      "| a     | b     |",
      "",
    ].join("\n");
    const html = buildWordDocument("Doc", md);
    expect(html).toContain("<table");
    expect(html).toMatch(/<th[^>]*>Col A/);
    expect(html).toMatch(/<td[^>]*>a/);
  });

  it("escapes the title for safe HTML embedding", () => {
    const html = buildWordDocument("<script>alert('xss')</script>", "");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain(
      "<title>&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;</title>",
    );
  });

  it("preserves ```mermaid blocks as preformatted source (Word can't render them)", () => {
    const md = "```mermaid\nflowchart TD\n  A --> B\n```";
    const html = buildWordDocument("Doc", md);
    expect(html).toContain("<pre>");
    expect(html).toContain("flowchart TD");
    expect(html).toContain("A --&gt; B");
  });

  it("leaves KaTeX math delimiters intact (Word can't render KaTeX)", () => {
    const md = "Reaction: $$\\ce{CH4 + 2 O2 -> CO2 + 2 H2O}$$";
    const html = buildWordDocument("Doc", md);
    expect(html).toContain("$$");
    expect(html).toContain("CH4");
    expect(html).toContain("CO2");
  });

  it("does not carry KaTeX or Mermaid marked extensions into the exporter", () => {
    // If our exporter accidentally reused the app's extended `marked`
    // singleton, `$...$` would be swallowed by the math extension and
    // never appear verbatim in the output.
    const html = buildWordDocument("Doc", "Cost is $5.00 today.");
    expect(html).toContain("Cost is $5.00 today.");
  });
});

describe("buildArtifactWord", () => {
  it("returns a .doc filename and a Word-MIME blob for a single artifact", () => {
    const { filename, blob } = buildArtifactWord(
      makeSession(),
      "market",
      "Market Analysis",
      "# Market\n\nBody.",
    );
    expect(filename).toBe(
      "chloropyridine-500-t-yr-gujarat-market.doc",
    );
    expect(blob.type).toContain("application/vnd.ms-word");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("uses 'refined-concept' as the file-name suffix for the concept view", () => {
    const { filename } = buildArtifactWord(
      makeSession(),
      "concept",
      "Refined Concept",
      "Body.",
    );
    expect(filename).toBe(
      "chloropyridine-500-t-yr-gujarat-refined-concept.doc",
    );
  });
});

describe("buildSessionPackWord", () => {
  it("packages the entire session into a Word blob with the pack filename", () => {
    const { filename, blob } = buildSessionPackWord(makeSession());
    expect(filename).toBe(
      "chloropyridine-500-t-yr-gujarat-market-research-pack.doc",
    );
    expect(blob.type).toContain("application/vnd.ms-word");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("renders the composed session pack HTML (verified via the same underlying builder)", () => {
    // The jsdom Blob shim available in Vitest can't be read back
    // reliably, so we assert on the same HTML the packer produces by
    // composing `buildSolutionPack` → `buildWordDocument` here — that
    // is exactly what `buildSessionPackWord` does internally.
    const session = makeSession();
    const html = buildWordDocument(
      `${session.title} — Market Research Pack`,
      buildSolutionPack(session),
    );
    expect(html).toContain("Market Research Pack");
    expect(html).toContain("Original Idea");
    expect(html).toContain("Refined Concept");
    expect(html).toContain("Market Analysis");
  });
});
