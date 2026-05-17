import { test, expect } from "@playwright/test";
import { authenticateViaAPIWithPhone } from "./helpers/auth";
import { createTrip } from "./helpers/trips";
import { snap } from "./helpers/screenshots";
import { removeNextjsDevOverlay, dismissPwaPrompts } from "./helpers/nextjs-dev";
import { navigateToMobilePanel } from "./helpers/mobile-panels";
import { ELEMENT_TIMEOUT } from "./helpers/timeouts";

const MOCK_POIS = {
  food_and_drink: [
    {
      sourceId: "mock-fd-1",
      name: "Pastéis de Belém",
      address: "Rua de Belém 84-92, 1300-085 Lisboa",
      lat: 38.6970,
      lon: -9.2034,
      distance: 4200,
      category: "food_and_drink",
      popularity: 9,
      price: 2,
      rating: 8.5,
      website: "https://pasteisdebelem.pt",
      tel: "+351213637423",
      subcategory: "Bakery",
      eventId: null,
    },
    {
      sourceId: "mock-fd-2",
      name: "Cervejaria Ramiro",
      address: "Av. Alm. Reis 1, 1150-007 Lisboa",
      lat: 38.7311,
      lon: -9.1356,
      distance: 2800,
      category: "food_and_drink",
      popularity: 8,
      price: 3,
      rating: 8.2,
      website: null,
      tel: null,
      subcategory: "Portuguese",
      eventId: null,
    },
  ],
  arts_and_entertainment: [
    {
      sourceId: "mock-ae-1",
      name: "MAAT",
      address: "Av. Brasília, 1300-598 Lisboa",
      lat: 38.7001,
      lon: -9.1800,
      distance: 3500,
      category: "arts_and_entertainment",
      popularity: 7,
      price: 2,
      rating: 8.0,
      website: null,
      tel: null,
      subcategory: "Museum",
      eventId: null,
    },
  ],
  outdoors: [
    {
      sourceId: "mock-out-1",
      name: "Jardim Botânico",
      address: "Rua da Escola Politécnica 58, 1250-102 Lisboa",
      lat: 38.7158,
      lon: -9.1516,
      distance: 1500,
      category: "outdoors",
      popularity: 6,
      price: 0,
      rating: 7.8,
      website: null,
      tel: null,
      subcategory: "Park",
      eventId: null,
    },
  ],
  nightlife: [
    {
      sourceId: "mock-nl-1",
      name: "Lux Frágil",
      address: "Av. Infante D. Henrique, Armazém A, 1950-412 Lisboa",
      lat: 38.7135,
      lon: -9.1211,
      distance: 5000,
      category: "nightlife",
      popularity: 9,
      price: 3,
      rating: 7.5,
      website: null,
      tel: null,
      subcategory: "Night Club",
      eventId: null,
    },
  ],
};

const LISBON_LAT = 38.7169;
const LISBON_LON = -9.1399;

test.describe("Discover Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await dismissPwaPrompts(page);
    await page.context().clearCookies();
  });

  test(
    "discover tab — view POIs, detail sheet, and create event flow",
    { tag: "@smoke" },
    async ({ page, request }) => {
      test.slow();

      const tripName = `Discover Test ${Date.now()}`;

      await test.step("authenticate and create a trip", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          `+1555${Date.now().toString().slice(-10)}`,
          "Discover Tester",
        );
        await createTrip(
          page,
          tripName,
          "Lisbon, Portugal",
          "2026-07-01",
          "2026-07-07",
        );
      });

      await test.step("mock discover API and navigate to Discover tab", async () => {
        const tripId = page.url().split("/trips/")[1];

        // Mock the trip detail to inject destination lat/lon
        await page.route(
          (url) =>
            url.pathname === `/api/trips/${tripId}` &&
            url.origin.includes("localhost"),
          async (route) => {
            const response = await route.fetch();
            const body = await response.json();
            if (body?.trip) {
              body.trip.destinationLat = LISBON_LAT;
              body.trip.destinationLon = LISBON_LON;
            }
            await route.fulfill({
              response,
              body: JSON.stringify(body),
            });
          },
        );

        // Mock the discover API to return POI data
        await page.route(
          (url) =>
            url.pathname === `/api/trips/${tripId}/discover` &&
            url.origin.includes("localhost"),
          async (route) => {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                success: true,
                data: {
                  destination: "Lisbon, Portugal",
                  source: "mock",
                  categories: MOCK_POIS,
                },
              }),
            });
          },
        );

        // Reload trip page — mock will inject lat/lon into the response
        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", { level: 1, name: tripName }),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

        await navigateToMobilePanel(page, "Discover");
      });

      await test.step("verify POI cards", async () => {
        await expect(page.getByText("Pastéis de Belém").first()).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(page.getByText("Cervejaria Ramiro")).toBeVisible();
        await expect(page.getByText("MAAT")).toBeVisible();
        await expect(page.getByText("Lux Frágil")).toBeVisible();

        await expect(page.getByText("Food & Drink")).toBeVisible();
        await expect(page.getByText("Arts & Entertainment")).toBeVisible();
        await expect(page.getByText("Outdoors")).toBeVisible();
        await expect(page.getByText("Nightlife")).toBeVisible();

        await snap(page, "discover-poi-cards");
      });

      await test.step("detail sheet: open and verify content", async () => {
        await page.getByText("Pastéis de Belém").first().click();

        await expect(page.getByText("Pastéis de Belém").first()).toBeVisible();
        await expect(page.getByText("Bakery").first()).toBeVisible();
        await expect(
          page.getByText("2.6 mi").or(page.getByText("4.2 km")).first(),
        ).toBeVisible();

        const addressLink = page.getByRole("link", { name: /Rua de Belém/ });
        await expect(addressLink).toBeVisible();
        await expect(page.getByText("Google Maps")).toBeVisible();

        await expect(
          page.getByRole("button", { name: /create event/i }),
        ).toBeVisible();
        await expect(page.getByText(/1 of \d+/)).toBeVisible();

        await snap(page, "discover-detail-sheet");
      });

      await test.step("detail sheet: arrow navigation", async () => {
        await page.getByRole("button", { name: "Next place" }).click();

        await expect(page.getByRole("heading", { name: "Cervejaria Ramiro" })).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await page.getByRole("button", { name: "Previous place" }).click();
        await expect(page.getByText("Pastéis de Belém")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await snap(page, "discover-arrow-navigation");
      });

      await test.step("create event: open pre-filled dialog", async () => {
        await page
          .getByRole("button", { name: /create event/i })
          .click();

        await expect(
          page.getByRole("heading", { name: /create a new event/i }),
        ).toBeVisible({ timeout: 5_000 });

        await snap(page, "discover-create-event-dialog");

        await page.keyboard.press("Escape");
      });
    },
  );
});
