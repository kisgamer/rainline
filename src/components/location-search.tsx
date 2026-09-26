"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import type { Place } from "@/lib/types";

interface Props {
  onSelect: (place: Place) => void;
  disabled?: boolean;
}

export function LocationSearch({ onSelect, disabled = false }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const requestRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.trim().length < 3) return;
    const controller = new AbortController();
    const requestId = ++requestRef.current;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/locations?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.message || "Search is unavailable.");
        if (requestId === requestRef.current) {
          setResults(body.locations);
          setOpen(true);
          setActive(-1);
          setError("");
          setSearching(false);
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : "Search is unavailable.",
        );
        setResults([]);
        setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  function choose(place: Place) {
    onSelect(place);
    setQuery("");
    setResults([]);
    setOpen(false);
    setError("");
    setSearching(false);
    inputRef.current?.blur();
  }

  function useGps() {
    if (!navigator.geolocation) {
      setError("Location is not supported in this browser.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const timezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        let label: Place = {
          name: "Current location",
          administrativeArea: null,
          country: "",
          latitude,
          longitude,
          elevation: null,
          timezone,
        };
        try {
          const response = await fetch(
            `/api/locations?q=${encodeURIComponent(`${latitude.toFixed(4)} ${longitude.toFixed(4)}`)}`,
          );
          if (response.ok) {
            const body = await response.json();
            const nearby = body.locations?.[0] as Place | undefined;
            if (nearby)
              label = {
                ...label,
                name: nearby.name,
                administrativeArea: nearby.administrativeArea,
                country: nearby.country,
                timezone: nearby.timezone,
              };
          }
        } catch {
          /* Coordinates still support a forecast. */
        }
        setLocating(false);
        choose(label);
      },
      (geolocationError) => {
        setLocating(false);
        setError(
          geolocationError.code === 1
            ? "Location permission was denied. Search for a place instead."
            : "Could not determine your location. Search for a place instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className="location-control">
      <div className="search-box">
        <Search size={19} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          name="location"
          role="combobox"
          aria-label="Search for a location"
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
          aria-controls="location-results"
          aria-activedescendant={
            active >= 0 ? `location-option-${active}` : undefined
          }
          autoComplete="off"
          placeholder="City or place, e.g. Basel…"
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(event.target.value.trim().length >= 3);
            setResults([]);
            setError("");
            setSearching(event.target.value.trim().length >= 3);
          }}
          onFocus={() => {
            if (results.length) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
            if (event.key === "ArrowDown" && results.length) {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, results.length - 1));
            }
            if (event.key === "ArrowUp" && results.length) {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter" && open && results.length) {
              event.preventDefault();
              choose(results[active >= 0 ? active : 0]);
            }
          }}
        />
        {query && (
          <button
            className="icon-button clear-search"
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
              setSearching(false);
              inputRef.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        )}
        {open && query.length >= 3 && (
          <div
            className="search-results"
            id="location-results"
            role="listbox"
            aria-label="Matching locations"
          >
            {results.map((place, index) => (
              <button
                key={`${place.latitude}-${place.longitude}-${index}`}
                type="button"
                id={`location-option-${index}`}
                role="option"
                aria-selected={active === index}
                className={
                  active === index ? "search-result active" : "search-result"
                }
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(place)}
              >
                <MapPin size={16} aria-hidden="true" />
                <span>
                  <strong>{place.name}</strong>
                  <small>
                    {[place.administrativeArea, place.country]
                      .filter(Boolean)
                      .join(", ")}
                  </small>
                </span>
              </button>
            ))}
            {!results.length && !error && (
              <div className="search-empty" role="status" aria-live="polite">
                {searching
                  ? "Searching…"
                  : "No matching places. Try a nearby city."}
              </div>
            )}
          </div>
        )}
      </div>
      <button
        className="gps-button"
        type="button"
        onClick={useGps}
        disabled={disabled || locating}
        aria-label="Use my location"
      >
        <LocateFixed size={18} aria-hidden="true" />{" "}
        <span>{locating ? "Locating…" : "Use my location"}</span>
      </button>
      {error && (
        <p className="search-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
