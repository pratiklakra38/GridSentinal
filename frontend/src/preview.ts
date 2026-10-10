import { defaults } from "./defaults";
import type {
  Alert,
  Config,
  Evaluation,
  Event,
  Feeder,
  Metrics,
  Point,
  Run,
  RunSummary,
  Station,
} from "./types";

// Browser demo: reproducible synthetic physics, no requests to real infrastructure.
type Action = { step: number; station_id: string; action: string };
type Saved = RunSummary & { actions: Action[] };
type Frame = Run["frame"] & {
  labels: boolean[];
  predictions: boolean[];
  d1: boolean[];
  d3: boolean[];
};
type Result = { frames: Frame[]; events: Event[]; alerts: Alert[] };
const storageKey = "gridsentinel.browser-experiments.v1";
const cache = new Map<string, Result>();
const scenarios = [
  ["S0", "Normal operation", "Baseline fleet with accurate reporting."],
  [
    "S1",
    "Communication faults",
    "Benign missing, delayed and duplicate messages.",
  ],
  [
    "S2",
    "Sensor inaccuracy",
    "Benign meter drift, noise, quantization and clock skew.",
  ],
  [
    "S3",
    "Telemetry manipulation only",
    "Reports change while physical demand stays at baseline.",
  ],
  [
    "S4",
    "Authorized load change",
    "Legitimate demand adjustment with accurate reporting.",
  ],
  [
    "S5",
    "Coordinated load deviation",
    "Bounded charging changes with falsified telemetry.",
  ],
  [
    "S6",
    "Partial fleet compromise",
    "Explore affected fractions and charging headroom.",
  ],
  [
    "S7",
    "Geographic concentration",
    "Compare feeder placement at equal fleet demand.",
  ],
  [
    "S8",
    "Independent sensing coverage",
    "Compare independent sensing coverage.",
  ],
  [
    "S9",
    "Defensive mitigation",
    "Compare the same scenario with protective controls.",
  ],
];
const assumptions = [
  "Browser demo [S]: seeded TypeScript simulation, stored locally in this browser. Optional Python backend is a separate implementation.",
  "Fixed vehicle presence and synthetic baseline modulation with mild acceptance taper. No real station or grid connections.",
  "Actual load is bounded by device rating, vehicle acceptance and connection state; reported telemetry is never used to calculate electrical demand.",
  "EV reactive demand is neglected; non-EV reactive power is Pbase × tan(acos(power factor)). Apparent power is hypot(P,Q) in kVA.",
  "Voltage uses linearized DistFlow: sqrt(1 − 2(rPpu + xQpu)), r=0.025 and x=0.015 on feeder capacity base. No full AC, thermal or frequency model.",
  "D1 device consistency rules; D2 sustained independent feeder residual; D3 sustained independent station residual. These are demonstration heuristics, not the paper’s trained detectors.",
  "Ground-truth labels come from the injection schedule. Station × step metrics exclude feeder-level D2 attribution. N/A denotes a zero denominator.",
  "Firmware verification checks inert synthetic manifest metadata, not real cryptographic signatures. Valid signed compromised images remain a residual risk.",
  "Feeder limiting and quarantine represent firmware-independent upstream enforcement. Recovery restores verified station state; advisory controller commands are not guaranteed.",
  "The supplied research paper is a blueprint without completed experiments. These browser results do not validate all its hypotheses.",
];
function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let z = value;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
const clip = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(high, v));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
function normal(random: () => number) {
  return (
    Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) *
    Math.cos(2 * Math.PI * random())
  );
}
function read(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as Saved[];
  } catch {
    return [];
  }
}
function save(runs: Saved[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(runs));
  } catch {
    throw new Error(
      "Browser storage is full. Export reports and clear old browser data before saving another run.",
    );
  }
}
function checkedConfig(input: Config): Config {
  const c = {
    ...defaults,
    ...input,
    defenses: { ...defaults.defenses, ...input.defenses },
  };
  if (!scenarios.some((s) => s[0] === c.scenario))
    throw new Error("Unknown scenario");
  const ranges: [keyof Config, number, number][] = [
    ["fleet_size", 4, 300],
    ["duration_steps", 60, 360],
    ["seed", 0, 4294967295],
    ["compromised_fraction", 0, 1],
    ["connection_rate", 0, 1],
    ["charger_rating_kw", 0.1, 350],
    ["baseline_fraction", 0, 1],
    ["vehicle_acceptance_kw", 0.1, 350],
    ["load_change_fraction", -1, 1],
    ["telemetry_distortion", -2, 2],
    ["feeder_count", 1, 8],
    ["feeder_capacity_kva", 10, 100000],
    ["feeder_base_kw", 0, 100000],
    ["base_power_factor", 0.5, 1],
    ["concentration", 0, 1],
    ["step_seconds", 1, 600],
    ["onset_step", 1, 359],
    ["attack_duration_steps", 1, 360],
    ["trigger_dispersion_steps", 0, 120],
    ["ramp_steps", 1, 60],
    ["sensing_coverage", 0, 1],
    ["sensor_noise_kw", 0, 20],
    ["detection_threshold_kw", 0.01, 1000],
    ["sustained_steps", 1, 10],
    ["mitigation_delay_steps", 0, 60],
  ];
  for (const [key, low, high] of ranges) {
    const v = c[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < low || v > high)
      throw new Error(
        `${key.replaceAll("_", " ")} must be between ${low} and ${high}.`,
      );
  }
  for (const key of [
    "fleet_size",
    "duration_steps",
    "seed",
    "feeder_count",
    "step_seconds",
    "onset_step",
    "attack_duration_steps",
    "trigger_dispersion_steps",
    "ramp_steps",
    "sustained_steps",
    "mitigation_delay_steps",
  ] as const)
    if (!Number.isInteger(c[key]))
      throw new Error(`${key} must be an integer.`);
  if (c.onset_step >= c.duration_steps)
    throw new Error("Scenario onset must be before the final simulation step.");
  if (
    c.defenses.limiter_fraction < 0.1 ||
    c.defenses.limiter_fraction > 1 ||
    c.defenses.canary_fraction < 0 ||
    c.defenses.canary_fraction > 1
  )
    throw new Error("Defense fractions are outside their valid range.");
  return c;
}
export function simulate(c: Config, actions: Action[] = []): Result {
  const n = c.fleet_size,
    fleet = rng(c.seed),
    reportRandom = rng(c.seed ^ 0x36d14a),
    sensorRandom = rng(c.seed ^ 0x914a23);
  const connected = Array.from(
    { length: n },
    () => fleet() < c.connection_rate,
  );
  const acceptance = connected.map((p) =>
    p
      ? Math.min(
          c.charger_rating_kw,
          c.vehicle_acceptance_kw * (0.8 + 0.2 * fleet()),
        )
      : 0,
  );
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(fleet() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const affected = new Set(
    order.slice(0, Math.round(n * c.compromised_fraction)),
  );
  const malicious = ["S3", "S5", "S6", "S7", "S8", "S9"].includes(c.scenario);
  const exposed = new Set(
    malicious
      ? order.slice(
          0,
          Math.round(
            n *
              c.compromised_fraction *
              (c.defenses.canary_rollout ? c.defenses.canary_fraction : 1),
          ),
        )
      : [],
  );
  const accepted =
    !c.defenses.firmware_verification ||
    (c.signature_valid && c.version_monotonic && c.hardware_compatible);
  const compromised = Array.from(
    { length: n },
    (_, i) => exposed.has(i) && accepted,
  );
  const feederIds = Array.from({ length: n }, (_, i) => i % c.feeder_count);
  Array.from(affected)
    .slice(0, Math.round(affected.size * c.concentration))
    .forEach((i) => (feederIds[i] = 0));
  const offset = Array.from({ length: n }, () =>
    Math.floor(fleet() * (c.trigger_dispersion_steps + 1)),
  );
  const phase = Array.from({ length: n }, () => fleet() * 0.5 - 0.25);
  const coverage = new Set(
    c.defenses.independent_metering
      ? order.slice(0, Math.round(n * c.sensing_coverage))
      : [],
  );
  const q = c.feeder_base_kw * Math.tan(Math.acos(c.base_power_factor));
  const isolated = Array(n).fill(false) as boolean[],
    recovered = Array(n).fill(false) as boolean[],
    detected = Array(n).fill(false) as boolean[];
  const due = Array(n).fill(-1) as number[],
    streak = Array(n).fill(0) as number[],
    fStreak = Array(c.feeder_count).fill(0) as number[];
  let previous = Array(n).fill(0) as number[],
    previousEnergy = Array(n).fill(0) as number[];
  const energy = Array(n).fill(0) as number[],
    stale = Array(n).fill(0) as number[],
    issued = new Set<string>();
  const frames: Frame[] = [],
    events: Event[] = [],
    alerts: Alert[] = [];
  const dt = c.step_seconds / 3600;
  const event = (
    t: number,
    i: number,
    type: string,
    payload: Record<string, unknown>,
    validation = "valid",
    severity = "info",
  ) =>
    events.push({
      id: `EV-${events.length + 1}`,
      step: t,
      timestamp_s: t * c.step_seconds,
      station_id: `EVSE-${String(i + 1).padStart(3, "0")}`,
      type,
      payload,
      validation,
      severity,
    });
  for (let t = 0; t < c.duration_steps; t++) {
    actions
      .filter((a) => a.step === t)
      .forEach((a) => {
        const i = Number(a.station_id.split("-")[1]) - 1;
        isolated[i] = a.action === "quarantine";
        recovered[i] = a.action === "recover";
        due[i] = -1;
        event(t, i, "DefenseAction", {
          action: a.action,
          actuation: "independent upstream device",
        });
      });
    due.forEach((d, i) => {
      if (d >= 0 && d <= t && !isolated[i] && !recovered[i]) {
        isolated[i] = true;
        event(t, i, "DefenseAction", {
          action: "quarantine",
          actuation: "independent upstream device",
        });
      }
    });
    const feasible = acceptance.map(
      (a) => a * (1 - (0.08 * t) / c.duration_steps),
    );
    const baseline = feasible.map((a, i) =>
      clip(
        a * c.baseline_fraction * (1 + 0.06 * Math.sin(t / 8 + phase[i])),
        0,
        a,
      ),
    );
    const ramp = offset.map((o) =>
      t < c.onset_step + c.attack_duration_steps
        ? clip((t - c.onset_step - o + 1) / c.ramp_steps, 0, 1)
        : 0,
    );
    const active = compromised.map(
      (v, i) => v && ramp[i] > 0 && !isolated[i] && !recovered[i],
    );
    const actual = baseline.map((b, i) => {
      const change =
        c.load_change_fraction >= 0
          ? (feasible[i] - b) * c.load_change_fraction
          : b * c.load_change_fraction;
      return isolated[i]
        ? 0
        : clip(
            b +
              ((active[i] && c.physical_authority && c.scenario !== "S3") ||
              (c.scenario === "S4" && affected.has(i))
                ? change * ramp[i]
                : 0),
            0,
            feasible[i],
          );
    });
    if (c.defenses.external_limiter) {
      const budget = Math.max(
        0,
        Math.sqrt(
          Math.max(
            0,
            (c.feeder_capacity_kva * c.defenses.limiter_fraction) ** 2 - q * q,
          ),
        ) - c.feeder_base_kw,
      );
      for (let f = 0; f < c.feeder_count; f++) {
        const total = sum(actual.filter((_, i) => feederIds[i] === f));
        if (total > budget)
          actual.forEach((p, i) => {
            if (feederIds[i] === f) actual[i] = (p * budget) / total;
          });
      }
    }
    const reported = actual.map((p, i) =>
      active[i] ? baseline[i] * (1 + c.telemetry_distortion) : p,
    );
    const missing = Array(n).fill(false) as boolean[];
    const delayed = Array(n).fill(false) as boolean[];
    reported.forEach((_, i) => {
      if (c.scenario === "S2")
        reported[i] = connected[i]
          ? Math.round(
              Math.max(
                0,
                actual[i] +
                  (0.7 * t) / c.duration_steps +
                  normal(reportRandom) * 0.15,
              ) * 2,
            ) / 2
          : 0;
      if (c.scenario === "S1") {
        missing[i] = reportRandom() < 0.14;
        delayed[i] = reportRandom() < 0.1;
        if (missing[i] || delayed[i]) reported[i] = previous[i];
      }
      stale[i] = missing[i] || delayed[i] ? stale[i] + 1 : 0;
      energy[i] += reported[i] * dt;
      if (active[i] && c.falsification_class === "F1")
        energy[i] -= Math.abs(c.telemetry_distortion) * baseline[i] * dt;
    });
    const measured = actual.map((p) =>
      Math.max(0, p + normal(sensorRandom) * c.sensor_noise_kw),
    );
    const predictions = Array(n).fill(false) as boolean[],
      d1 = Array(n).fill(false) as boolean[],
      d3 = Array(n).fill(false) as boolean[];
    const stations: Station[] = actual.map((p, i) => {
      const sid = `EVSE-${String(i + 1).padStart(3, "0")}`,
        fid = `FDR-${String(feederIds[i] + 1).padStart(2, "0")}`;
      const reasons: string[] = [];
      if (t) {
        if (reported[i] < -0.1 || reported[i] > c.charger_rating_kw + 0.5)
          reasons.push("Reported power exceeds device range");
        if (energy[i] < previousEnergy[i] - 0.001)
          reasons.push("Energy register decreased");
        if (
          Math.abs(energy[i] - previousEnergy[i] - reported[i] * dt) >
          Math.max(0.1, c.charger_rating_kw * dt * 0.15)
        )
          reasons.push("Energy increment disagrees with reported power");
        if (Math.abs(reported[i] - previous[i]) > c.charger_rating_kw * 0.65)
          reasons.push("Reported power jump exceeds tolerance");
        if (stale[i] >= 2) reasons.push("Telemetry stale for two intervals");
      }
      const residual = coverage.has(i) ? measured[i] - reported[i] : null;
      streak[i] =
        residual !== null && Math.abs(residual) > c.detection_threshold_kw
          ? streak[i] + 1
          : 0;
      const flags: [string, string[]][] = [
        ["D1", reasons],
        [
          "D3",
          streak[i] >= c.sustained_steps
            ? ["Independent station meter disagrees with reported power"]
            : [],
        ],
      ];
      flags.forEach(([detector, why]) => {
        if (!why.length) return;
        predictions[i] = true;
        if (detector === "D1") d1[i] = true;
        else d3[i] = true;
        const key = sid + detector;
        if (!issued.has(key)) {
          issued.add(key);
          alerts.push({
            id: `AL-${alerts.length + 1}`,
            step: t,
            timestamp_s: t * c.step_seconds,
            station_id: sid,
            feeder_id: fid,
            detector,
            severity: detector === "D3" ? "critical" : "warning",
            explanation: why.join("; "),
            observed: {
              reported_kw: reported[i],
              independent_kw: coverage.has(i) ? measured[i] : null,
            },
            status: "open",
          });
        }
        if (!detected[i]) {
          detected[i] = true;
          if (c.defenses.auto_quarantine)
            due[i] = t + Math.max(1, c.mitigation_delay_steps);
        }
      });
      if (!t) {
        event(t, i, "BootNotification", {
          vendor: "Synthetic EVSE",
          model: "GS-22",
        });
        event(t, i, "StatusNotification", {
          status: p > 0 ? "Charging" : "Available",
        });
        if (connected[i])
          event(t, i, "StartTransaction", {
            transactionId: i + 1,
            meterStart_kwh: 0,
          });
      }
      if (t === c.onset_step && exposed.has(i))
        event(t, i, "FirmwareStatusNotification", {
          status: accepted ? "Installed" : "Rejected",
          manifest: {
            signature_valid: c.signature_valid,
            version_monotonic: c.version_monotonic,
            hardware_compatible: c.hardware_compatible,
          },
        });
      if (t % 10 === 0)
        event(t, i, "Heartbeat", { virtual_time_s: t * c.step_seconds });
      if (!missing[i]) {
        const payload = {
          power_kw: reported[i],
          energy_kwh: energy[i],
          status: reported[i] > 0 ? "Charging" : "Available",
          delayed: delayed[i],
          clock_skew_s: c.scenario === "S2" ? 15 : 0,
        };
        event(
          t,
          i,
          "MeterValues",
          payload,
          reasons.length ? "anomaly" : "valid",
          reasons.length ? "warning" : "info",
        );
        if (c.scenario === "S1" && reportRandom() < 0.06)
          event(
            t,
            i,
            "MeterValues",
            { ...payload, duplicate: true },
            "duplicate",
          );
      }
      if (t && isolated[i] && !frames[t - 1].stations[i].contained) {
        event(t, i, "StopTransaction", {
          transactionId: i + 1,
          reason: "Independent isolation",
        });
        event(t, i, "StatusNotification", { status: "Unavailable" });
      }
      if (t === c.duration_steps - 1 && connected[i] && !isolated[i])
        event(t, i, "StopTransaction", {
          transactionId: i + 1,
          reason: "Experiment complete",
        });
      return {
        id: sid,
        feeder_id: fid,
        rating_kw: c.charger_rating_kw,
        vehicle_present: connected[i],
        vehicle_acceptance_kw: feasible[i],
        baseline_power_kw: baseline[i],
        actual_power_kw: p,
        reported_power_kw: reported[i],
        independent_measured_power_kw: coverage.has(i) ? measured[i] : null,
        firmware_state: recovered[i]
          ? "Recovered"
          : compromised[i] && t >= c.onset_step
            ? "Unverified"
            : exposed.has(i) && !accepted && t >= c.onset_step
              ? "Rejected"
              : "Verified",
        compromised: compromised[i] && !recovered[i] && t >= c.onset_step,
        physical_authority: c.physical_authority && c.scenario !== "S3",
        detected: detected[i],
        contained: isolated[i],
        status: isolated[i]
          ? "Quarantined"
          : p > 0.1
            ? "Charging"
            : "Available",
      };
    });
    const feeders: Feeder[] = Array.from({ length: c.feeder_count }, (_, f) => {
      const id = `FDR-${String(f + 1).padStart(2, "0")}`,
        ev = sum(actual.filter((_, i) => feederIds[i] === f)),
        p = c.feeder_base_kw + ev,
        s = Math.hypot(p, q),
        expected =
          c.feeder_base_kw + sum(reported.filter((_, i) => feederIds[i] === f)),
        independent = Array.from(coverage).some((i) => feederIds[i] === f)
          ? p + normal(sensorRandom) * c.sensor_noise_kw
          : null,
        residual = independent === null ? null : independent - expected;
      fStreak[f] =
        residual !== null && Math.abs(residual) > c.detection_threshold_kw
          ? fStreak[f] + 1
          : 0;
      if (fStreak[f] >= c.sustained_steps && !issued.has(id)) {
        issued.add(id);
        alerts.push({
          id: `AL-${alerts.length + 1}`,
          step: t,
          timestamp_s: t * c.step_seconds,
          station_id: null,
          feeder_id: id,
          detector: "D2",
          severity: "critical",
          explanation:
            "Sustained independent feeder residual; station attribution requires independent station sensing.",
          observed: {
            residual_kw: residual,
            expected_kw: expected,
            independent_kw: independent,
          },
          status: "open",
        });
      }
      return {
        id,
        base_kw: c.feeder_base_kw,
        charger_kw: ev,
        active_kw: p,
        reactive_kvar: q,
        apparent_kva: s,
        capacity_kva: c.feeder_capacity_kva,
        loading_pct: (s / c.feeder_capacity_kva) * 100,
        voltage_pu: Math.sqrt(
          Math.max(
            0,
            1 -
              2 *
                ((0.025 * p) / c.feeder_capacity_kva +
                  (0.015 * q) / c.feeder_capacity_kva),
          ),
        ),
        threshold_pct: 100,
        independent_kw: independent,
        residual_kw: residual,
      };
    });
    const physical =
      active.some((a) => a) && c.physical_authority && c.scenario !== "S3";
    frames.push({
      step: t,
      time_s: t * c.step_seconds,
      baseline_power_kw: sum(baseline),
      actual_power_kw: sum(actual),
      reported_power_kw: sum(reported),
      independent_measured_power_kw: coverage.size
        ? sum(measured.filter((_, i) => coverage.has(i)))
        : null,
      delta_power_kw: sum(actual.map((p, i) => p - baseline[i])),
      active_stations: actual.filter((p) => p > 0.1).length,
      max_loading_pct: Math.max(...feeders.map((f) => f.loading_pct)),
      min_voltage_pu: Math.min(...feeders.map((f) => f.voltage_pu)),
      stations,
      feeders,
      labels: active.map(
        (a, i) =>
          a &&
          ((c.telemetry_distortion !== 0 && baseline[i] > 0) ||
            (physical && Math.abs(actual[i] - baseline[i]) > 0.01)),
      ),
      predictions,
      d1,
      d3,
      gates: [
        exposed.size > 0 && t >= c.onset_step,
        compromised.some(Boolean) && t >= c.onset_step,
        active.some(Boolean),
        active.some(Boolean) && c.telemetry_distortion !== 0,
        physical,
        physical && actual.some((p, i) => Math.abs(p - baseline[i]) > 0.01),
        physical &&
          feeders.some((f) => f.loading_pct > 100 || f.voltage_pu < 0.95),
      ],
    });
    previous = reported.slice();
    previousEnergy = energy.slice();
  }
  return { frames, events, alerts };
}
function evaluate(labels: boolean[], predicted: boolean[]): Evaluation {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  labels.forEach((y, i) => {
    if (y && predicted[i]) tp++;
    else if (y) fn++;
    else if (predicted[i]) fp++;
    else tn++;
  });
  return {
    true_positives: tp,
    false_positives: fp,
    true_negatives: tn,
    false_negatives: fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    f1_score: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : null,
    false_positive_rate: fp + tn ? fp / (fp + tn) : null,
    undefined_reason: "N/A means zero denominator; no relevant observations.",
  };
}
function result(saved: Saved) {
  let r = cache.get(saved.id);
  if (!r) {
    r = simulate(saved.config, saved.actions);
    cache.set(saved.id, r);
    if (cache.size > 6) cache.delete(cache.keys().next().value!);
  }
  return r;
}
function detail(saved: Saved): Run {
  const r = result(saved),
    frames = r.frames.slice(0, saved.cursor + 1),
    current = frames[frames.length - 1];
  const labels = frames.flatMap((f) => f.labels);
  const delays: number[] = [];
  let missed = 0;
  current.stations.forEach((s, i) => {
    const onset = frames.find((f) => f.labels[i]);
    if (!onset) return;
    const alert = r.alerts.find(
      (a) =>
        a.station_id === s.id && a.step >= onset.step && a.step <= saved.cursor,
    );
    if (alert)
      delays.push((alert.step - onset.step) * saved.config.step_seconds);
    else missed++;
  });
  const m: Metrics = {
    ...evaluate(
      labels,
      frames.flatMap((f) => f.predictions),
    ),
    by_detector: {
      D1: evaluate(
        labels,
        frames.flatMap((f) => f.d1),
      ),
      D3: evaluate(
        labels,
        frames.flatMap((f) => f.d3),
      ),
    },
    peak_deviation_kw: Math.max(
      ...frames.map((f) => Math.abs(f.delta_power_kw)),
    ),
    peak_loading_pct: Math.max(...frames.map((f) => f.max_loading_pct)),
    min_voltage_pu: Math.min(...frames.map((f) => f.min_voltage_pu)),
    energy_displaced_kwh:
      (sum(frames.map((f) => f.delta_power_kw)) * saved.config.step_seconds) /
      3600,
    overload_duration_s:
      frames.filter((f) => f.max_loading_pct > 100).length *
      saved.config.step_seconds,
    detection_delay_s: delays.length ? sum(delays) / delays.length : null,
    undetected_stations: missed,
    contained_stations: current.stations.filter((s) => s.contained).length,
    telemetry_mae_kw:
      sum(
        frames.map((f) =>
          sum(
            f.stations.map((s) =>
              Math.abs(s.actual_power_kw - s.reported_power_kw),
            ),
          ),
        ),
      ) /
      (frames.length * saved.config.fleet_size),
  };
  const visible = r.alerts
    .filter((a) => a.step <= saved.cursor)
    .map((a) => ({
      ...a,
      status:
        a.station_id &&
        current.stations.find((s) => s.id === a.station_id)?.contained
          ? "contained"
          : a.station_id &&
              current.stations.find((s) => s.id === a.station_id)
                ?.firmware_state === "Recovered"
            ? "resolved"
            : "open",
    }));
  return { ...saved, frame: current, metrics: m, alerts: visible, assumptions };
}
function create(config: Config, completed = false): Saved {
  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    config: checkedConfig(config),
    cursor: completed ? config.duration_steps - 1 : 0,
    status: completed ? "completed" : "paused",
    actions: [],
  };
}
function series(saved: Saved): Point[] {
  return result(saved)
    .frames.slice(0, saved.cursor + 1)
    .map((f) => ({
      step: f.step,
      time_s: f.time_s,
      baseline_power_kw: f.baseline_power_kw,
      actual_power_kw: f.actual_power_kw,
      reported_power_kw: f.reported_power_kw,
      independent_measured_power_kw: f.independent_measured_power_kw,
      delta_power_kw: f.delta_power_kw,
      active_stations: f.active_stations,
      max_loading_pct: f.max_loading_pct,
      min_voltage_pu: f.min_voltage_pu,
    }));
}
export async function previewApi<T>(path: string, body?: unknown): Promise<T> {
  // Yield to render the computing state before a bounded experiment is generated.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const url = new URL(path, "http://local"),
    parts = url.pathname.split("/").filter(Boolean),
    runs = read();
  let out: unknown;
  const get = (id: string | null) => {
    const r = runs.find((x) => x.id === id) ?? (!id ? runs[0] : undefined);
    if (!r)
      throw new Error("No simulation found. Create a run in Scenario Lab.");
    return r;
  };
  if (parts[0] === "health") out = { status: "ok", mode: "synthetic-browser" };
  else if (parts[0] === "scenarios")
    out = scenarios.map(([id, name, description]) => ({
      id,
      name,
      description,
    }));
  else if (parts[0] === "simulations" && parts.length === 1) {
    if (body) {
      const r = create(body as Config);
      runs.unshift(r);
      save(runs);
      out = detail(r);
    } else
      out = runs.map(({ actions: _, ...summary }) => {
        void _;
        return summary;
      });
  } else if (parts[0] === "simulations" && parts[1] === "compare") {
    const request = body as { config: Config; mode: string },
      a = structuredClone(request.config),
      b = structuredClone(request.config);
    if (request.mode === "defenses") {
      a.defenses = {
        ...a.defenses,
        firmware_verification: false,
        external_limiter: false,
        canary_rollout: false,
        auto_quarantine: false,
      };
    } else if (request.mode === "concentration") {
      a.concentration = 0;
      b.concentration = 1;
    } else if (request.mode === "sensing") {
      a.sensing_coverage = 0;
      b.sensing_coverage = 1;
      a.defenses.independent_metering = b.defenses.independent_metering = true;
    } else {
      a.compromised_fraction = 0.1;
      b.compromised_fraction = 0.8;
    }
    const left = create(a, true),
      right = create(b, true);
    runs.unshift(right, left);
    save(runs);
    out = {
      mode: request.mode,
      left: detail(left),
      right: detail(right),
      seed_matched: true,
    };
  } else if (parts[0] === "simulations") {
    const r = get(parts[1]);
    const command = body as { steps?: number; action?: string };
    if (parts[2] === "step") {
      r.cursor = Math.min(
        r.config.duration_steps - 1,
        r.cursor + (command.steps ?? 1),
      );
      if (r.cursor === r.config.duration_steps - 1) r.status = "completed";
      save(runs);
      out = detail(r);
    } else if (parts[2] === "control") {
      if (command.action === "reset") {
        r.cursor = 0;
        r.status = "paused";
        r.actions = [];
        cache.delete(r.id);
      } else if (command.action === "finish") {
        r.cursor = r.config.duration_steps - 1;
        r.status = "completed";
      } else if (r.status !== "completed")
        r.status = command.action === "resume" ? "playing" : "paused";
      save(runs);
      out = detail(r);
    } else if (parts[2] === "stations") {
      if (r.status === "completed")
        throw new Error(
          "Reset or create a fresh run before applying containment.",
        );
      if (!result(r).frames[0].stations.some((s) => s.id === parts[3]))
        throw new Error("Station not found");
      r.actions.push({
        step: r.cursor + 1,
        station_id: parts[3],
        action: command.action!,
      });
      cache.delete(r.id);
      save(runs);
      out = detail(r);
    } else if (parts[2] === "timeseries") out = series(r);
    else if (parts[2] === "events")
      out = result(r)
        .events.filter((e) => e.step <= r.cursor)
        .slice(-250)
        .reverse();
    else if (parts[2] === "metrics") out = detail(r).metrics;
    else if (parts[2] === "alerts") out = detail(r).alerts;
    else out = detail(r);
  } else if (parts[0] === "stations") {
    const r = get(url.searchParams.get("run_id")),
      f = result(r).frames[r.cursor];
    if (parts[1]) {
      const station = f.stations.find((s) => s.id === parts[1]);
      if (!station) throw new Error("Station not found");
      out = {
        station,
        events: result(r).events.filter(
          (e) => e.station_id === station.id && e.step <= r.cursor,
        ),
      };
    } else out = f.stations;
  } else if (parts[0] === "feeders")
    out = result(get(url.searchParams.get("run_id"))).frames[
      get(url.searchParams.get("run_id")).cursor
    ].feeders;
  else throw new Error("Unsupported browser simulation operation");
  return out as T;
}
export function exportPreview(id: string, format: string) {
  const saved = read().find((r) => r.id === id);
  if (!saved || saved.status !== "completed")
    throw new Error("Finish the experiment before exporting.");
  const run = detail(saved);
  let content: string;
  const escape = (s: string) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  if (format === "csv") {
    const rows = series(saved),
      keys = Object.keys(rows[0]) as (keyof Point)[];
    content =
      `# GridSentinel browser synthetic [S] report\n# ${saved.created_at}\n# Configuration: ${JSON.stringify(saved.config)}\n# Metrics: ${JSON.stringify(run.metrics)}\n${assumptions.map((a) => "# " + a).join("\n")}\n` +
      keys.join(",") +
      "\n" +
      rows.map((row) => keys.map((k) => row[k] ?? "").join(",")).join("\n");
  } else if (format === "html")
    content = `<!doctype html><html lang="en"><meta charset="utf-8"><title>GridSentinel report</title><style>body{font:14px system-ui;max-width:1000px;margin:40px auto;padding:20px;color:#20252b}h1{color:#275d78}pre{white-space:pre-wrap;background:#f5f6f7;padding:18px}li{margin:8px 0}</style><h1>GridSentinel · Browser experiment [S]</h1><p>${escape(saved.id)} · ${escape(saved.created_at)}</p><h2>Configuration and seed</h2><pre>${escape(JSON.stringify(saved.config, null, 2))}</pre><h2>Computed metrics</h2><pre>${escape(JSON.stringify(run.metrics, null, 2))}</pre><h2>Assumptions and limitations</h2><ul>${assumptions.map((a) => "<li>" + escape(a) + "</li>").join("")}</ul><h2>Alerts</h2><pre>${escape(JSON.stringify(run.alerts, null, 2))}</pre></html>`;
  else
    content = JSON.stringify(
      {
        ...run,
        events: result(saved).events,
        injection_log: result(saved).frames.flatMap((f) =>
          f.labels
            .map((label, i) =>
              label
                ? {
                    step: f.step,
                    station_id: f.stations[i].id,
                    label: "synthetic injected anomaly",
                  }
                : null,
            )
            .filter(Boolean),
        ),
        timeseries: series(saved),
      },
      null,
      2,
    );
  const url = URL.createObjectURL(
    new Blob([content], {
      type:
        format === "html"
          ? "text/html"
          : format === "csv"
            ? "text/csv"
            : "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `gridsentinel-${id.slice(0, 8)}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
