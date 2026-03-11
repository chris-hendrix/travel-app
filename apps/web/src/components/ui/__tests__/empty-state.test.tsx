import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Search, Bell, Users } from "lucide-react";
import { EmptyState } from "../empty-state";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        icon={Search}
        title="No results"
        description="Try a different search"
      />,
    );

    expect(screen.getByText("No results")).toBeDefined();
    expect(screen.getByText("Try a different search")).toBeDefined();
  });

  it("renders with data-slot attribute", () => {
    const { container } = render(
      <EmptyState icon={Search} title="Empty" description="Nothing here" />,
    );

    expect(container.querySelector('[data-slot="empty-state"]')).not.toBeNull();
  });

  it("renders card variant by default with TopoPattern", () => {
    const { container } = render(
      <EmptyState icon={Search} title="Empty" description="Nothing here" />,
    );

    const root = container.querySelector('[data-slot="empty-state"]')!;
    expect(root.className).toContain("bg-card");
    expect(root.className).toContain("border");
    expect(root.className).toContain("card-noise");
    // TopoPattern renders an aria-hidden div
    expect(root.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders inline variant without card styling", () => {
    const { container } = render(
      <EmptyState variant="inline" icon={Bell} title="No notifications" />,
    );

    const root = container.querySelector('[data-slot="empty-state"]')!;
    expect(root.className).not.toContain("bg-card");
    expect(root.className).not.toContain("card-noise");
    expect(root.className).toContain("flex");
  });

  it("does not render description paragraph when description is omitted", () => {
    render(
      <EmptyState variant="inline" icon={Bell} title="No notifications" />,
    );

    // Only the title should be rendered as text
    expect(screen.getByText("No notifications")).toBeDefined();
    expect(screen.queryByRole("paragraph")).toBeNull();
  });

  it("renders action button with onClick", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <EmptyState
        icon={Users}
        title="No members"
        description="Invite some friends"
        action={{ label: "Invite", onClick: handleClick }}
      />,
    );

    const button = screen.getByText("Invite");
    await user.click(button);

    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("renders action as link when href is provided", () => {
    render(
      <EmptyState
        icon={Users}
        title="No members"
        description="Invite some friends"
        action={{ label: "Go to trips", href: "/trips" }}
      />,
    );

    const link = screen.getByText("Go to trips");
    expect(link.closest("a")?.getAttribute("href")).toBe("/trips");
  });

  it("renders children for custom action areas", () => {
    render(
      <EmptyState icon={Search} title="No items" description="Add some items">
        <button type="button">Custom action</button>
      </EmptyState>,
    );

    expect(screen.getByText("Custom action")).toBeDefined();
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmptyState
        icon={Search}
        title="Empty"
        description="Nothing"
        className="rounded-lg p-12"
      />,
    );

    const root = container.querySelector('[data-slot="empty-state"]')!;
    expect(root.className).toContain("rounded-lg");
    expect(root.className).toContain("p-12");
  });
});
