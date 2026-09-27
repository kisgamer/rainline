# Rainline

Rainline is a precipitation-focused weather PWA built with Next.js App Router. It shows hourly precipitation amount and probability, a seven-day outlook, and meteoblue forecast predictability.

The integration follows the [meteoblue Forecast API schema](https://my.meteoblue.com/packages/redoc) and [Location Search API documentation](https://docs.meteoblue.com/en/weather-apis/further-apis/location-search-api).

## Run locally

1. Use Node 20.9 or newer, then run `npm install`.
2. Copy `.env.example` to `.env.local` and set `METEOBLUE_API_KEY` to a key with Basic Forecast and Location Search access. Set `METEOBLUE_API_SHARED_SECRET` only if your account requires signed URLs.
3. Run `npm run dev` and open http://localhost:3000.

The browser never receives API keys. Use the **Weather source** selector to switch between meteoblue (the default) and Open-Meteo. The choice is remembered on this device, and switching refreshes the selected location. Both forecast and location search use the selected provider. Open-Meteo works without a meteoblue key; meteoblue requires its configured credentials.

The **Forecast tone** setting controls the daily summaries: Straight, Playful (the default), or Snarky. The wording varies by date and precipitation outlook, while temperatures and precipitation totals stay data-driven. This preference is stored locally and does not trigger another API request.

Open-Meteo's public API is for non-commercial use. For a commercial deployment, configure `OPEN_METEO_API_KEY` with an appropriate Open-Meteo subscription; the server then uses its customer forecast and geocoding endpoints. See [Open-Meteo forecast documentation](https://open-meteo.com/en/docs) and [geocoding documentation](https://open-meteo.com/en/docs/geocoding-api). GPS works with either provider; Open-Meteo GPS forecasts use “Current location” because its geocoder does not reverse-geocode coordinates.

Both same-origin endpoints accept `provider=meteoblue` or `provider=open-meteo`; omission defaults to meteoblue and unknown values return 400. Their normalized forecast includes a `source` field. Cache entries are isolated by provider. Only the latest successful forecast is stored offline; a snapshot from another provider is never presented as the selected source.

## Deployment

Deploy as a Next.js Node application, for example on Vercel. Configure the same server-side environment variables in the hosting provider. HTTPS is required for geolocation and installation outside localhost. The `basic-1h,basic-day` packages are requested together, with a seven-day horizon. The app caches forecasts for 15 minutes in the server process and sends CDN cache headers for the same period. Location search is cached for one hour.

Set an edge or platform rate limit for `/api/forecast` and `/api/locations` based on your meteoblue credit allowance. Restrict the meteoblue key to your deployment's outbound IPs where the hosting platform provides stable egress IPs. If egress IPs are dynamic, use meteoblue's signing requirement with `METEOBLUE_API_SHARED_SECRET`. Monitor credits in the meteoblue account dashboard. Forecast errors are logged as structured event/code/status records without credentials or precise coordinates.

The PWA precaches its app shell and static assets. Only the latest normalized forecast and its location are saved in browser IndexedDB for offline viewing. A saved forecast is marked stale, with the fetch time visible. API responses and raw meteoblue URLs are not stored in the service-worker cache. Install from the browser's menu on supported devices; on iOS Safari use Share → Add to Home Screen.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. After a build, run `npm run test:e2e`; Playwright may require `npx playwright install chromium` on a new machine. End-to-end tests mock the weather endpoints and include an accessibility scan.

## Forecast semantics

The hourly amount is the forecast precipitation for the provider's hourly interval (Open-Meteo reports the preceding hour). The hourly probability is the chance of measurable precipitation. Daily predictability reflects agreement among weather models across multiple weather conditions and is distinct from rain probability. Open-Meteo does not supply an equivalent predictability score in this integration: its predictability and model timestamps remain null and the interface explicitly shows predictability as unavailable. Open-Meteo WMO condition codes are interpreted separately from meteoblue pictocodes. Units are converted for display; both source responses remain metric.
