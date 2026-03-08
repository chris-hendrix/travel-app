import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AuthLoading from "./loading";

describe("AuthLoading", () => {
  it("renders skeleton placeholders", () => {
    render(<AuthLoading />);

    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders the card wrapper matching auth page styling", () => {
    const { container } = render(<AuthLoading />);

    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("max-w-md");

    const card = outer.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-card");
    expect(card.className).toContain("rounded-md");
    expect(card.className).toContain("shadow-2xl");
  });

  it("includes skeletons for title, input, and button", () => {
    const { container } = render(<AuthLoading />);

    // Should have rounded-md skeletons for input and button (2 occurrences)
    const roundedXlSkeletons = container.querySelectorAll(
      ".rounded-md[data-slot='skeleton']",
    );
    expect(roundedXlSkeletons.length).toBeGreaterThanOrEqual(2);
  });
});
