"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
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
  const currentWeather = condition(
    currentHour?.conditionCode ?? null,
    currentHour?.snowFraction ?? null,
  );
  const CurrentWeatherIcon = currentWeather.icon;
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

        {!forecast && (
          <div className="masthead">
            <div>
              <p className="eyebrow">
                <span className="eyebrow-line" /> WEATHER, MADE CLEAR
              </p>
              <h1>
                Weather for <br />
                <em>your day.</em>
              </h1>
              <p className="masthead-copy">
                Current conditions, rain timing, and the next 7 days—together in
                one clear forecast.
              </p>
            </div>
            <div className="masthead-orb" aria-hidden="true">
              <div className="orb-ring one" />
              <div className="orb-ring two" />
              <div className="orb-core">
                <CloudSun size={59} strokeWidth={1.15} />
              </div>
            </div>
          </div>
        )}

        <section
          className={
            forecast
              ? "search-section search-section-compact"
              : "search-section"
          }
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
              <CloudSun size={42} aria-hidden="true" />
            </div>
            <p className="eyebrow">START WITH A LOCATION</p>
            <h2>Find your forecast</h2>
            <p>
              Search for a city or use your location to see current weather,
              hourly rain, and the 7-day outlook.
            </p>
          </section>
        ) : (
          <>
            <div className="forecast-toolbar" id="now">
              <div>
                <p className="eyebrow">CURRENT WEATHER</p>
                <h1>
                  {forecast.location.name}
                  <span>
                    {forecast.location.country &&
                      `, ${forecast.location.country}`}
                  </span>
                </h1>
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
            <section
              className="current-weather"
              aria-labelledby="current-weather-title"
            >
              <h2 id="current-weather-title" className="visually-hidden">
                Current Conditions
              </h2>
              <div className="current-weather-main">
                <div className="current-conditions">
                  <p className="current-kicker">RIGHT NOW</p>
                  <div className="current-reading">
                    <div className="current-weather-icon" aria-hidden="true">
                      <CurrentWeatherIcon size={86} strokeWidth={1.25} />
                    </div>
                    <div>
                      <strong className="current-temperature">
                        {formatTemperature(
                          currentHour?.temperatureC ?? null,
                          units,
                        )}
                      </strong>
                      <p className="current-condition-label">
                        {currentWeather.label}
                      </p>
                    </div>
                  </div>
                  <p className="current-high-low">
                    High{" "}
                    {formatTemperature(today?.temperatureMaxC ?? null, units)}
                    <span aria-hidden="true"> · </span>
                    Low{" "}
                    {formatTemperature(today?.temperatureMinC ?? null, units)}
                  </p>
                </div>
                <div className="next-rain-block">
                  <span className="rain-outlook-label">
                    <CloudRain size={18} aria-hidden="true" /> RAIN OUTLOOK
                  </span>
                  <p>Next precipitation</p>
                  <h3>{nextRainText}</h3>
                  <span>
                    {nextRain
                      ? `${formatPrecipitation(nextRain.precipitationMm, units)} that hour · ${formatPercent(nextRain.precipitationProbability)} chance`
                      : "No measurable rain in this forecast window"}
                  </span>
                </div>
              </div>
              <div className="weather-facts">
                <div className="weather-fact">
                  <Droplets size={22} aria-hidden="true" />
                  <span>Today’s rain</span>
                  <strong>{summary.amount}</strong>
                </div>
                <div className="weather-fact">
                  <CloudRain size={22} aria-hidden="true" />
                  <span>Rain chance</span>
                  <strong>{summary.probability}</strong>
                </div>
                <div className="weather-fact">
                  <ShieldCheck size={22} aria-hidden="true" />
                  <span>Predictability</span>
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
                </div>
              </div>
            </section>
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
                  <h2 id="days-title">7-Day Forecast</h2>
                  <p className="subtle">
                    Rain at a glance, with forecast confidence alongside
                  </p>
                </div>
              </div>
              <div className="forecast-days">
                {forecast.daily.map((day, index) => {
                  const weather = condition(day.conditionCode);
                  const Icon = weather.icon;
                  return (
                    <article key={day.date} className="day-card forecast-day">
                      <div className="forecast-day-name">
                        <strong>
                          {index === 0 ? "Today" : dayLabel(day.date)}
                        </strong>
                        <small>
                          {new Intl.DateTimeFormat("en", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          }).format(new Date(`${day.date}T12:00:00Z`))}
                        </small>
                      </div>
                      <div className="forecast-day-condition">
                        <Icon size={28} strokeWidth={1.7} aria-hidden="true" />
                        <span>{weather.label}</span>
                      </div>
                      <div className="forecast-day-rain">
                        <Droplets size={17} aria-hidden="true" />
                        <strong>
                          {formatPrecipitation(day.precipitationMm, units)}
                        </strong>
                        <small>
                          {formatPercent(day.precipitationProbability)} chance
                        </small>
                      </div>
                      <div className="forecast-day-temp">
                        <strong
                          aria-label={`High ${formatTemperature(day.temperatureMaxC, units)}`}
                        >
                          {formatTemperature(day.temperatureMaxC, units)}
                        </strong>
                        <span
                          aria-hidden="true"
                          className="temperature-track"
                        />
                        <small
                          aria-label={`Low ${formatTemperature(day.temperatureMinC, units)}`}
                        >
                          {formatTemperature(day.temperatureMinC, units)}
                        </small>
                      </div>
                      <div className="forecast-day-confidence">
                        <span>Predictability</span>
                        <strong>{formatPercent(day.predictability)}</strong>
                        <small>
                          {predictabilityLabel(
                            day.predictability,
                            day.predictabilityClass,
                          )}{" "}
                          confidence
                        </small>
                        <span className="confidence-track" aria-hidden="true">
                          <span
                            style={{ width: `${day.predictability ?? 0}%` }}
                          />
                        </span>
                      </div>
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
