import { vi } from "vitest";

// Polyfill ResizeObserver for jsdom (required by Radix UI components)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {};
};

// Polyfill scrollIntoView for jsdom (required by cmdk Command component)
Element.prototype.scrollIntoView = vi.fn();

// Polyfill matchMedia for jsdom (used by prefers-reduced-motion checks)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
