import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "../TopNav";

const baseProps = {
  tab: "new" as const,
  onSelectTab: vi.fn(),
  hasSession: false,
  hasRefinedIdea: false,
  running: false,
  refining: false,
  sdkConnected: true,
};

describe("<TopNav>", () => {
  it("renders all seven tabs", () => {
    render(<TopNav {...baseProps} />);
    for (const label of [
      "New Idea",
      "Refine",
      "Pipeline",
      "Documents",
      "My Team",
      "History",
      "How it works",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
  });

  it("keeps How it works always enabled regardless of session state", () => {
    render(<TopNav {...baseProps} hasSession={false} hasRefinedIdea={false} />);
    expect(screen.getByRole("button", { name: /^How it works/ })).toBeEnabled();
  });

  it("disables Refine/Pipeline until a session exists and Documents until refined", () => {
    render(<TopNav {...baseProps} hasSession={false} hasRefinedIdea={false} />);
    expect(screen.getByRole("button", { name: /^Refine/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Pipeline/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Documents/ })).toBeDisabled();
  });

  it("enables Refine and Pipeline once a session exists", () => {
    render(<TopNav {...baseProps} hasSession hasRefinedIdea={false} />);
    expect(screen.getByRole("button", { name: /^Refine/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Pipeline/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Documents/ })).toBeDisabled();
  });

  it("enables Documents once the refined idea is present", () => {
    render(<TopNav {...baseProps} hasSession hasRefinedIdea />);
    expect(screen.getByRole("button", { name: /^Documents/ })).toBeEnabled();
  });

  it("shows an SDK status pill that reflects `sdkConnected`", () => {
    const { rerender } = render(<TopNav {...baseProps} sdkConnected />);
    expect(screen.getByTestId("sdk-status")).toHaveTextContent(/SDK connected/);
    rerender(<TopNav {...baseProps} sdkConnected={false} />);
    expect(screen.getByTestId("sdk-status")).toHaveTextContent(/SDK key missing/);
  });

  it("calls onSelectTab when a tab is clicked", async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    render(
      <TopNav {...baseProps} hasSession hasRefinedIdea onSelectTab={onSelectTab} />,
    );
    await user.click(screen.getByRole("button", { name: /^Documents/ }));
    expect(onSelectTab).toHaveBeenCalledWith("docs");
  });
});
