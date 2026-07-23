import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompletenessDial } from "../CompletenessDial";

describe("<CompletenessDial>", () => {
  it("clamps values above 100 and below 0", () => {
    const { rerender } = render(<CompletenessDial value={140} />);
    expect(screen.getByText("100")).toBeInTheDocument();
    rerender(<CompletenessDial value={-5} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders the exact numeric value in [0, 100]", () => {
    render(<CompletenessDial value={72} />);
    expect(screen.getByText("72")).toBeInTheDocument();
  });

  it("exposes a color band via data attribute", () => {
    const { rerender, container } = render(<CompletenessDial value={90} />);
    expect(container.querySelector("[data-band='good']")).toBeInTheDocument();
    rerender(<CompletenessDial value={70} />);
    expect(container.querySelector("[data-band='warn']")).toBeInTheDocument();
    rerender(<CompletenessDial value={30} />);
    expect(container.querySelector("[data-band='bad']")).toBeInTheDocument();
  });
});
