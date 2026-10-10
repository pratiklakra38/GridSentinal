import type { ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Activity, Info } from "lucide-react";
import type { Event, Point, Run } from "./types";

export const number = (value: number | null | undefined, digits = 1) =>
  value == null
    ? "N/A"
    : value.toLocaleString("en-IN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
export const time = (seconds: number) =>
  `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({
  title = "No experiment selected",
  description = "Create a synthetic run in Scenario Lab to inspect network state.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <Activity size={30} />
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="note">
      <Info size={15} />
      <span>{children}</span>
    </div>
  );
}
export function PowerChart({ data }: { data: Point[] }) {
  return (
    <div className="chart" data-testid="power-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ left: 0, right: 20, top: 12, bottom: 5 }}
        >
          <CartesianGrid stroke="#e9edef" vertical={false} />
          <XAxis
            dataKey="time_s"
            tickFormatter={(s) => `${Math.round(Number(s) / 60)}m`}
            minTickGap={40}
            tick={{ fontSize: 11, fill: "#68727D" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#68727D" }}
            axisLine={false}
            tickLine={false}
            width={55}
            label={{
              value: "kW",
              position: "insideTopLeft",
              offset: 5,
              fill: "#68727D",
              fontSize: 11,
            }}
          />
          <Tooltip
            labelFormatter={(s) => `Virtual time ${time(Number(s))}`}
            formatter={(v) => number(Number(v)) + " kW"}
            contentStyle={{
              fontSize: 12,
              border: "1px solid #dce1e5",
              borderRadius: 3,
            }}
          />
          <Line
            type="linear"
            dataKey="baseline_power_kw"
            name="Baseline"
            stroke="#a8b0b8"
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="actual_power_kw"
            name="Actual demand"
            stroke="#275d78"
            strokeWidth={2.2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="reported_power_kw"
            name="Reported demand"
            stroke="#b47d2b"
            strokeWidth={1.7}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Legend() {
  return (
    <div className="chart-legend">
      <span>
        <i style={{ background: "#275d78" }} />
        Actual
      </span>
      <span>
        <i style={{ background: "#b47d2b" }} />
        Reported
      </span>
      <span>
        <i style={{ background: "#a8b0b8" }} />
        Baseline
      </span>
    </div>
  );
}
export function ImpactChart({
  data,
  metric,
}: {
  data: Point[];
  metric: "max_loading_pct" | "delta_power_kw" | "min_voltage_pu";
}) {
  const unit =
    metric === "max_loading_pct"
      ? "%"
      : metric === "delta_power_kw"
        ? "kW"
        : "p.u.";
  return (
    <div className="chart compact">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ right: 20, left: 0, top: 10 }}>
          <CartesianGrid stroke="#e9edef" vertical={false} />
          <XAxis
            dataKey="time_s"
            tickFormatter={(v) => `${Number(v) / 60}m`}
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={
              metric === "min_voltage_pu" ? ["auto", "auto"] : [0, "auto"]
            }
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v) =>
              `${number(Number(v), metric === "min_voltage_pu" ? 3 : 1)} ${unit}`
            }
          />
          {metric === "max_loading_pct" && (
            <ReferenceLine y={100} stroke="#b64545" strokeDasharray="4 4" />
          )}
          <Line
            type="linear"
            dataKey={metric}
            stroke="#275d78"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function EventTable({
  events,
  small = false,
}: {
  events: Event[];
  small?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Virtual time</th>
            <th>Station</th>
            <th>Message</th>
            {!small && <th>Payload</th>}
            <th>Validation</th>
          </tr>
        </thead>
        <tbody>
          {events.slice(0, small ? 6 : 250).map((e) => (
            <tr key={e.id}>
              <td className="mono">{time(e.timestamp_s)}</td>
              <td className="mono">{e.station_id}</td>
              <td>{e.type}</td>
              {!small && (
                <td className="payload" title={JSON.stringify(e.payload)}>
                  {JSON.stringify(e.payload)}
                </td>
              )}
              <td>
                <Badge
                  tone={e.validation === "anomaly" ? "warning" : "neutral"}
                >
                  {e.validation}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!events.length && (
        <div className="table-empty">No events match these filters.</div>
      )}
    </div>
  );
}
export function ComparisonTable({ left, right }: { left: Run; right: Run }) {
  const values: [string, number | null, number | null, string][] = [
    [
      "Peak |ΔP|",
      left.metrics.peak_deviation_kw,
      right.metrics.peak_deviation_kw,
      "kW",
    ],
    [
      "Peak feeder loading",
      left.metrics.peak_loading_pct,
      right.metrics.peak_loading_pct,
      "%",
    ],
    [
      "Minimum voltage",
      left.metrics.min_voltage_pu,
      right.metrics.min_voltage_pu,
      "p.u.",
    ],
    [
      "Mean detection delay",
      left.metrics.detection_delay_s,
      right.metrics.detection_delay_s,
      "s",
    ],
    [
      "Contained stations",
      left.metrics.contained_stations,
      right.metrics.contained_stations,
      "",
    ],
    ["Recall", left.metrics.recall, right.metrics.recall, ""],
  ];
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Computed measure</th>
              <th>Reference A</th>
              <th>Reference B</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {values.map(([label, a, b, unit]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="mono">
                  {number(a, unit === "p.u." || unit === "" ? 3 : 1)} {unit}
                </td>
                <td className="mono">
                  {number(b, unit === "p.u." || unit === "" ? 3 : 1)} {unit}
                </td>
                <td className="mono">
                  {a == null || b == null
                    ? "N/A"
                    : `${b - a > 0 ? "+" : ""}${number(b - a, 2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-foot">
        Seeds {left.config.seed} / {right.config.seed} · {left.config.scenario}{" "}
        / {right.config.scenario} · synthetic outputs [S]
      </div>
    </>
  );
}
