"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Info,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Umbrella,
  WifiOff,
} from "lucide-react";
import { LocationSearch } from "@/components/location-search";
import { InstallApp } from "@/components/install-app";
import { PrecipitationChart } from "@/components/precipitation-chart";
import { loadLastForecast, saveLastForecast } from "@/lib/offline";
import type { DailyForecast, Forecast, Place, UnitSystem } from "@/lib/types";
import {
  formatPercent,
  formatPrecipitation,
  formatTemperature,
} from "@/lib/units";

function displayDate(
  date: string,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    ...options,
  }).format(new Date(date));
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function condition(code: number | null, snow: number | null = null) {
  if (snow !== null && snow >= 0.5) return { label: "Snow", icon: CloudSnow };
  if (
    code !== null &&
    [8, 9, 10, 21, 22, 23, 24, 25, 27, 28, 29, 30].includes(code)
  )
    return { label: "Showers", icon: CloudRain };
  if (
    code !== null &&
    [6, 7, 11, 12, 14, 16, 23, 25, 31, 33, 35].includes(code)
  )
    return { label: "Rain", icon: CloudRain };
  return { label: "Variable", icon: CloudSun };
}

function predictabilityLabel(value: number | null, category: number | null) {
  const labels = ["Very low", "Low", "Medium", "High", "Very high"];
  if (category !== null && category >= 1 && category <= 5)
    return labels[category - 1];
  if (value === null) return "Unavailable";
  return labels[Math.min(4, Math.floor(value / 20))];
}

function dailyStats(day: DailyForecast | undefined, units: UnitSystem) {
  return {
    amount: formatPrecipitation(day?.precipitationMm ?? null, units),
    probability: formatPercent(day?.precipitationProbability ?? null),
  };
}

function LoadingDashboard() {
  return (
    <div className="loading-grid" aria-label="Loading forecast" role="status">
      <div className="skeleton skeleton-hero" />
      <div className="skeleton skeleton-side" />
      <div className="skeleton skeleton-chart" />
    </div>
  );
}

export default function Home() {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [units, setUnits] = useState<UnitSystem>("metric");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [recent, setRecent] = useState<Place | null>(null);
  const [attemptedPlace, setAttemptedPlace] = useState<Place | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);

  const showSavedForecast = useCallback(async () => {
    try {
      const saved = await loadLastForecast();
      if (saved) setForecast({ ...saved, freshness: "stale" });
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
  }, []);

  const loadForecast = useCallback(
    async (place: Place) => {
      const currentRequest = ++requestId.current;
      setAttemptedPlace(place);
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          lat: String(place.latitude),
          lon: String(place.longitude),
          timezone: place.timezone,
          name: place.name,
          country: place.country,
        });
        if (place.elevation !== null)
          params.set("asl", String(place.elevation));
        if (place.administrativeArea)
          params.set("area", place.administrativeArea);
        const response = await fetch(`/api/forecast?${params.toString()}`);
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error?.message || "Could not load the forecast.",
          );
        const next = body as Forecast;
        if (currentRequest !== requestId.current) return;
        setForecast(next);
        setRecent(place);
        try {
          localStorage.setItem("rainline-recent-place", JSON.stringify(place));
        } catch {
          /* Preference storage is optional. */
        }
        try {
          await saveLastForecast(next);
        } catch {
          /* Forecast remains available this session. */
        }
      } catch (reason) {
        if (currentRequest !== requestId.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load the forecast.",
        );
        await showSavedForecast();
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    },
    [showSavedForecast],
  );

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const initialize = window.setTimeout(update, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const hydrate = window.setTimeout(async () => {
      let savedPlace: Place | null = null;
      try {
        const savedUnits = localStorage.getItem("rainline-units");
        if (savedUnits === "metric" || savedUnits === "imperial")
          setUnits(savedUnits);
        const raw = localStorage.getItem("rainline-recent-place");
        if (raw) {
          const place = JSON.parse(raw) as Place;
          if (
            typeof place.latitude === "number" &&
            typeof place.longitude === "number"
          ) {
            savedPlace = place;
            setRecent(place);
          }
        }
      } catch {
        /* Storage is optional. */
      }
      await showSavedForecast();
      setReady(true);
      if (savedPlace && navigator.onLine) void loadForecast(savedPlace);
    }, 0);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => undefined);
    }
    return () => {
      window.clearTimeout(initialize);
      window.clearTimeout(hydrate);
      window.clearInterval(clock);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [showSavedForecast, loadForecast]);

  function changeUnits(next: UnitSystem) {
    setUnits(next);
    try {
      localStorage.setItem("rainline-units", next);
    } catch {
      /* Preference remains for this session. */
    }
  }

  const today = forecast?.daily[0];
  const summary = dailyStats(today, units);
  const nextRain = useMemo(
    () =>
      forecast?.hourly.find(
        (point) =>
          new Date(point.timestamp).valueOf() >= now - 3_600_000 &&
          (point.precipitationMm ?? 0) >= 0.2,
      ) ?? null,
    [forecast, now],
  );
  const currentHour = useMemo(
    () =>
      forecast?.hourly.find(
        (point) => new Date(point.timestamp).valueOf() >= now - 3_600_000,
      ) ?? forecast?.hourly[0],
    [forecast, now],
  );
  const nextRainText =
    nextRain && forecast
      ? displayDate(nextRain.timestamp, forecast.location.timezone, {
          weekday: "short",
          hour: "numeric",
        })
      : "No rain expected";
  const updatedText = forecast
    ? displayDate(forecast.fetchedAt, forecast.location.timezone, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const isStale = offline || forecast?.freshness === "stale";

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to forecast
      </a>
      <main
        className={forecast ? "app-shell forecast-loaded" : "app-shell"}
        id="main-content"
        tabIndex={-1}
      >
        <header className="topbar">
          <div className="brand" translate="no">
            <span className="brand-symbol">
              <Droplets size={23} strokeWidth={2.3} />
            </span>
            <span>RAINLINE</span>
          </div>
          <div className="top-actions">
            <span className="data-source">
              POWERED BY <strong>meteoblue</strong>
            </span>
            <InstallApp />
            <div className="unit-toggle" role="group" aria-label="Units">
              <button
                type="button"
                aria-pressed={units === "metric"}
                onClick={() => changeUnits("metric")}
              >
                °C · mm
              </button>
              <button
                type="button"
                aria-pressed={units === "imperial"}
                onClick={() => changeUnits("imperial")}
              >
                °F · in
              </button>
            </div>
          </div>
        </header>

        <div className={forecast ? "masthead has-forecast" : "masthead"}>
          <div>
            <p className="eyebrow">
              <span className="eyebrow-line" /> PRECIPITATION, IN FOCUS
            </p>
            <h1>
              Know when the rain <br />
              <em>is coming.</em>
            </h1>
            <p className="masthead-copy">
              An honest view of what the sky has planned, and how certain the
              forecast is.
            </p>
          </div>
          <div className="masthead-orb" aria-hidden="true">
            <div className="orb-ring one" />
            <div className="orb-ring two" />
            <div className="orb-core">
              <Droplets size={59} strokeWidth={1.15} />
            </div>
          </div>
        </div>

        <section
          className="search-section"
          aria-label="Choose a forecast location"
        >
          <div className="search-title">
            <MapPin size={16} aria-hidden="true" />
            <span>YOUR LOCATION</span>
          </div>
          <LocationSearch
            onSelect={(place) => void loadForecast(place)}
            disabled={loading}
          />
          {recent && (
            <button
              type="button"
              className="recent-place"
              onClick={() => void loadForecast(recent)}
            >
              <RefreshCw size={14} /> Recent: {recent.name}
              <ArrowRight size={14} />
            </button>
          )}
        </section>

        {!ready ? (
          <LoadingDashboard />
        ) : loading && !forecast ? (
          <LoadingDashboard />
        ) : !forecast ? (
          <section className="empty-state panel">
            <div className="empty-graphic">
              <Umbrella size={42} />
            </div>
            <p className="eyebrow">YOUR FORECAST STARTS HERE</p>
            <h2>Pick a place. See the whole picture.</h2>
            <p>
              Search for a city or use your location to see the next rain
              window, hourly amounts, and how predictable the forecast is.
            </p>
            <div className="empty-steps">
              <span>
                01 <strong>Choose a place</strong>
              </span>
              <span>
                02 <strong>Explore the rain</strong>
              </span>
              <span>
                03 <strong>Plan with confidence</strong>
              </span>
            </div>
          </section>
        ) : (
          <>
            <div className="forecast-toolbar" id="now">
              <div>
                <p className="eyebrow">FORECAST FOR</p>
                <h2>
                  {forecast.location.name}
                  <span>
                    {forecast.location.country &&
                      `, ${forecast.location.country}`}
                  </span>
                </h2>
              </div>
              <div className="forecast-meta">
                <span className={isStale ? "status-pill stale" : "status-pill"}>
                  {isStale ? (
                    <WifiOff size={13} />
                  ) : (
                    <span className="live-dot" />
                  )}
                  {isStale ? "OFFLINE FORECAST" : "LATEST FORECAST"}
                </span>
                <span>Updated {updatedText}</span>
                {!offline && (
                  <button
                    type="button"
                    aria-label="Refresh forecast"
                    onClick={() => void loadForecast(forecast.location)}
                    disabled={loading}
                  >
                    <RefreshCw size={16} className={loading ? "spin" : ""} />
                  </button>
                )}
              </div>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                <Info size={17} />
                <span>{error} Showing the last saved forecast.</span>
                <button
                  type="button"
                  onClick={() =>
                    void loadForecast(attemptedPlace ?? forecast.location)
                  }
                >
                  Retry
                </button>
              </div>
            )}
            {isStale && (
              <div className="stale-banner">
                <WifiOff size={16} />
                <span>
                  Saved forecast from {updatedText}. Conditions may have changed
                  since then.
                </span>
              </div>
            )}
            <div className="overview-grid">
              <section className="hero-card" aria-labelledby="next-rain-title">
                <div className="hero-card-top">
                  <span>
                    <CloudRain size={17} /> NEXT PRECIPITATION
                  </span>
                  <ArrowUpRight size={21} />
                </div>
                <div className="hero-main">
                  <div>
                    <p className="hero-caption">
                      The next expected rain window
                    </p>
                    <h2 id="next-rain-title">{nextRainText}</h2>
                    <p className="hero-sub">
                      {nextRain
                        ? `${formatPrecipitation(nextRain.precipitationMm, units)} expected that hour`
                        : "No measurable rain in this forecast window"}
                    </p>
                  </div>
                  <div className="hero-weather-icon">
                    <CloudRain size={75} strokeWidth={1.25} />
                  </div>
                </div>
                <div className="hero-card-bottom">
                  <span>
                    <span className="tiny-dot" />{" "}
                    {nextRain
                      ? `${formatPercent(nextRain.precipitationProbability)} chance`
                      : "No measurable rain forecast"}
                  </span>
                  <span>
                    Next 7 days <ArrowRight size={15} />
                  </span>
                </div>
              </section>
              <div className="stat-grid">
                <article className="stat-card">
                  <div className="stat-icon blue">
                    <Droplets size={21} />
                  </div>
                  <p>Today’s rain</p>
                  <strong>{summary.amount}</strong>
                  <small>Expected total</small>
                </article>
                <article className="stat-card">
                  <div className="stat-icon teal">
                    <CloudRain size={21} />
                  </div>
                  <p>Rain chance</p>
                  <strong>{summary.probability}</strong>
                  <small>Probability today</small>
                </article>
                <article className="stat-card">
                  <div className="stat-icon violet">
                    <ShieldCheck size={21} />
                  </div>
                  <p>Predictability</p>
                  <strong>
                    {formatPercent(today?.predictability ?? null)}
                  </strong>
                  <small>
                    {predictabilityLabel(
                      today?.predictability ?? null,
                      today?.predictabilityClass ?? null,
                    )}{" "}
                    confidence
                  </small>
                </article>
                <article className="stat-card">
                  <div className="stat-icon amber">
                    <CloudSun size={21} />
                  </div>
                  <p>Temperature</p>
                  <strong>
                    {formatTemperature(
                      currentHour?.temperatureC ?? null,
                      units,
                    )}
                  </strong>
                  <small>Current forecast hour</small>
                </article>
              </div>
            </div>
            <PrecipitationChart
              hourly={forecast.hourly}
              units={units}
              timezone={forecast.location.timezone}
              asOf={now}
            />
            <section
              className="days-section"
              id="outlook"
              aria-labelledby="days-title"
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">LOOKING AHEAD</p>
                  <h2 id="days-title">The next seven days</h2>
                  <p className="subtle">
                    Rain at a glance, with forecast confidence alongside
                  </p>
                </div>
                <span className="seven-day-mark">
                  7-DAY OUTLOOK <ArrowDown size={16} />
                </span>
              </div>
              <p className="days-swipe-hint" aria-hidden="true">
                Swipe to explore all 7 days <ArrowRight size={15} />
              </p>
              <div
                className="days-grid"
                role="region"
                aria-label="Seven-day forecast, scroll horizontally for more days"
                tabIndex={0}
              >
                {forecast.daily.map((day, index) => {
                  const weather = condition(day.conditionCode);
                  const Icon = weather.icon;
                  return (
                    <article key={day.date} className="day-card">
                      <div className="day-top">
                        <span>
                          {index === 0 ? "Today" : dayLabel(day.date)}
                        </span>
                        <small>
                          {new Intl.DateTimeFormat("en", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          }).format(new Date(`${day.date}T12:00:00Z`))}
                        </small>
                      </div>
                      <div className="day-condition">
                        <Icon size={25} strokeWidth={1.7} />
                        <span>{weather.label}</span>
                      </div>
                      <strong className="day-amount">
                        {formatPrecipitation(day.precipitationMm, units)}
                      </strong>
                      <span className="day-detail">
                        {formatPercent(day.precipitationProbability)} rain
                        chance
                      </span>
                      <div className="day-confidence">
                        <span>Predictability</span>
                        <strong>{formatPercent(day.predictability)}</strong>
                      </div>
                      <div className="confidence-track">
                        <span
                          style={{ width: `${day.predictability ?? 0}%` }}
                        />
                      </div>
                      <small className="day-confidence-class">
                        {predictabilityLabel(
                          day.predictability,
                          day.predictabilityClass,
                        )}{" "}
                        confidence
                      </small>
                      <small className="day-temp">
                        {formatTemperature(day.temperatureMinC, units)}{" "}
                        <span>→</span>{" "}
                        {formatTemperature(day.temperatureMaxC, units)}
                      </small>
                    </article>
                  );
                })}
              </div>
            </section>
            <aside className="insight-note">
              <Info size={19} />
              <p>
                <strong>What does predictability mean?</strong> It reflects
                agreement among forecast models across weather conditions. It is
                different from the chance of rain. A high rain chance can still
                appear with lower overall predictability.
              </p>
            </aside>
            <nav className="mobile-dock" aria-label="Forecast sections">
              <a href="#now">
                <CloudRain size={19} aria-hidden="true" />
                <span>Now</span>
              </a>
              <a href="#timeline">
                <ChartNoAxesCombined size={19} aria-hidden="true" />
                <span>Hourly</span>
              </a>
              <a href="#outlook">
                <CalendarDays size={19} aria-hidden="true" />
                <span>7 Days</span>
              </a>
            </nav>
          </>
        )}
        {error && !forecast && (
          <div className="error-banner standalone-error" role="alert">
            <Info size={17} />
            <span>{error}</span>
            {attemptedPlace && (
              <button
                type="button"
                onClick={() => void loadForecast(attemptedPlace)}
              >
                Retry
              </button>
            )}
          </div>
        )}
        <footer>
          <span>
            RAINLINE <i /> A CLEARER FORECAST
          </span>
          <span>
            Weather data by{" "}
            <a
              href="https://www.meteoblue.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              meteoblue
            </a>{" "}
            · Built for planning around precipitation
          </span>
        </footer>
      </main>
    </>
  );
}
