import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "../TopNav";

const baseProps = {
  tab: "dashboard" as const,
  onSelectTab: vi.fn(),
  hasSession: false,
  running: false,
  refining: false,
  sdkConnected: true,
};

describe("<TopNav>", () => {
  it("renders Dashboard and Help as the two top-level tabs", () => {
    render(<TopNav {...baseProps} />);
    expect(
      screen.getByRole("button", { name: /^Dashboard/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("topnav-help")).toBeInTheDocument();
  });

  it("keeps the '+ New' button visible on non-mobile widths", () => {
    render(<TopNav {...baseProps} />);
    expect(screen.getByTestId("topnav-new-idea")).toBeInTheDocument();
  });

  it("marks the current top-level tab with aria-current=page", () => {
    render(<TopNav {...baseProps} tab="dashboard" />);
    expect(
      screen.getByRole("button", { name: /^Dashboard/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("marks the Help trigger active when a help-* sub-tab is selected", () => {
    render(<TopNav {...baseProps} tab="help-settings" />);
    expect(screen.getByTestId("topnav-help")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does NOT show the Help submenu until the trigger is clicked", () => {
    render(<TopNav {...baseProps} />);
    expect(
      screen.queryByRole("menuitem", { name: "My Team" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Settings" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "How it works" }),
    ).not.toBeInTheDocument();
  });

  it("reveals My Team / Settings / How it works after clicking Help", async () => {
    const user = userEvent.setup();
    render(<TopNav {...baseProps} />);
    await user.click(screen.getByTestId("topnav-help"));
    expect(screen.getByRole("menuitem", { name: "My Team" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "How it works" }),
    ).toBeInTheDocument();
  });

  it("dispatches onSelectTab with the sub-tab id when a Help item is chosen", async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    render(<TopNav {...baseProps} onSelectTab={onSelectTab} />);
    await user.click(screen.getByTestId("topnav-help"));
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(onSelectTab).toHaveBeenCalledWith("help-settings");
  });

  it("dispatches onSelectTab('new-idea') when the + New button is clicked", async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    render(<TopNav {...baseProps} onSelectTab={onSelectTab} />);
    await user.click(screen.getByTestId("topnav-new-idea"));
    expect(onSelectTab).toHaveBeenCalledWith("new-idea");
  });

  it("dispatches onSelectTab('dashboard') when the logo is clicked", async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    render(<TopNav {...baseProps} onSelectTab={onSelectTab} />);
    await user.click(screen.getByRole("button", { name: /Chem AI/ }));
    expect(onSelectTab).toHaveBeenCalledWith("dashboard");
  });

  it("shows a live pulse dot on Dashboard when a run is in flight", () => {
    const { rerender } = render(<TopNav {...baseProps} running />);
    const dashboardBtn = screen.getByRole("button", { name: /^Dashboard/ });
    // The pulse dot is a decorative span next to the label — assert by
    // querying inside the tab button.
    expect(dashboardBtn.querySelector(".animate-pulse")).toBeTruthy();
    rerender(<TopNav {...baseProps} refining />);
    expect(
      screen
        .getByRole("button", { name: /^Dashboard/ })
        .querySelector(".animate-pulse"),
    ).toBeTruthy();
  });

  it("shows a Session breadcrumb when a session-* tab is active", () => {
    render(<TopNav {...baseProps} tab="session-refine" hasSession />);
    expect(screen.getByLabelText("Current section")).toHaveTextContent(
      /Session/,
    );
  });

  it("reflects sdkConnected in the SDK status pill", () => {
    const { rerender } = render(<TopNav {...baseProps} sdkConnected />);
    expect(screen.getByTestId("sdk-status")).toHaveTextContent(/SDK connected/);
    rerender(<TopNav {...baseProps} sdkConnected={false} />);
    expect(screen.getByTestId("sdk-status")).toHaveTextContent(/SDK key missing/);
  });

  it("closes the Help dropdown on Escape", async () => {
    const user = userEvent.setup();
    render(<TopNav {...baseProps} />);
    await user.click(screen.getByTestId("topnav-help"));
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("menuitem", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });
});
