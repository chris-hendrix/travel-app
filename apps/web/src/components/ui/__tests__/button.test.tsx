import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, buttonVariants } from "../button";

describe("buttonVariants", () => {
  describe("size variants meet WCAG 2.5.8 minimum touch target (>=44px)", () => {
    it("default size has h-11 without responsive shrink", () => {
      const classes = buttonVariants({ size: "default" });
      expect(classes).toContain("h-11");
      expect(classes).not.toContain("sm:h-9");
    });

    it("xs size has h-9 without responsive shrink", () => {
      const classes = buttonVariants({ size: "xs" });
      expect(classes).toContain("h-9");
      expect(classes).not.toContain("sm:h-6");
      expect(classes).toContain("px-3");
      expect(classes).not.toContain("sm:px-2");
    });

    it("sm size has h-11 without responsive shrink", () => {
      const classes = buttonVariants({ size: "sm" });
      expect(classes).toContain("h-11");
      expect(classes).not.toContain("sm:h-8");
    });

    it("lg size has h-12 without responsive shrink", () => {
      const classes = buttonVariants({ size: "lg" });
      expect(classes).toContain("h-12");
      expect(classes).not.toContain("sm:h-10");
    });

    it("icon size has size-11 without responsive shrink", () => {
      const classes = buttonVariants({ size: "icon" });
      expect(classes).toContain("size-11");
      expect(classes).not.toContain("sm:size-9");
    });

    it("icon-xs size has size-9 without responsive shrink", () => {
      const classes = buttonVariants({ size: "icon-xs" });
      expect(classes).toContain("size-9");
      expect(classes).not.toContain("sm:size-6");
    });

    it("icon-sm size has size-11 without responsive shrink", () => {
      const classes = buttonVariants({ size: "icon-sm" });
      expect(classes).toContain("size-11");
      expect(classes).not.toContain("sm:size-8");
    });

    it("icon-lg size has size-12 without responsive shrink", () => {
      const classes = buttonVariants({ size: "icon-lg" });
      expect(classes).toContain("size-12");
      expect(classes).not.toContain("sm:size-10");
    });
  });

  describe("base radius uses rounded-md", () => {
    it("default variant has rounded-md", () => {
      const classes = buttonVariants({ variant: "default" });
      expect(classes).toContain("rounded-md");
    });

    it("icon-xs retains rounded-md for compact icon buttons", () => {
      const classes = buttonVariants({ size: "icon-xs" });
      expect(classes).toContain("rounded-md");
    });
  });

  describe("shadow hierarchy", () => {
    it("default variant has shadow-sm and hover:shadow-md", () => {
      const classes = buttonVariants({ variant: "default" });
      expect(classes).toContain("shadow-sm");
      expect(classes).toContain("hover:shadow-md");
    });

    it("destructive variant has shadow-sm and hover:shadow-md", () => {
      const classes = buttonVariants({ variant: "destructive" });
      expect(classes).toContain("shadow-sm");
      expect(classes).toContain("hover:shadow-md");
    });

    it("ghost variant has no shadow", () => {
      const classes = buttonVariants({ variant: "ghost" });
      expect(classes).not.toContain("shadow-sm");
      expect(classes).not.toContain("shadow-md");
    });

    it("secondary variant has no shadow", () => {
      const classes = buttonVariants({ variant: "secondary" });
      expect(classes).not.toContain("shadow-sm");
      expect(classes).not.toContain("shadow-md");
    });

    it("link variant has no shadow", () => {
      const classes = buttonVariants({ variant: "link" });
      expect(classes).not.toContain("shadow-sm");
      expect(classes).not.toContain("shadow-md");
    });

    it("gradient variant retains shadow-lg", () => {
      const classes = buttonVariants({ variant: "gradient" });
      expect(classes).toContain("shadow-lg");
    });
  });
});

describe("Button", () => {
  it("renders with fixed h-11 height (no responsive shrink)", () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole("button", { name: "Click me" });
    expect(button.className).toContain("h-11");
    expect(button.className).not.toContain("sm:h-9");
  });

  it("renders with the correct variant classes", () => {
    render(<Button variant="destructive">Delete</Button>);

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain("bg-destructive");
  });

  it("allows custom className to be applied via cn/tailwind-merge", () => {
    render(<Button className="h-20">Tall button</Button>);

    const button = screen.getByRole("button", { name: "Tall button" });
    expect(button.className).toContain("h-20");
  });

  it("renders as a button element by default", () => {
    render(<Button>Test</Button>);

    const button = screen.getByRole("button", { name: "Test" });
    expect(button.tagName).toBe("BUTTON");
  });

  it("sets data-slot attribute to button", () => {
    render(<Button>Test</Button>);

    const button = screen.getByRole("button", { name: "Test" });
    expect(button.getAttribute("data-slot")).toBe("button");
  });

  describe("micro-interactions", () => {
    it("applies motion-safe active scale to default variant", () => {
      const classes = buttonVariants({ variant: "default" });
      expect(classes).toContain("motion-safe:active:scale-[0.97]");
    });

    it("applies motion-safe active scale to all non-link variants", () => {
      const variants = [
        "default",
        "destructive",
        "outline",
        "secondary",
        "ghost",
        "gradient",
      ] as const;
      for (const variant of variants) {
        const classes = buttonVariants({ variant });
        expect(classes).toContain("motion-safe:active:scale-[0.97]");
      }
    });

    it("overrides active scale to 100 for link variant", () => {
      const classes = buttonVariants({ variant: "link" });
      expect(classes).toContain("active:scale-100");
    });
  });
});
