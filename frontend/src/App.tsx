import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ChevronRight,
  CircleHelp,
  Download,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  Menu,
  Pause,
  Play,
  PlugZap,
  RotateCcw,
  Shield,
  ShieldCheck,
  SkipForward,
  Square,
  Unplug,
  X,
  Zap,
} from "lucide-react";
import { api, browserMode } from "./api";
import { exportPreview } from "./preview";
import { defaults } from "./defaults";
import {
  Badge,
  ComparisonTable,
  Empty,
  EventTable,
  ImpactChart,
  Legend,
  Note,
  Panel,
  PowerChart,
  number,
  time,
} from "./components";
import type {
  Comparison,
  Config,
  Defenses,
  Event,
  Point,
  Run,
  RunSummary,
  Scenario,
  Station,
} from "./types";

type ConsoleState = {
  run: Run | null;
  series: Point[];
  events: Event[];
  history: RunSummary[];
  scenarios: Scenario[];
  config: Config;
  setConfig: (c: Config) => void;
  busy: boolean;
  perform: (fn: () => Promise<void>) => Promise<void>;
  setRun: (r: Run) => void;
  comparison: Comparison | null;
  setComparison: (c: Comparison | null) => void;
  load: (id: string) => Promise<void>;
};
const Context = createContext<ConsoleState | null>(null);
function useConsole() {
  return useContext(Context)!;
}
const nav = [
  ["/", "Overview", LayoutDashboard],
  ["/stations", "Charging stations", PlugZap],
  ["/lab", "Scenario lab", FlaskConical],
  ["/grid", "Grid analysis", Gauge],
  ["/security", "Security monitoring", Shield],
  ["/defenses", "Defense center", ShieldCheck],
  ["/reports", "Experiment reports", ListChecks],
] as const;

export default function App() {
  const [run, setRunState] = useState<Run | null>(null),
    [series, setSeries] = useState<Point[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [history, setHistory] = useState<RunSummary[]>([]),
    [scenarios, setScenarios] = useState<Scenario[]>([]),
    [config, setConfig] = useState<Config>(defaults),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(false),
    [loading, setLoading] = useState(true),
    [comparison, setComparison] = useState<Comparison | null>(null),
    [menu, setMenu] = useState(false);
  const lock = useRef(false);
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const setRun = useCallback((r: Run) => {
    setRunState(r);
    localStorage.setItem("gridsentinel.run", r.id);
  }, []);
  const perform = useCallback(async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      setHistory(await api<RunSummary[]>("/simulations"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  const load = useCallback(
    async (id: string) => {
      const r = await api<Run>("/simulations/" + id);
      setRun(r);
      setConfig(r.config);
      setComparison(null);
    },
    [setRun],
  );
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await api("/health");
        const [s, h] = await Promise.all([
          api<Scenario[]>("/scenarios"),
          api<RunSummary[]>("/simulations"),
        ]);
        if (!active) return;
        setConnected(true);
        setScenarios(s);
        setHistory(h);
        const saved = localStorage.getItem("gridsentinel.run");
        const id = h.find((r) => r.id === saved)?.id ?? h[0]?.id;
        if (id) {
          const r = await api<Run>("/simulations/" + id);
          if (active) {
            setRun(r);
            setConfig(r.config);
          }
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [setRun]);
  useEffect(() => {
    if (!run) {
      setSeries([]);
      setEvents([]);
      return;
    }
    let active = true;
    Promise.all([
      api<Point[]>(`/simulations/${run.id}/timeseries`),
      api<Event[]>(`/simulations/${run.id}/events`),
    ])
      .then(([p, e]) => {
        if (active) {
          setSeries(p);
          setEvents(e);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [run]);
  useEffect(() => {
    if (run?.status !== "playing") return;
    const id = setInterval(() => {
      void perform(async () =>
        setRun(await api<Run>(`/simulations/${run.id}/step`, { steps: 3 })),
      );
    }, 800);
    return () => clearInterval(id);
  }, [run?.id, run?.status, perform, setRun]);
  const title = nav.find(([p]) => p === location.pathname)?.[1] ?? "Overview";
  return (
    <Context.Provider
      value={{
        run,
        series,
        events,
        history,
        scenarios,
        config,
        setConfig,
        busy,
        perform,
        setRun,
        comparison,
        setComparison,
        load,
      }}
    >
      <div className="app">
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <a className="brand" href="#/">
            <span>
              <Zap size={21} />
            </span>
            <div>
              GridSentinel<small>NETWORK SECURITY CONSOLE</small>
            </div>
          </a>
          <div className="site-label">
            <i />
            SYNTHETIC TEST ENVIRONMENT
          </div>
          <p className="nav-label">OPERATIONS</p>
          <nav>
            {nav.map(([p, label, Icon]) => (
              <NavLink
                key={p}
                to={p}
                end={p === "/"}
                onClick={() => setMenu(false)}
              >
                <Icon size={18} />
                {label}
                {p === "/security" &&
                  !!run?.alerts.filter((a) => a.status === "open").length && (
                    <span className="nav-count">
                      {run.alerts.filter((a) => a.status === "open").length}
                    </span>
                  )}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="boundary">
              <ShieldCheck size={17} />
              <div>
                Isolated by design
                <small>Virtual stations · local computation</small>
              </div>
            </div>
            <p>
              GridSentinel <span>v1.0</span>
            </p>
            <small>EV charging & grid impact simulator</small>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={19} />
            </button>
            <div className="breadcrumb">
              Operations <ChevronRight size={13} />
              <strong>{title}</strong>
            </div>
            <div className="topbar-right">
              <Badge tone={connected ? "healthy" : "critical"}>
                {connected
                  ? browserMode
                    ? "Browser simulation"
                    : "Backend connected"
                  : "Simulation unavailable"}
              </Badge>
              <span className="local-label">LOCAL / OFFLINE</span>
              <a
                href={
                  browserMode
                    ? "https://github.com/pratiklakra38/GridSentinal#demonstration"
                    : "http://127.0.0.1:8000/docs"
                }
                target="_blank"
                rel="noreferrer"
                className="icon-button"
                aria-label={browserMode ? "Demo guide" : "API documentation"}
              >
                <CircleHelp size={17} />
              </a>
            </div>
          </header>
          <main>
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  EV CHARGING NETWORK / ENGINEERING WORKSPACE
                </p>
                <h1>{title}</h1>
                <p>
                  {
                    (
                      {
                        "/": "Operational state of the virtual charging network.",
                        "/stations":
                          "Station telemetry, physical state and firmware integrity.",
                        "/lab":
                          "Configure a reproducible experiment and advance virtual time.",
                        "/grid":
                          "Physical demand, feeder headroom and approximate voltage.",
                        "/security":
                          "Device messages and independent measurement discrepancies.",
                        "/defenses":
                          "Controls across the firmware, telemetry and power boundaries.",
                        "/reports":
                          "Persistent experiment history and reproducible exports.",
                      } as Record<string, string>
                    )[location.pathname]
                  }
                </p>
              </div>
              <div className="heading-meta">
                {run ? (
                  <>
                    <span className="mono">
                      RUN {run.id.slice(0, 8).toUpperCase()}
                    </span>
                    <Badge
                      tone={run.status === "completed" ? "healthy" : "neutral"}
                    >
                      {run.status}
                    </Badge>
                  </>
                ) : (
                  <Badge>No active run</Badge>
                )}
              </div>
            </div>
            {error && (
              <div className="error" role="alert">
                <strong>Request failed.</strong> {error}
                <button onClick={() => setError("")} aria-label="Dismiss error">
                  <X size={15} />
                </button>
              </div>
            )}
            {loading ? (
              <div className="empty">
                Loading the local simulation workspace…
              </div>
            ) : (
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/stations" element={<Stations />} />
                <Route path="/lab" element={<Lab />} />
                <Route path="/grid" element={<Grid />} />
                <Route path="/security" element={<Security />} />
                <Route path="/defenses" element={<DefenseCenter />} />
                <Route path="/reports" element={<Reports />} />
              </Routes>
            )}
            <footer className="page-footer">
              <span>
                Synthetic simulation outputs [S] · No real infrastructure
                connected
              </span>
              <span>Discrete virtual clock · All power values in kW</span>
            </footer>
          </main>
        </div>
      </div>
    </Context.Provider>
  );
}

function RunControls() {
  const { run, perform, setRun, busy } = useConsole();
  if (!run) return null;
  const command = (action: string) =>
    void perform(async () =>
      setRun(await api<Run>(`/simulations/${run.id}/control`, { action })),
    );
  return (
    <div className="run-controls">
      <div className="clock">
        <span>VIRTUAL CLOCK</span>
        <strong className="mono">{time(run.frame.time_s)}</strong>
        <small>
          Step {run.cursor + 1} / {run.config.duration_steps} ·{" "}
          {run.config.step_seconds}s interval
        </small>
      </div>
      <div className="control-buttons">
        <button
          disabled={busy || run.status === "completed"}
          onClick={() => command(run.status === "playing" ? "pause" : "resume")}
        >
          {run.status === "playing" ? <Pause size={15} /> : <Play size={15} />}
          {run.status === "playing" ? "Pause" : "Resume"}
        </button>
        <button
          disabled={
            busy || run.status === "completed" || run.status === "playing"
          }
          onClick={() =>
            void perform(async () =>
              setRun(
                await api<Run>(`/simulations/${run.id}/step`, { steps: 1 }),
              ),
            )
          }
        >
          <SkipForward size={15} />
          Step
        </button>
        <button
          disabled={busy || run.status === "completed"}
          onClick={() => command("finish")}
        >
          <Square size={13} />
          Finish run
        </button>
        <button disabled={busy} onClick={() => command("reset")}>
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
      <div className="playback-track">
        <span
          style={{
            width: `${((run.cursor + 1) / run.config.duration_steps) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

function Overview() {
  const { run, series, events } = useConsole();
  const navigate = useNavigate();
  if (!run)
    return (
      <>
        <div className="intro">
          <div className="intro-icon">
            <Activity size={24} />
          </div>
          <h2>The network is ready for an experiment.</h2>
          <p>
            Set up a virtual EV fleet, choose a scenario and inspect the
            cyber-physical response.
          </p>
          <button className="primary" onClick={() => navigate("/lab")}>
            <FlaskConical size={16} />
            Open Scenario Lab
            <ArrowRight size={16} />
          </button>
        </div>
        <Note>
          Experiments run entirely on this computer. The research blueprint is
          implemented as a bounded synthetic model.
        </Note>
      </>
    );
  const f = run.frame;
  return (
    <>
      <RunControls />
      <div className="metric-strip">
        <div>
          <span>ACTUAL DEMAND</span>
          <strong>
            {number(f.actual_power_kw)}
            <small> kW</small>
          </strong>
          <p>
            <i className="dot accent" />
            Physical fleet state
          </p>
        </div>
        <div>
          <span>REPORTED DEMAND</span>
          <strong>
            {number(f.reported_power_kw)}
            <small> kW</small>
          </strong>
          <p>
            <i className="dot warning" />
            Device telemetry
          </p>
        </div>
        <div>
          <span>CHARGING STATIONS</span>
          <strong>
            {f.active_stations}
            <small> / {run.config.fleet_size}</small>
          </strong>
          <p>
            {number(run.config.connection_rate * 100, 0)}% connection assumption
          </p>
        </div>
        <div>
          <span>PEAK FEEDER LOADING</span>
          <strong className={f.max_loading_pct > 100 ? "text-critical" : ""}>
            {number(f.max_loading_pct)}
            <small> %</small>
          </strong>
          <p>
            {f.max_loading_pct > 100
              ? "Configured capacity exceeded"
              : "Within configured capacity"}
          </p>
        </div>
      </div>
      <div className="overview-grid">
        <Panel
          title="Fleet power demand"
          subtitle="Actual electrical load and device-reported telemetry"
          action={<Legend />}
        >
          <PowerChart data={series} />
          <div className="panel-foot">
            <span>Current deviation from baseline</span>
            <strong className="mono">
              {f.delta_power_kw > 0 ? "+" : ""}
              {number(f.delta_power_kw)} kW
            </strong>
            <span className="push">Seed {run.config.seed}</span>
          </div>
        </Panel>
        <Panel
          title="Distribution feeders"
          subtitle={`${f.feeders.length} virtual feeders · actual load`}
        >
          <div className="feeder-list">
            {f.feeders.map((x) => (
              <div className="feeder-item" key={x.id}>
                <div>
                  <strong className="mono">{x.id}</strong>
                  <Badge
                    tone={
                      x.loading_pct > 100
                        ? "critical"
                        : x.loading_pct > 90
                          ? "warning"
                          : "healthy"
                    }
                  >
                    {x.loading_pct > 100
                      ? "Over capacity"
                      : x.loading_pct > 90
                        ? "Near limit"
                        : "Normal"}
                  </Badge>
                </div>
                <div className="loading-bar">
                  <span
                    style={{
                      width: `${Math.min(x.loading_pct, 100)}%`,
                      background: x.loading_pct > 100 ? "#b64545" : "#275d78",
                    }}
                  />
                </div>
                <div>
                  <span>
                    {number(x.apparent_kva)} / {number(x.capacity_kva, 0)} kVA
                  </span>
                  <strong>{number(x.loading_pct)}%</strong>
                </div>
              </div>
            ))}
          </div>
          <button
            className="text-button panel-link"
            onClick={() => navigate("/grid")}
          >
            Open grid analysis
            <ArrowRight size={14} />
          </button>
        </Panel>
      </div>
      <div className="overview-grid lower">
        <Panel
          title="Recent message events"
          subtitle="OCPP-style simulated telemetry"
          action={
            <button
              className="text-button"
              onClick={() => navigate("/security")}
            >
              View log
              <ArrowRight size={14} />
            </button>
          }
        >
          <EventTable events={events} small />
        </Panel>
        <Panel
          title="Security state"
          subtitle="Explainable rule and cross-layer alerts"
        >
          <div className="alert-summary">
            <Shield size={24} />
            <div>
              <strong>
                {run.alerts.filter((a) => a.status === "open").length}
              </strong>
              <span>open alerts</span>
            </div>
            <Badge tone={run.alerts.length ? "warning" : "healthy"}>
              {run.alerts.length ? "Review required" : "No anomalies detected"}
            </Badge>
          </div>
          <div className="compact-alerts">
            {run.alerts
              .slice(-3)
              .reverse()
              .map((a) => (
                <div key={a.id}>
                  <span className="mono">
                    {a.detector} · {a.station_id ?? a.feeder_id}
                  </span>
                  <p>{a.explanation}</p>
                </div>
              ))}
            {!run.alerts.length && (
              <p className="muted">
                Detectors have not emitted alerts in the revealed time window.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Stations() {
  const { run, perform, setRun, busy } = useConsole();
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
      station: Station;
      events: Event[];
    } | null>(null),
    [detailError, setDetailError] = useState("");
  useEffect(() => {
    if (!run || !selected) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailError("");
    api<typeof detail>(`/stations/${selected}?run_id=${run.id}`)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e) => {
        if (active) setDetailError(String(e));
      });
    return () => {
      active = false;
    };
  }, [run, selected]);
  if (!run) return <Empty />;
  const stations = run.frame.stations.filter((s) =>
    `${s.id} ${s.feeder_id} ${s.status}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="toolbar">
        <label className="search">
          <PlugZap size={16} />
          <input
            aria-label="Search stations"
            placeholder="Search station, feeder or status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span className="muted">
          {stations.length} of {run.config.fleet_size} stations
        </span>
        <Badge tone="healthy">Synthetic fleet</Badge>
      </div>
      <Panel
        title="Charging station inventory"
        subtitle="Select a station to inspect its independent measurement path"
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Station ID</th>
                <th>Feeder</th>
                <th>Actual / kW</th>
                <th>Reported / kW</th>
                <th>Status</th>
                <th>Firmware</th>
                <th>Detection</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stations.map((s) => (
                <tr key={s.id} className={selected === s.id ? "selected" : ""}>
                  <td>
                    <button
                      className="table-button mono"
                      onClick={() => setSelected(s.id)}
                    >
                      {s.id}
                    </button>
                  </td>
                  <td className="mono">{s.feeder_id}</td>
                  <td className="mono">{number(s.actual_power_kw)}</td>
                  <td className="mono">{number(s.reported_power_kw)}</td>
                  <td>
                    <Badge
                      tone={
                        s.contained
                          ? "warning"
                          : s.status === "Charging"
                            ? "healthy"
                            : "neutral"
                      }
                    >
                      {s.status}
                    </Badge>
                  </td>
                  <td>{s.firmware_state}</td>
                  <td>
                    {s.detected ? (
                      <Badge tone="warning">Flagged</Badge>
                    ) : (
                      <span className="muted">Clear</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Inspect ${s.id}`}
                      onClick={() => setSelected(s.id)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!stations.length && (
            <div className="table-empty">No stations match your search.</div>
          )}
        </div>
      </Panel>
      {selected && (
        <section className="station-detail">
          <div className="panel-heading">
            <div>
              <h2>{selected} / Station detail</h2>
              <p>Physical state and recent telemetry</p>
            </div>
            <button
              className="icon-button"
              aria-label="Close station detail"
              onClick={() => setSelected(null)}
            >
              <X size={18} />
            </button>
          </div>
          {detailError ? (
            <Note>{detailError}</Note>
          ) : !detail ? (
            <p className="padded">Loading station telemetry…</p>
          ) : (
            <>
              <div className="detail-grid">
                <dl>
                  <dt>Vehicle connected</dt>
                  <dd>{detail.station.vehicle_present ? "Yes" : "No"}</dd>
                  <dt>Physical ceiling</dt>
                  <dd>{number(detail.station.vehicle_acceptance_kw)} kW</dd>
                  <dt>Independent meter</dt>
                  <dd>
                    {number(detail.station.independent_measured_power_kw)} kW
                  </dd>
                  <dt>Power authority assumption</dt>
                  <dd>
                    {detail.station.physical_authority ? "Enabled" : "Disabled"}
                  </dd>
                </dl>
                <div>
                  <Note>
                    Quarantine uses a modeled upstream isolation device.
                    Recovery restores a verified controller at the next step.
                  </Note>
                  <div className="button-row">
                    <button
                      disabled={busy || run.status === "completed"}
                      onClick={() =>
                        void perform(async () => {
                          setRun(
                            await api<Run>(
                              `/simulations/${run.id}/stations/${selected}`,
                              {
                                action: detail.station.contained
                                  ? "recover"
                                  : "quarantine",
                              },
                            ),
                          );
                          setRun(
                            await api<Run>(`/simulations/${run.id}/step`, {
                              steps: 1,
                            }),
                          );
                        })
                      }
                    >
                      <Unplug size={15} />
                      {detail.station.contained
                        ? "Recover station"
                        : "Quarantine station"}
                    </button>
                  </div>
                  <p className="muted small">
                    Completed runs are frozen. Reset to apply new actions.
                  </p>
                </div>
              </div>
              <EventTable events={detail.events.slice(-8).reverse()} small />
            </>
          )}
        </section>
      )}
    </>
  );
}

const basicFields: [keyof Config, string, number, number, number, string][] = [
  ["fleet_size", "Fleet size", 4, 300, 1, "stations"],
  ["compromised_fraction", "Affected fleet fraction", 0, 1, 0.05, "0–1"],
  ["connection_rate", "Vehicle connection rate", 0, 1, 0.05, "0–1"],
  ["telemetry_distortion", "Telemetry distortion", -2, 2, 0.05, "fraction"],
  ["concentration", "Feeder concentration", 0, 1, 0.1, "0–1"],
  ["duration_steps", "Duration", 60, 360, 1, "steps"],
  ["seed", "Random seed", 0, 4294967295, 1, "integer"],
];
const advancedFields: typeof basicFields = [
  ["charger_rating_kw", "Charger rating", 1, 350, 1, "kW"],
  ["baseline_fraction", "Baseline utilization", 0, 1, 0.05, "0–1"],
  ["vehicle_acceptance_kw", "Vehicle acceptance limit", 1, 350, 1, "kW"],
  [
    "load_change_fraction",
    "Requested load change",
    -1,
    1,
    0.1,
    "headroom / baseline",
  ],
  ["feeder_count", "Feeder count", 1, 8, 1, "feeders"],
  ["feeder_capacity_kva", "Feeder capacity", 10, 100000, 10, "kVA"],
  ["feeder_base_kw", "Non-EV base demand", 0, 100000, 10, "kW / feeder"],
  ["base_power_factor", "Base-load power factor", 0.5, 1, 0.01, "cos φ"],
  ["step_seconds", "Time interval", 1, 600, 1, "s"],
  ["onset_step", "Scenario onset", 1, 359, 1, "step"],
  ["attack_duration_steps", "Scenario pulse duration", 1, 360, 1, "steps"],
  ["trigger_dispersion_steps", "Trigger dispersion", 0, 120, 1, "steps"],
  ["ramp_steps", "Load ramp", 1, 60, 1, "steps"],
  ["sensing_coverage", "Independent station coverage", 0, 1, 0.1, "0–1"],
  ["sensor_noise_kw", "Independent sensor noise σ", 0, 20, 0.01, "kW"],
  ["detection_threshold_kw", "Residual threshold", 0.1, 1000, 0.1, "kW"],
  ["sustained_steps", "Residual persistence", 1, 10, 1, "steps"],
  ["mitigation_delay_steps", "Containment delay", 0, 60, 1, "steps"],
];
function NumericFields({ fields }: { fields: typeof basicFields }) {
  const { config, setConfig } = useConsole();
  return (
    <div className="form-grid">
      {fields.map(([key, label, min, max, step, unit]) => (
        <label key={key} className="field">
          <span>
            {label}
            <small>{unit}</small>
          </span>
          <input
            type="number"
            aria-label={label}
            min={min}
            max={max}
            step={step}
            value={config[key] as number}
            onChange={(e) =>
              setConfig({ ...config, [key]: Number(e.target.value) })
            }
          />
        </label>
      ))}
    </div>
  );
}
function DefenseSettings() {
  const { config, setConfig } = useConsole();
  const d = config.defenses;
  const controls: [keyof Defenses, string, string][] = [
    [
      "firmware_verification",
      "Firmware verification",
      "Reject invalid signature, rollback and wrong-variant update metadata.",
    ],
    [
      "independent_metering",
      "Independent metering",
      "Independent station and feeder measurements feed residual detection.",
    ],
    [
      "external_limiter",
      "External feeder limiter",
      "Upstream actuation constrains actual charging demand.",
    ],
    [
      "canary_rollout",
      "Canary update rollout",
      "Restrict exposure to the hypothetical update.",
    ],
    [
      "auto_quarantine",
      "Automatic containment",
      "Isolate stations after detector alarms and response delay.",
    ],
  ];
  return (
    <div className="defense-settings">
      {controls.map(([key, label, text]) => (
        <label className="switch-row" key={key}>
          <span>
            <strong>{label}</strong>
            <small>{text}</small>
          </span>
          <input
            type="checkbox"
            aria-label={label}
            checked={Boolean(d[key])}
            onChange={(e) =>
              setConfig({
                ...config,
                defenses: { ...d, [key]: e.target.checked },
              })
            }
          />
        </label>
      ))}
      <div className="form-grid">
        <label className="field">
          <span>
            Limiter capacity fraction<small>0.1–1</small>
          </span>
          <input
            aria-label="Limiter capacity fraction"
            type="number"
            min={0.1}
            max={1}
            step={0.05}
            value={d.limiter_fraction}
            onChange={(e) =>
              setConfig({
                ...config,
                defenses: { ...d, limiter_fraction: Number(e.target.value) },
              })
            }
          />
        </label>
        <label className="field">
          <span>
            Canary exposure fraction<small>0–1</small>
          </span>
          <input
            aria-label="Canary exposure fraction"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={d.canary_fraction}
            onChange={(e) =>
              setConfig({
                ...config,
                defenses: { ...d, canary_fraction: Number(e.target.value) },
              })
            }
          />
        </label>
      </div>
    </div>
  );
}
function CompareControl() {
  const { config, perform, setComparison, busy } = useConsole();
  const [mode, setMode] = useState("defenses");
  return (
    <div className="button-row padded">
      <select
        aria-label="Comparison mode"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        <option value="defenses">Defenses off / configured</option>
        <option value="concentration">Dispersed / concentrated</option>
        <option value="sensing">No sensing / full sensing</option>
        <option value="fraction">10% / 80% affected</option>
      </select>
      <button
        disabled={busy}
        onClick={() =>
          void perform(async () =>
            setComparison(
              await api<Comparison>("/simulations/compare", { config, mode }),
            ),
          )
        }
      >
        <GitCompareArrows size={15} />
        Run comparison
      </button>
    </div>
  );
}
function CompareResult() {
  const { comparison } = useConsole();
  return comparison ? (
    <Panel
      title="Matched-seed comparison"
      subtitle={`Computed pair · ${comparison.mode} · seed ${comparison.left.config.seed}`}
    >
      <ComparisonTable left={comparison.left} right={comparison.right} />
    </Panel>
  ) : null;
}

function Lab() {
  const {
    config,
    setConfig,
    scenarios,
    run,
    perform,
    setRun,
    busy,
    series,
    events,
  } = useConsole();
  const current = scenarios.find((s) => s.id === config.scenario);
  const start = (finish: boolean) =>
    void perform(async () => {
      let r = await api<Run>("/simulations", config);
      r = await api<Run>(`/simulations/${r.id}/control`, {
        action: finish ? "finish" : "resume",
      });
      setRun(r);
    });
  return (
    <div className="lab-layout">
      <div className="lab-settings">
        <Panel
          title="Experiment configuration"
          subtitle="Changes apply to the next run"
          action={<Badge>SEEDED</Badge>}
        >
          <div className="padded">
            <label className="field">
              <span>Scenario</span>
              <select
                aria-label="Scenario"
                value={config.scenario}
                onChange={(e) =>
                  setConfig({ ...config, scenario: e.target.value })
                }
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="scenario-description">{current?.description}</p>
            <NumericFields fields={basicFields} />
            <label className="check-row">
              <input
                type="checkbox"
                checked={config.physical_authority}
                onChange={(e) =>
                  setConfig({ ...config, physical_authority: e.target.checked })
                }
              />
              Physical power-control authority
            </label>
            <details>
              <summary>Physical model & detection parameters</summary>
              <NumericFields fields={advancedFields} />
              <label className="field">
                <span>Falsification class</span>
                <select
                  aria-label="Falsification class"
                  value={config.falsification_class}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      falsification_class: e.target.value,
                    })
                  }
                >
                  <option value="F2">F2 · Internally consistent</option>
                  <option value="F1">F1 · Energy/power inconsistency</option>
                </select>
              </label>
            </details>
            <details>
              <summary>Synthetic update manifest</summary>
              {(
                [
                  ["signature_valid", "Signature valid"],
                  ["version_monotonic", "Version monotonic"],
                  ["hardware_compatible", "Hardware compatible"],
                ] as const
              ).map(([key, label]) => (
                <label className="check-row" key={key}>
                  <input
                    type="checkbox"
                    checked={config[key]}
                    onChange={(e) =>
                      setConfig({ ...config, [key]: e.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
            </details>
            <details>
              <summary>Defensive controls</summary>
              <DefenseSettings />
            </details>
            <div className="button-row">
              <button
                className="primary"
                disabled={busy}
                onClick={() => start(false)}
              >
                <Play size={15} />
                {busy ? "Computing…" : "Start simulation"}
              </button>
              <button disabled={busy} onClick={() => start(true)}>
                <SkipForward size={15} />
                Run full
              </button>
            </div>
          </div>
        </Panel>
      </div>
      <div className="lab-results">
        {run ? (
          <>
            <RunControls />
            <Panel
              title="Experiment response"
              subtitle={`${run.config.scenario} · ${run.config.fleet_size} stations · seed ${run.config.seed}`}
              action={<Legend />}
            >
              <PowerChart data={series} />
              <div className="result-strip">
                <div>
                  <span>Current ΔP</span>
                  <strong>{number(run.frame.delta_power_kw)} kW</strong>
                </div>
                <div>
                  <span>Peak loading</span>
                  <strong>{number(run.metrics.peak_loading_pct)}%</strong>
                </div>
                <div>
                  <span>Detection delay</span>
                  <strong>{number(run.metrics.detection_delay_s, 0)} s</strong>
                </div>
              </div>
            </Panel>
            <Gates />
            <Panel title="Event timeline" subtitle="Newest revealed events">
              <EventTable events={events} small />
            </Panel>
          </>
        ) : (
          <Panel title="Experiment response">
            <Empty
              title="Awaiting an experiment"
              description="Configure the fleet and start a run. Results are calculated by the local simulation engine."
            />
          </Panel>
        )}
        <Panel
          title="Controlled comparison"
          subtitle="Identical seeds and baseline trajectories"
        >
          <CompareControl />
          <Note>
            Enable intended defenses before a mitigation comparison. Reference A
            disables protective actuation while preserving sensing
            configuration.
          </Note>
        </Panel>
        <CompareResult />
      </div>
    </div>
  );
}
function Gates() {
  const { run } = useConsole();
  if (!run) return null;
  const labels = [
    "Pipeline condition",
    "Update accepted",
    "Image executes",
    "Telemetry capability",
    "Power authority",
    "Load deviation",
    "Grid limit exceeded",
  ];
  return (
    <Panel
      title="Conditional causal gates"
      subtitle="G3 telemetry manipulation does not imply G4 physical power control"
    >
      <div className="gates">
        {labels.map((label, i) => (
          <div key={label} className={run.frame.gates[i] ? "reached" : ""}>
            <span>G{i}</span>
            <i />
            {label}
            <small>
              {run.frame.gates[i] ? "Established" : "Not established"}
            </small>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Grid() {
  const { run, series } = useConsole();
  if (!run) return <Empty />;
  return (
    <>
      <Note>
        Voltage is a linearized DistFlow approximation for screening. EV
        reactive power is negligible; base power factor is{" "}
        {run.config.base_power_factor}. Active kW and apparent kVA are distinct.
      </Note>
      <div className="overview-grid">
        <Panel
          title="Electrical demand"
          subtitle="Actual modeled electrical state"
          action={<Legend />}
        >
          <PowerChart data={series} />
        </Panel>
        <Panel
          title="Physical constraints"
          subtitle="Device, vehicle and network limits"
        >
          <dl className="padded">
            <dt>Charger nameplate</dt>
            <dd>{run.config.charger_rating_kw} kW</dd>
            <dt>Vehicle acceptance ceiling</dt>
            <dd>{run.config.vehicle_acceptance_kw} kW</dd>
            <dt>Feeder capacity</dt>
            <dd>{run.config.feeder_capacity_kva} kVA</dd>
            <dt>Independent feeder limit</dt>
            <dd>
              {run.config.defenses.external_limiter
                ? `${run.config.defenses.limiter_fraction * 100}%`
                : "Disabled"}
            </dd>
            <dt>Peak |ΔP|</dt>
            <dd>{number(run.metrics.peak_deviation_kw)} kW</dd>
            <dt>Time over capacity</dt>
            <dd>{number(run.metrics.overload_duration_s, 0)} s</dd>
            <dt>Net displaced energy</dt>
            <dd>{number(run.metrics.energy_displaced_kwh)} kWh</dd>
          </dl>
        </Panel>
      </div>
      <Panel
        title="Feeder electrical state"
        subtitle="Virtual radial branches · r = 0.025 p.u. · x = 0.015 p.u. on each feeder capacity base"
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Feeder</th>
                <th>Base / kW</th>
                <th>EV / kW</th>
                <th>Q / kvar</th>
                <th>Apparent / kVA</th>
                <th>Loading</th>
                <th>Voltage / p.u.</th>
                <th>Condition</th>
              </tr>
            </thead>
            <tbody>
              {run.frame.feeders.map((f) => (
                <tr key={f.id}>
                  <td className="mono">{f.id}</td>
                  <td>{number(f.base_kw)}</td>
                  <td>{number(f.charger_kw)}</td>
                  <td>{number(f.reactive_kvar)}</td>
                  <td>{number(f.apparent_kva)}</td>
                  <td>
                    <strong
                      className={f.loading_pct > 100 ? "text-critical" : ""}
                    >
                      {number(f.loading_pct)}%
                    </strong>
                  </td>
                  <td className="mono">{number(f.voltage_pu, 3)}</td>
                  <td>
                    <Badge
                      tone={
                        f.loading_pct > 100 || f.voltage_pu < 0.95
                          ? "critical"
                          : f.loading_pct > 90
                            ? "warning"
                            : "healthy"
                      }
                    >
                      {f.loading_pct > 100
                        ? "Over capacity"
                        : f.voltage_pu < 0.95
                          ? "Low voltage"
                          : f.loading_pct > 90
                            ? "Near limit"
                            : "Normal"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="two-columns">
        <Panel
          title="Peak feeder loading"
          subtitle="Across feeders at each step · red line = 100%"
        >
          <ImpactChart data={series} metric="max_loading_pct" />
        </Panel>
        <Panel
          title="Minimum voltage profile"
          subtitle="Approximate lowest branch voltage"
        >
          <ImpactChart data={series} metric="min_voltage_pu" />
        </Panel>
      </div>
    </>
  );
}

function Security() {
  const { run, events } = useConsole();
  const [type, setType] = useState(""),
    [severity, setSeverity] = useState(""),
    [station, setStation] = useState(""),
    [from, setFrom] = useState(0),
    [to, setTo] = useState(""),
    [alertFilter, setAlertFilter] = useState("");
  if (!run) return <Empty />;
  const filtered = events.filter(
    (e) =>
      (!type || e.type === type) &&
      (!severity || e.severity === severity) &&
      (!station ||
        e.station_id.toLowerCase().includes(station.toLowerCase())) &&
      e.step >= from &&
      (!to || e.step <= Number(to)),
  );
  return (
    <>
      <div className="two-columns">
        <Panel
          title="Detection evaluation"
          subtitle="Station × time-step ground truth from injection log"
        >
          <div className="metric-inline">
            {(
              [
                "precision",
                "recall",
                "f1_score",
                "false_positive_rate",
              ] as const
            ).map((key) => (
              <div key={key}>
                <span>{key.replaceAll("_", " ")}</span>
                <strong
                  title={
                    run.metrics[key] == null ? run.metrics.undefined_reason : ""
                  }
                >
                  {run.metrics[key] == null
                    ? "N/A"
                    : `${number(run.metrics[key]! * 100, 1)}%`}
                </strong>
              </div>
            ))}
          </div>
          <div className="panel-foot mono">
            TP {run.metrics.true_positives} · FP {run.metrics.false_positives} ·
            TN {run.metrics.true_negatives} · FN {run.metrics.false_negatives}
          </div>
          <Note>
            N/A means no observations for the denominator. D2 feeder alerts are
            excluded from station scores. Undetected stations:{" "}
            {run.metrics.undetected_stations}.
          </Note>
        </Panel>
        <Panel
          title="Implemented detectors"
          subtitle="Transparent heuristics; configurable thresholds"
        >
          <div className="rules">
            <div>
              <b>D1</b>
              <span>
                Device consistency
                <small>
                  Range, energy integral, monotonicity, status, ramp and stale
                  messages
                </small>
              </span>
            </div>
            <div>
              <b>D2</b>
              <span>
                Feeder residual
                <small>
                  Independent feeder demand vs. base + reported EV load
                </small>
              </span>
            </div>
            <div>
              <b>D3</b>
              <span>
                Cross-layer station residual
                <small>Independent measurement vs. device-reported power</small>
              </span>
            </div>
          </div>
        </Panel>
      </div>
      <Panel
        title="Anomaly log"
        subtitle={`${run.alerts.length} explainable alerts`}
        action={
          <select
            aria-label="Filter alerts"
            value={alertFilter}
            onChange={(e) => setAlertFilter(e.target.value)}
          >
            <option value="">All detectors</option>
            {["D1", "D2", "D3"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>Detector</th>
                <th>Severity</th>
                <th>Explanation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {run.alerts
                .filter((a) => !alertFilter || a.detector === alertFilter)
                .map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{time(a.timestamp_s)}</td>
                    <td className="mono">{a.station_id ?? a.feeder_id}</td>
                    <td>{a.detector}</td>
                    <td>
                      <Badge tone={a.severity}>{a.severity}</Badge>
                    </td>
                    <td className="explanation">
                      {a.explanation}
                      <small className="mono">
                        {JSON.stringify(a.observed)}
                      </small>
                    </td>
                    <td>{a.status}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!run.alerts.length && (
            <div className="table-empty">
              No detector alarms in this interval.
            </div>
          )}
        </div>
      </Panel>
      <Panel
        title="OCPP-style message viewer"
        subtitle="Simulated telemetry inspired by OCPP 1.6J · full compliance is not claimed"
      >
        <div className="event-filters">
          <input
            placeholder="Station ID…"
            aria-label="Filter event station"
            value={station}
            onChange={(e) => setStation(e.target.value)}
          />
          <select
            aria-label="Message type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All message types</option>
            {[
              "BootNotification",
              "Heartbeat",
              "StatusNotification",
              "MeterValues",
              "StartTransaction",
              "StopTransaction",
              "FirmwareStatusNotification",
              "DefenseAction",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Event severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">All severities</option>
            <option>info</option>
            <option>warning</option>
            <option>critical</option>
          </select>
          <label>
            From step
            <input
              aria-label="From step"
              type="number"
              min={0}
              value={from}
              onChange={(e) => setFrom(Number(e.target.value))}
            />
          </label>
          <label>
            To step
            <input
              aria-label="To step"
              type="number"
              min={0}
              placeholder="Current"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <EventTable events={filtered} />
        <div className="panel-foot">
          Latest 250 events. Export JSON for complete event and injection logs.
        </div>
      </Panel>
    </>
  );
}

function DefenseCenter() {
  const { run, config, setConfig, perform, setRun, busy } = useConsole();
  return (
    <>
      <Note>
        Settings apply to a fresh experiment. Quarantine and feeder limits act
        independently of the charger controller.
      </Note>
      <div className="two-columns defense-layout">
        <Panel
          title="Protective controls"
          subtitle="Set controls, then compute a matched-seed comparison"
        >
          <div className="padded">
            <DefenseSettings />
            <div className="button-row">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const r = await api<Run>("/simulations", config);
                    setRun(
                      await api<Run>(`/simulations/${r.id}/control`, {
                        action: "finish",
                      }),
                    );
                  })
                }
              >
                <ShieldCheck size={15} />
                Run configured defenses
              </button>
              <button onClick={() => setConfig({ ...config, scenario: "S0" })}>
                Select normal recovery run
              </button>
            </div>
          </div>
        </Panel>
        <div>
          <Panel
            title="Mitigation comparison"
            subtitle="Identical fleet, baseline and random seed"
          >
            <CompareControl />
            <Note>
              Compare peak deviation, loading, response delay and isolation.
              Quarantine sheds legitimate charging and can produce negative load
              deviation.
            </Note>
          </Panel>
          {run && (
            <Panel
              title="Current run defenses"
              subtitle="Settings used by the selected experiment"
            >
              <dl className="padded">
                <dt>Firmware verification</dt>
                <dd>
                  {run.config.defenses.firmware_verification
                    ? "Enforced"
                    : "Disabled"}
                </dd>
                <dt>Independent coverage</dt>
                <dd>
                  {run.config.defenses.independent_metering
                    ? run.config.sensing_coverage * 100
                    : 0}
                  %
                </dd>
                <dt>External limiter</dt>
                <dd>
                  {run.config.defenses.external_limiter
                    ? "Enforced"
                    : "Disabled"}
                </dd>
                <dt>Canary rollout</dt>
                <dd>
                  {run.config.defenses.canary_rollout
                    ? `${run.config.defenses.canary_fraction * 100}% exposure`
                    : "Full configured exposure"}
                </dd>
                <dt>Contained stations</dt>
                <dd>{run.metrics.contained_stations}</dd>
              </dl>
            </Panel>
          )}
        </div>
      </div>
      <CompareResult />
      {run && <Gates />}
    </>
  );
}

function Reports() {
  const { history, run, load, perform, busy } = useConsole();
  const [selected, setSelected] = useState<string[]>([]),
    [pair, setPair] = useState<[Run, Run] | null>(null);
  return (
    <>
      <div className="toolbar">
        <span>
          {history.filter((r) => r.status === "completed").length} completed
          experiments · {history.length} total runs
        </span>
        <button
          disabled={busy || selected.length !== 2}
          onClick={() =>
            void perform(async () =>
              setPair(
                (await Promise.all(
                  selected.map((id) => api<Run>("/simulations/" + id)),
                )) as [Run, Run],
              ),
            )
          }
        >
          <GitCompareArrows size={15} />
          Compare selected ({selected.length}/2)
        </button>
      </div>
      <Panel
        title="Experiment archive"
        subtitle={
          browserMode
            ? "Reproducible experiments saved in this browser"
            : "Configurations, events and data persist in local SQLite"
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th />
                <th>Run</th>
                <th>Created</th>
                <th>Scenario</th>
                <th>Fleet</th>
                <th>Seed</th>
                <th>Status</th>
                <th>Inspect</th>
                <th>Export</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className={run?.id === r.id ? "selected" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select run ${r.id.slice(0, 8)}`}
                      checked={selected.includes(r.id)}
                      disabled={
                        r.status !== "completed" ||
                        (selected.length === 2 && !selected.includes(r.id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, r.id]
                            : selected.filter((x) => x !== r.id),
                        )
                      }
                    />
                  </td>
                  <td className="mono">{r.id.slice(0, 8)}</td>
                  <td>{new Date(r.created_at).toLocaleString("en-IN")}</td>
                  <td>{r.config.scenario}</td>
                  <td>{r.config.fleet_size}</td>
                  <td className="mono">{r.config.seed}</td>
                  <td>
                    <Badge
                      tone={r.status === "completed" ? "healthy" : "neutral"}
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="table-button"
                      onClick={() => void perform(() => load(r.id))}
                    >
                      Inspect
                    </button>
                  </td>
                  <td>
                    {r.status === "completed" ? (
                      <div className="export-links">
                        {["csv", "html", "json"].map((format) => (
                          <a
                            key={format}
                            href={
                              browserMode
                                ? "#"
                                : `/api/reports/${r.id}/export?format=${format}`
                            }
                            onClick={
                              browserMode
                                ? (e) => {
                                    e.preventDefault();
                                    exportPreview(r.id, format);
                                  }
                                : undefined
                            }
                            download
                          >
                            <Download size={12} />
                            {format.toUpperCase()}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">Finish to export</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.length && (
            <Empty
              title="No saved experiments"
              description="Run a scenario to begin your local archive."
            />
          )}
        </div>
      </Panel>
      {pair && (
        <Panel
          title="Selected run comparison"
          subtitle="Check seeds and configuration before interpreting differences"
        >
          <ComparisonTable left={pair[0]} right={pair[1]} />
        </Panel>
      )}
      {run && (
        <div className="two-columns">
          <Panel
            title="Selected experiment configuration"
            subtitle={`${run.id.slice(0, 8)} · ${run.config.scenario}`}
          >
            <pre className="config-json">
              {JSON.stringify(run.config, null, 2)}
            </pre>
          </Panel>
          <Panel
            title="Model assumptions & limitations"
            subtitle="Included in every report"
          >
            <ul className="assumptions">
              {run.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
