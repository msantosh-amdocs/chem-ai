import { describe, it, expect } from "vitest";
import { classifyIndustryFromConcept } from "../industry.js";

describe("classifyIndustryFromConcept", () => {
  describe("structured `Industry:` line", () => {
    it("catches semiconductor when the analyst writes it explicitly", () => {
      const concept = `# Concept

## 2. Product Definition
- Industry: semiconductor
- Sub-vertical: analog IC
`;
      expect(classifyIndustryFromConcept(concept)).toBe("semiconductor");
    });

    it("catches pharmaceutical when the analyst writes it explicitly", () => {
      const concept = `## 2. Product Definition
- Industry: pharmaceutical
- Sub-vertical: bulk drug
`;
      expect(classifyIndustryFromConcept(concept)).toBe("pharmaceutical");
    });

    it("catches chemical when the analyst writes it explicitly", () => {
      const concept = `## 2. Product Definition
- Industry: chemical
- Sub-vertical: agrochemical
`;
      expect(classifyIndustryFromConcept(concept)).toBe("chemical");
    });

    it("tolerates bold markers around the label", () => {
      const concept = `- **Industry**: semiconductor`;
      expect(classifyIndustryFromConcept(concept)).toBe("semiconductor");
    });

    it("tolerates plain-text (no bullet, no bold)", () => {
      const concept = `Industry: pharmaceutical`;
      expect(classifyIndustryFromConcept(concept)).toBe("pharmaceutical");
    });

    it("tolerates 'semi conductor' with a space (user shorthand)", () => {
      const concept = `- Industry: semi conductor`;
      expect(classifyIndustryFromConcept(concept)).toBe("semiconductor");
    });
  });

  describe("keyword fallback (no structured line)", () => {
    it("classifies as semiconductor when the concept mentions wafer + foundry", () => {
      const concept = `A new fab producing 200 mm wafers targeting a mature-node foundry. Photolithography via DUV. TSMC-style capacity ramp.`;
      expect(classifyIndustryFromConcept(concept)).toBe("semiconductor");
    });

    it("classifies as pharmaceutical when the concept mentions API + cGMP", () => {
      const concept = `We plan to manufacture an active pharmaceutical ingredient under cGMP standards for the DCGI-regulated Indian market.`;
      expect(classifyIndustryFromConcept(concept)).toBe("pharmaceutical");
    });

    it("classifies as chemical when the concept mentions agrochemical + route of synthesis", () => {
      const concept = `Building a specialty chemical / agrochemical plant with a robust route of synthesis, solvent recovery, and distillation column.`;
      expect(classifyIndustryFromConcept(concept)).toBe("chemical");
    });

    it("does NOT hijack a chemical concept just because it mentions silicon once", () => {
      // Silicon-based chemistry is common in specialty chemicals
      // (silicones, siloxanes). One passing "silicon" reference must
      // not classify the concept as semiconductor.
      const concept = `A specialty chemical plant producing silicone oils. Route of synthesis: hydrosilylation. Standard distillation column.`;
      expect(classifyIndustryFromConcept(concept)).toBe("chemical");
    });

    it("returns 'other' when literally no signal fires", () => {
      const concept = `Some free-form idea about a business.`;
      expect(classifyIndustryFromConcept(concept)).toBe("other");
    });

    it("returns 'other' on empty input", () => {
      expect(classifyIndustryFromConcept("")).toBe("other");
    });
  });

  describe("structured line beats keyword fallback", () => {
    it("trusts the analyst's declaration even when body reads chemical", () => {
      const concept = `## 2. Product Definition
- Industry: semiconductor
- Sub-vertical: analog IC

## 5. Route
We will use hydrosilylation as a downstream chemistry step (agrochemical distillation column).`;
      // The structured line wins.
      expect(classifyIndustryFromConcept(concept)).toBe("semiconductor");
    });
  });
});
