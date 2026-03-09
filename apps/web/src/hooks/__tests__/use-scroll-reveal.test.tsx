import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useScrollReveal } from "../use-scroll-reveal";

// Mock IntersectionObserver with callback capturing
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
let intersectionCallback:
  | ((entries: { isIntersecting: boolean }[]) => void)
  | null = null;
let constructorOptions: IntersectionObserverInit | undefined;

class MockIntersectionObserver {
  constructor(
    callback: (entries: { isIntersecting: boolean }[]) => void,
    options?: IntersectionObserverInit,
  ) {
    intersectionCallback = callback;
    constructorOptions = options;
  }
  observe = mockObserve;
  disconnect = mockDisconnect;
  unobserve = vi.fn();
}

vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

beforeEach(() => {
  vi.clearAllMocks();
  intersectionCallback = null;
  constructorOptions = undefined;
});

/**
 * Test component that uses the hook and attaches the ref to a real DOM element.
 * Exposes state via data attributes for assertion.
 */
function TestComponent(props: {
  threshold?: number;
  rootMargin?: string;
  onResult?: (result: { isRevealed: boolean }) => void;
}) {
  const { ref, isRevealed } = useScrollReveal({
    threshold: props.threshold,
    rootMargin: props.rootMargin,
  });

  // Expose via callback for test assertions
  props.onResult?.({ isRevealed });

  return (
    <div ref={ref} data-revealed={String(isRevealed)}>
      content
    </div>
  );
}

describe("useScrollReveal", () => {
  it("returns ref and isRevealed", () => {
    const { container } = render(<TestComponent />);
    const el = container.firstChild as HTMLElement;

    expect(el).toBeDefined();
    expect(el.getAttribute("data-revealed")).toBe("false");
  });

  it("starts with isRevealed as false", () => {
    const { container } = render(<TestComponent />);
    const el = container.firstChild as HTMLElement;

    expect(el.getAttribute("data-revealed")).toBe("false");
  });

  it("observes the element when ref is attached", () => {
    render(<TestComponent />);

    expect(mockObserve).toHaveBeenCalledTimes(1);
  });

  it("sets isRevealed to true when element intersects", () => {
    const { container } = render(<TestComponent />);

    // Simulate intersection
    expect(intersectionCallback).not.toBeNull();
    act(() => {
      intersectionCallback!([{ isIntersecting: true }]);
    });

    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("data-revealed")).toBe("true");
  });

  it("does not set isRevealed when element is not intersecting", () => {
    const { container } = render(<TestComponent />);

    act(() => {
      intersectionCallback!([{ isIntersecting: false }]);
    });

    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("data-revealed")).toBe("false");
  });

  it("disconnects observer after reveal (one-shot)", () => {
    render(<TestComponent />);

    act(() => {
      intersectionCallback!([{ isIntersecting: true }]);
    });

    // disconnect is called once inside the callback (one-shot disconnect)
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("disconnects observer on unmount", () => {
    const { unmount } = render(<TestComponent />);

    mockDisconnect.mockClear();
    unmount();

    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("uses default threshold of 0.1", () => {
    render(<TestComponent />);

    expect(constructorOptions?.threshold).toBe(0.1);
  });

  it("uses default rootMargin of 0px", () => {
    render(<TestComponent />);

    expect(constructorOptions?.rootMargin).toBe("0px");
  });

  it("accepts custom threshold option", () => {
    render(<TestComponent threshold={0.5} />);

    expect(constructorOptions?.threshold).toBe(0.5);
  });

  it("accepts custom rootMargin option", () => {
    render(<TestComponent rootMargin="100px" />);

    expect(constructorOptions?.rootMargin).toBe("100px");
  });

  it("does not create a new observer after reveal", () => {
    render(<TestComponent />);

    // First observer was created
    expect(mockObserve).toHaveBeenCalledTimes(1);

    // Simulate intersection (reveal)
    act(() => {
      intersectionCallback!([{ isIntersecting: true }]);
    });

    // The effect re-runs due to isRevealed changing, but early-returns because isRevealed is true
    // Observer should not be created again (observe should still be 1)
    expect(mockObserve).toHaveBeenCalledTimes(1);
  });
});
