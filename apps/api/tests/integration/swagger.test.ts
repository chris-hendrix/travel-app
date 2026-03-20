import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";

describe("Swagger/OpenAPI Endpoints", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("GET /docs/ returns Swagger UI HTML", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/docs/",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("GET /docs/json returns valid OpenAPI spec", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/docs/json",
    });

    expect(response.statusCode).toBe(200);

    const spec = JSON.parse(response.body);

    // Verify top-level OpenAPI structure
    expect(spec.openapi).toBeDefined();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe("Journiful API");
    expect(spec.info.version).toBe("1.0.0");

    // Verify paths are populated with registered routes
    expect(spec.paths).toBeDefined();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    expect(
      spec.paths["/api/health"] || spec.paths["/api/health/"],
    ).toBeDefined();

    // Verify security schemes are defined
    expect(spec.components).toBeDefined();
    expect(spec.components.securitySchemes).toBeDefined();
    expect(spec.components.securitySchemes.cookieAuth).toBeDefined();
    expect(spec.components.securitySchemes.cookieAuth.type).toBe("apiKey");
    expect(spec.components.securitySchemes.cookieAuth.in).toBe("cookie");
  });

  it("GET /docs/json includes mutuals route with response schema", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/docs/json",
    });

    const spec = JSON.parse(response.body);

    // Verify mutuals endpoint is documented
    expect(spec.paths["/api/mutuals"]).toBeDefined();
    expect(spec.paths["/api/mutuals"].get).toBeDefined();

    // Verify the 200 response schema is present
    const mutualsGet = spec.paths["/api/mutuals"].get;
    expect(mutualsGet.responses).toBeDefined();
    expect(mutualsGet.responses["200"]).toBeDefined();
  });

  it("GET /docs/ sets a CSP header that allows inline scripts and styles", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/docs/",
    });

    expect(response.statusCode).toBe(200);
    const csp = response.headers["content-security-policy"] as string;
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data:");
  });

  it("GET /docs redirects to /docs/", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/docs",
    });

    // Swagger UI may redirect /docs -> /docs/ or serve directly
    expect([200, 301, 302]).toContain(response.statusCode);
  });
});
