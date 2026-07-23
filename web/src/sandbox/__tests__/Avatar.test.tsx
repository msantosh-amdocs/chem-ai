import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "../Avatar";

describe("<Avatar>", () => {
  it("renders a portrait when a known portraitId is given", () => {
    render(<Avatar name="Rohan" portraitId="rohan" />);
    const avatar = screen.getByTestId("avatar");
    expect(avatar).toHaveAttribute("data-portrait", "rohan");
    expect(avatar.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByTestId("avatar-initials")).toBeNull();
  });

  it("falls back to initials for an unknown portraitId", () => {
    render(<Avatar name="Anya Kapoor" portraitId="mystery" />);
    expect(screen.getByTestId("avatar-initials")).toHaveTextContent("AK");
  });

  it("renders '?' when the name is empty", () => {
    render(<Avatar name="   " />);
    expect(screen.getByTestId("avatar-initials")).toHaveTextContent("?");
  });

  it("applies size classes and optional ring", () => {
    render(<Avatar name="X" size="xl" ring ringClass="ring-indigo-300" />);
    const avatar = screen.getByTestId("avatar");
    expect(avatar.className).toContain("w-24");
    expect(avatar.className).toContain("ring-4");
    expect(avatar.className).toContain("ring-indigo-300");
  });

  it("uses the supplied solidClass for the initials background", () => {
    render(<Avatar name="X" solidClass="bg-emerald-500" />);
    expect(screen.getByTestId("avatar-initials").className).toContain(
      "bg-emerald-500",
    );
  });
});
