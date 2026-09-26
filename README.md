# Rainline

Rainline is a precipitation-focused weather PWA built with Next.js App Router. It shows hourly precipitation amount and probability, a seven-day outlook, and meteoblue forecast predictability.

The integration follows the [meteoblue Forecast API schema](https://my.meteoblue.com/packages/redoc) and [Location Search API documentation](https://docs.meteoblue.com/en/weather-apis/further-apis/location-search-api).

## Run locally

1. Use Node 20.9 or newer, then run `npm install`.
2. Copy `.env.example` to `.env.local` and set `METEOBLUE_API_KEY` to a key with Basic Forecast and Location Search access. Set `METEOBLUE_API_SHARED_SECRET` only if your account requires signed URLs.
3. Run `npm run dev` and open http://localhost:3000.

The browser never receives the meteoblue key. There is no live demo fallback: without a valid key, API calls return a clear configuration or authorization error.

## Deployment

Deploy as a Next.js Node application, for example on Vercel. Configure the same server-side environment variables in the hosting provider. HTTPS is required for geolocation and installation outside localhost. The `basic-1h,basic-day` packages are requested together, with a seven-day horizon. The app caches forecasts for 15 minutes in the server process and sends CDN cache headers for the same period. Location search is cached for one hour.

Set an edge or platform rate limit for `/api/forecast` and `/api/locations` based on your meteoblue credit allowance. Restrict the meteoblue key to your deployment's outbound IPs where the hosting platform provides stable egress IPs. If egress IPs are dynamic, use meteoblue's signing requirement with `METEOBLUE_API_SHARED_SECRET`. Monitor credits in the meteoblue account dashboard. Forecast errors are logged as structured event/code/status records without credentials or precise coordinates.

The PWA precaches its app shell and static assets. Only the latest normalized forecast and its location are saved in browser IndexedDB for offline viewing. A saved forecast is marked stale, with the fetch time visible. API responses and raw meteoblue URLs are not stored in the service-worker cache. Install from the browser's menu on supported devices; on iOS Safari use Share → Add to Home Screen.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. After a build, run `npm run test:e2e`; Playwright may require `npx playwright install chromium` on a new machine. End-to-end tests mock the weather endpoints and include an accessibility scan.

## Forecast semantics

The hourly amount is the forecast precipitation in that hour. The hourly probability is the chance of measurable precipitation. Daily predictability reflects agreement among weather models across multiple weather conditions and is distinct from rain probability. Units are converted for display; the meteoblue response remains metric.
