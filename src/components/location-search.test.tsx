import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationSearch } from "./location-search";

const place = {
  name: "Basel",
  administrativeArea: "Basel-Stadt",
  country: "Switzerland",
  latitude: 47.55,
  longitude: 7.57,
  elevation: 279,
  timezone: "Europe/Zurich",
};

describe("LocationSearch", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ locations: [place] }),
      })),
    ),
  );
  afterEach(() => vi.unstubAllGlobals());

  it.each(["meteoblue", "open-meteo"] as const)(
    "debounces %s search and supports keyboard selection",
    async (provider) => {
      const onSelect = vi.fn();
      render(<LocationSearch onSelect={onSelect} provider={provider} />);
      const input = screen.getByRole("combobox");
      fireEvent.change(input, { target: { value: "Basel" } });
      await waitFor(() =>
        expect(
          screen.getByRole("option", { name: /Basel/ }),
        ).toBeInTheDocument(),
      );
      fireEvent.keyDown(input, { key: "ArrowDown" });
      expect(input).toHaveAttribute(
        "aria-activedescendant",
        "location-option-0",
      );
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledWith(place);
      expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
        `provider=${provider}`,
      );
    },
  );

  it("uses GPS coordinates directly with Open-Meteo without calling reverse geocoding", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (
          ok: (value: {
            coords: { latitude: number; longitude: number };
          }) => void,
        ) => ok({ coords: { latitude: 47.55, longitude: 7.57 } }),
      },
    });
    const onSelect = vi.fn();
    render(<LocationSearch onSelect={onSelect} provider="open-meteo" />);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Current location",
          latitude: 47.55,
          longitude: 7.57,
        }),
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a useful error when GPS permission is denied", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (
          _ok: unknown,
          fail: (error: { code: number }) => void,
        ) => fail({ code: 1 }),
      },
    });
    render(<LocationSearch onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "permission was denied",
    );
  });
});
