import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "../StatusPill";

describe("<StatusPill>", () => {
  it("renders the default label per status", () => {
    for (const [status, label] of [
      ["disabled", "off"],
      ["queued", "queued"],
      ["running", "running"],
      ["done", "done"],
      ["error", "error"],
    ] as const) {
      const { unmount } = render(<StatusPill status={status} />);
      expect(screen.getByTestId("status-pill")).toHaveTextContent(label);
      unmount();
    }
  });

  it("emits a pulsing dot only for 'running'", () => {
    const { rerender, container } = render(<StatusPill status="running" />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    rerender(<StatusPill status="done" />);
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("uses the provided custom label when supplied", () => {
    render(<StatusPill status="done" label="ready" />);
    expect(screen.getByTestId("status-pill")).toHaveTextContent("ready");
  });
});
