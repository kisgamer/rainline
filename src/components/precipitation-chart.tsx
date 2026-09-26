"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyForecast, UnitSystem } from "@/lib/types";
import { formatPercent, formatPrecipitation } from "@/lib/units";

interface Props {
  hourly: HourlyForecast[];
  units: UnitSystem;
  timezone: string;
  asOf: number;
}
type Range = 24 | 48 | 168;

export function PrecipitationChart({ hourly, units, timezone, asOf }: Props) {
  const [range, setRange] = useState<Range>(24);
  const data = useMemo(
    () =>
      hourly
        .filter(
          (point) => new Date(point.timestamp).valueOf() >= asOf - 3_600_000,
        )
        .slice(0, range)
        .map((point) => ({
          ...point,
          amount:
            point.precipitationMm === null
              ? null
              : units === "imperial"
                ? point.precipitationMm / 25.4
                : point.precipitationMm,
          label: new Intl.DateTimeFormat("en", {
            timeZone: timezone,
            hour: "numeric",
            ...(range === 168 ? { weekday: "short" as const } : {}),
          }).format(new Date(point.timestamp)),
        })),
    [hourly, range, timezone, units, asOf],
  );
  const unitLabel = units === "imperial" ? "in" : "mm";
  return (
    <section
      className="panel chart-panel"
      id="timeline"
      aria-labelledby="chart-title"
    >
      <div className="panel-heading chart-heading">
        <div>
          <p className="eyebrow">THE TIMELINE</p>
          <h2 id="chart-title">Precipitation forecast</h2>
          <p className="subtle">Expected amount and chance, hour by hour</p>
        </div>
        <div className="segmented" role="group" aria-label="Forecast range">
          {([24, 48, 168] as Range[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              className={range === value ? "selected" : ""}
              onClick={() => setRange(value)}
            >
              {value === 168 ? "7 days" : `${value}h`}
            </button>
          ))}
        </div>
      </div>
      <div className="legend">
        <span>
          <i className="legend-bar" /> Amount ({unitLabel})
        </span>
        <span>
          <i className="legend-line" /> Chance (%)
        </span>
      </div>
      <div
        className="chart-frame"
        role="img"
        aria-label={`Precipitation amount and probability over the next ${range === 168 ? "seven days" : `${range} hours`}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 0, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="#233b52"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "#8499ad", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={range === 168 ? 23 : range === 48 ? 7 : 3}
            />
            <YAxis
              yAxisId="amount"
              tick={{ fill: "#8499ad", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={38}
            />
            <YAxis
              yAxisId="chance"
              orientation="right"
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tick={{ fill: "#8499ad", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `${value}%`}
              width={38}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as (typeof data)[number];
                return (
                  <div className="chart-tooltip">
                    <strong>
                      {new Intl.DateTimeFormat("en", {
                        timeZone: timezone,
                        weekday: "short",
                        hour: "numeric",
                        month: "short",
                        day: "numeric",
                      }).format(new Date(point.timestamp))}
                    </strong>
                    <span>
                      Amount:{" "}
                      {formatPrecipitation(point.precipitationMm, units)}
                    </span>
                    <span>
                      Chance: {formatPercent(point.precipitationProbability)}
                    </span>
                  </div>
                );
              }}
            />
            <Bar
              yAxisId="amount"
              dataKey="amount"
              fill="#36aaff"
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
            <Line
              yAxisId="chance"
              dataKey="precipitationProbability"
              stroke="#65e4d4"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="data-details">
        <summary>View forecast as a table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Amount</th>
                <th>Chance</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.timestamp}>
                  <td>
                    {new Intl.DateTimeFormat("en", {
                      timeZone: timezone,
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                    }).format(new Date(point.timestamp))}
                  </td>
                  <td>{formatPrecipitation(point.precipitationMm, units)}</td>
                  <td>{formatPercent(point.precipitationProbability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
