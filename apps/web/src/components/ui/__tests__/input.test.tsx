import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "../input";

describe("Input", () => {
  it("renders with fixed h-11 height (no responsive shrink)", () => {
    render(<Input aria-label="test input" />);

    const input = screen.getByRole("textbox", { name: "test input" });
    expect(input.className).toContain("h-11");
    expect(input.className).not.toContain("sm:h-9");
  });

  it("does not contain standalone h-9 class", () => {
    render(<Input aria-label="test input" />);

    const input = screen.getByRole("textbox", { name: "test input" });
    const classes = input.className.split(" ");
    const h9Classes = classes.filter((c) => c === "h-9");
    expect(h9Classes.length).toBe(0);
  });

  it("uses rounded-md border radius", () => {
    render(<Input aria-label="test input" />);

    const input = screen.getByRole("textbox", { name: "test input" });
    expect(input.className).toContain("rounded-md");
  });

  it("transitions border-color along with color and box-shadow", () => {
    render(<Input aria-label="test input" />);

    const input = screen.getByRole("textbox", { name: "test input" });
    expect(input.className).toContain(
      "transition-[color,box-shadow,border-color]",
    );
  });

  it("allows custom className to override height", () => {
    render(<Input aria-label="test input" className="h-16" />);

    const input = screen.getByRole("textbox", { name: "test input" });
    expect(input.className).toContain("h-16");
  });

  it("sets data-slot attribute to input", () => {
    render(<Input aria-label="test input" />);

    const input = screen.getByRole("textbox", { name: "test input" });
    expect(input.getAttribute("data-slot")).toBe("input");
  });

  it("renders as an input element", () => {
    render(<Input aria-label="test input" />);

    const input = screen.getByRole("textbox", { name: "test input" });
    expect(input.tagName).toBe("INPUT");
  });
});
