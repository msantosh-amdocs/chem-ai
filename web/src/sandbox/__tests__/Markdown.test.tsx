import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "../Markdown";

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
});
