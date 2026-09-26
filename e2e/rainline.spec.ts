import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const place = {
  name: "Basel",
  administrativeArea: "Basel-Stadt",
  country: "Switzerland",
  latitude: 47.5584,
  longitude: 7.5733,
  elevation: 279,
  timezone: "Europe/Zurich",
};

function sampleForecast(location = place) {
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  const hourly = Array.from({ length: 168 }, (_, index) => ({
    timestamp: new Date(start.valueOf() + index * 3_600_000).toISOString(),
    precipitationMm: index < 5 ? 0 : index % 7 === 0 ? 2.2 : 0.4,
    precipitationProbability: index < 5 ? 10 : 65,
    snowFraction: 0,
    temperatureC: 14,
    conditionCode: 23,
  }));
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.valueOf() + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return {
      date,
      precipitationMm: 4.2 + index,
      precipitationProbability: 70,
      temperatureMinC: 9,
      temperatureMaxC: 17,
      conditionCode: 6,
      predictability: 82 - index * 5,
      predictabilityClass: index < 4 ? 4 : 3,
    };
  });
  return {
    location,
    modelRunAt: start.toISOString(),
    modelUpdatedAt: start.toISOString(),
    fetchedAt: new Date().toISOString(),
    freshness: "live",
    hourly,
    daily,
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ place, forecast }) => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.startsWith("/api/locations?"))
          return Promise.resolve(
            new Response(JSON.stringify({ locations: [place] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        if (url.startsWith("/api/forecast?"))
          return Promise.resolve(
            new Response(JSON.stringify(forecast), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        return nativeFetch(input, init);
      };
    },
    { place, forecast: sampleForecast() },
  );
});

test("search, forecast ranges, units, and persisted preference", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Search for a location" })
    .fill("Basel");
  await page.getByRole("option", { name: /Basel/ }).click();
  await expect(page.getByRole("heading", { name: /Basel/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Precipitation forecast" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "7-Day Forecast" }),
  ).toBeVisible();
  await expect(page.locator(".day-card")).toHaveCount(7);
  if (process.env.RAINLINE_SCREENSHOT === "1") {
    await page.screenshot({
      path: `/tmp/rainline-${testInfo.project.name}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "48h" }).click();
  await expect(page.getByRole("button", { name: "48h" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "°F · in" }).click();
  await expect(page.getByText("0.2 in").first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "°F · in" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: /Basel/ })).toBeVisible();
});

test("GPS requires a user click and loads a forecast", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 47.5584, longitude: 7.5733 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find your forecast" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByRole("heading", { name: /Basel/ })).toBeVisible();
});

test("a failed first forecast can be retried", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const availableFetch = window.fetch;
    let failOnce = true;
    window.fetch = (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.startsWith("/api/forecast?") && failOnce) {
        failOnce = false;
        return new Promise((resolve) =>
          window.setTimeout(
            () =>
              resolve(
                new Response(
                  JSON.stringify({
                    error: { message: "Weather service is busy." },
                  }),
                  {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                  },
                ),
              ),
            450,
          ),
        );
      }
      return availableFetch(input, init);
    };
  });
  await page
    .getByRole("combobox", { name: "Search for a location" })
    .fill("Basel");
  await page.getByRole("option", { name: /Basel/ }).click();
  await expect(
    page.getByRole("status", { name: "Loading forecast" }),
  ).toBeVisible();
  await expect(page.locator(".error-banner.standalone-error")).toContainText(
    "Weather service is busy.",
  );
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: /Basel/ })).toBeVisible();
});

test("manifest, service worker, offline saved forecast, and accessibility", async ({
  page,
}) => {
  await page.goto("/");
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).display).toBe("standalone");
  await page
    .getByRole("combobox", { name: "Search for a location" })
    .fill("Basel");
  await page.getByRole("option", { name: /Basel/ }).click();
  await expect(page.getByRole("heading", { name: /Basel/ })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText(/Saved forecast from/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Basel/ })).toBeVisible();
});

test("mobile forecast stays within the viewport and keeps sections reachable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Search for a location" })
    .fill("Basel");
  await page.getByRole("option", { name: /Basel/ }).click();
  await expect(page.getByRole("heading", { name: /Basel/ })).toBeVisible();

  const dock = page.getByRole("navigation", { name: "Forecast sections" });
  await expect(dock).toBeVisible();
  await dock.getByRole("link", { name: "7 Days" }).click();
  await expect(page).toHaveURL(/#outlook$/);

  const hours = page.getByRole("region", { name: /Hourly weather forecast/ });
  expect(
    await hours.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".forecast-day")).toHaveCount(7);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  for (const target of [
    dock.getByRole("link", { name: "Now" }),
    dock.getByRole("link", { name: "Hourly" }),
    page.getByRole("button", { name: "Install Rainline" }),
    page.getByRole("button", { name: "°C · mm" }),
  ]) {
    const bounds = await target.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
});
