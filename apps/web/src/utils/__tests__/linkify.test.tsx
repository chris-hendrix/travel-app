import { describe, expect, it } from "vitest";
import { linkifyText } from "../linkify";

describe("linkifyText", () => {
  it("returns the original text when there are no URLs", () => {
    const result = linkifyText("Hello, world!");
    expect(result).toEqual(["Hello, world!"]);
  });

  it("linkifies a single URL in the middle of text", () => {
    const result = linkifyText("Visit https://example.com for info");
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("Visit ");
    expect(result[2]).toBe(" for info");

    // Check the anchor element
    const anchor = result[1] as React.ReactElement;
    expect(anchor.props.href).toBe("https://example.com");
    expect(anchor.props.target).toBe("_blank");
    expect(anchor.props.rel).toBe("noopener noreferrer");
    expect(anchor.props.children).toBe("https://example.com");
  });

  it("linkifies multiple URLs", () => {
    const result = linkifyText(
      "See https://a.com and https://b.com for details",
    );
    expect(result).toHaveLength(5);
    expect(result[0]).toBe("See ");
    expect((result[1] as React.ReactElement).props.href).toBe("https://a.com");
    expect(result[2]).toBe(" and ");
    expect((result[3] as React.ReactElement).props.href).toBe("https://b.com");
    expect(result[4]).toBe(" for details");
  });

  it("handles URL at the start of text", () => {
    const result = linkifyText("https://example.com is great");
    expect(result).toHaveLength(2);
    expect((result[0] as React.ReactElement).props.href).toBe(
      "https://example.com",
    );
    expect(result[1]).toBe(" is great");
  });

  it("handles URL at the end of text", () => {
    const result = linkifyText("Check out https://example.com");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Check out ");
    expect((result[1] as React.ReactElement).props.href).toBe(
      "https://example.com",
    );
  });

  it("strips trailing punctuation from URLs", () => {
    const result = linkifyText("Go to https://example.com.");
    expect(result).toHaveLength(3);
    expect((result[1] as React.ReactElement).props.href).toBe(
      "https://example.com",
    );
    expect(result[2]).toBe(".");
  });

  it("strips trailing comma from URLs", () => {
    const result = linkifyText("See https://example.com, then go");
    expect((result[1] as React.ReactElement).props.href).toBe(
      "https://example.com",
    );
    expect(result[2]).toBe(", then go");
  });

  it("handles URLs with paths and query params", () => {
    const result = linkifyText(
      "Link: https://example.com/path?q=hello&lang=en#section",
    );
    expect((result[1] as React.ReactElement).props.href).toBe(
      "https://example.com/path?q=hello&lang=en#section",
    );
  });

  it("handles http URLs", () => {
    const result = linkifyText("Go to http://example.com");
    expect((result[1] as React.ReactElement).props.href).toBe(
      "http://example.com",
    );
  });

  it("returns single-element array for empty string", () => {
    const result = linkifyText("");
    expect(result).toEqual([""]);
  });

  it("applies correct className to links", () => {
    const result = linkifyText("https://example.com");
    const anchor = result[0] as React.ReactElement;
    expect(anchor.props.className).toBe("text-primary underline");
  });
});
