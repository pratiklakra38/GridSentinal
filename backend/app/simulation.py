"""Synthetic offline experiment engine. Detector inputs never include injection labels."""
import math

import numpy as np

from .detection import evaluation, validate_telemetry
from .schemas import Config

SCENARIOS = [
    ('S0', 'Normal operation', 'Baseline fleet with accurate reporting.'),
    ('S1', 'Communication faults', 'Benign missing, delayed and duplicate messages.'),
    ('S2', 'Sensor inaccuracy', 'Benign meter drift, noise, quantization and clock skew.'),
    ('S3', 'Telemetry manipulation only', 'Falsified reports; physical demand remains at baseline.'),
    ('S4', 'Authorized load change', 'Legitimate demand adjustment with accurate reporting.'),
    ('S5', 'Coordinated load deviation', 'Conditional power control with falsified telemetry.'),
    ('S6', 'Partial fleet compromise', 'Explore the affected fraction and charging headroom.'),
    ('S7', 'Geographic concentration', 'Compare feeder placement at equal fleet demand.'),
    ('S8', 'Independent sensing coverage', 'Compare coverage of trustworthy independent meters.'),
    ('S9', 'Defensive mitigation', 'Matched-seed comparison of protective controls.'),
]
ASSUMPTIONS = [
    'Synthetic [S] outputs from this implementation; the source paper contains no completed experiments.',
    'Fixed vehicle presence per run, sinusoidal baseline demand and a mild acceptance taper; no calibrated arrival model.',
    'EV reactive demand is negligible. Base-load Q = Pbase × tan(acos(power factor)); S = hypot(P, Q) in kVA.',
    'Voltage is linearized DistFlow screening: V ≈ sqrt(1 - 2(r Ppu + x Qpu)), r=0.025 pu, x=0.015 pu, Sbase=feeder capacity.',
    'No full AC load flow, transformer thermal dynamics, bulk-grid frequency model or real infrastructure connections.',
    'D1 intra-device rules, D2 sustained feeder residual and D3 sustained station cross-layer heuristic; no trained ML/CUSUM.',
    'D2 feeder meters are available on feeders containing covered stations; D3 requires station metering. No residual extrapolation.',
    'Firmware checks use inert Boolean manifest metadata, not cryptographic verification; valid malicious signatures remain a residual risk.',
    'Quarantine and external limiting represent independent upstream actuation. Controller commands are advisory and not used as guarantees.',
]


def generate(config: Config, actions=None):
    c = config
    n = c.fleet_size
    fleet_rng, baseline_rng, report_rng, sensor_rng = [np.random.default_rng(s) for s in np.random.SeedSequence(c.seed).spawn(4)]
    connected = fleet_rng.random(n) < c.connection_rate
    acceptance = np.minimum(c.charger_rating_kw, c.vehicle_acceptance_kw * fleet_rng.uniform(0.8, 1, n)) * connected
    order = fleet_rng.permutation(n)
    targets = np.zeros(n, dtype=bool)
    targets[order[:round(n * c.compromised_fraction)]] = True
    candidate = targets & (c.scenario in ['S3', 'S5', 'S6', 'S7', 'S8', 'S9'])
    exposed = candidate.copy()
    if c.defenses.canary_rollout:
        exposed[:] = False
        exposed[order[:round(n * c.compromised_fraction * c.defenses.canary_fraction)]] = candidate[order[:round(n * c.compromised_fraction * c.defenses.canary_fraction)]]
    manifest_valid = c.signature_valid and c.version_monotonic and c.hardware_compatible
    compromised = exposed & (not c.defenses.firmware_verification or manifest_valid)
    feeder = np.arange(n) % c.feeder_count
    # Moving only targeted devices preserves total fleet physics in concentration comparisons.
    concentrate_ids = np.flatnonzero(targets)[:round(int(targets.sum()) * c.concentration)]
    feeder[concentrate_ids] = 0
    offsets = fleet_rng.integers(0, c.trigger_dispersion_steps + 1, n)
    phase = baseline_rng.uniform(-0.25, 0.25, n)
    covered = np.zeros(n, dtype=bool)
    covered[order[:round(n * c.sensing_coverage)]] = c.defenses.independent_metering
    qbase = c.feeder_base_kw * math.tan(math.acos(c.base_power_factor))
    quarantined = np.zeros(n, dtype=bool)
    recovery_block = np.zeros(n, dtype=bool)
    detected_at = np.full(n, -1, dtype=int)
    due = np.full(n, -1, dtype=int)
    previous_power = np.zeros(n)
    previous_energy = np.zeros(n)
    energy = np.zeros(n)
    stale = np.zeros(n, dtype=int)
    streak = np.zeros(n, dtype=int)
    feeder_streak = np.zeros(c.feeder_count, dtype=int)
    issued = set()
    frames, events, alerts, injection_log = [], [], [], []
    dt = c.step_seconds / 3600
    action_schedule = actions or []

    def event(t, i, kind, payload, validation='valid', severity='info'):
        events.append({'id': f'EV-{len(events)+1:06}', 'step': t, 'timestamp_s': t*c.step_seconds,
                       'station_id': f'EVSE-{i+1:03}', 'type': kind, 'payload': payload,
                       'validation': validation, 'severity': severity})

    for t in range(c.duration_steps):
        for a in action_schedule:
            if a['step'] == t:
                i = int(a['station_id'].split('-')[1])-1
                quarantined[i] = a['action'] == 'quarantine'
                recovery_block[i] = a['action'] == 'recover'
                due[i] = -1
                event(t, i, 'DefenseAction', {'action': a['action'], 'actuation': 'independent upstream isolation / verified recovery'})
        automatic = (due >= 0) & (due <= t) & ~quarantined & ~recovery_block
        for i in np.flatnonzero(automatic):
            event(t, i, 'DefenseAction', {'action': 'quarantine', 'actuation': 'independent upstream isolation'})
        quarantined |= automatic
        feasible = acceptance * (1 - 0.08 * t / c.duration_steps)
        baseline = np.clip(feasible * c.baseline_fraction * (1 + 0.06*np.sin(t/8 + phase)), 0, feasible)
        ramp = np.clip((t-c.onset_step-offsets+1)/c.ramp_steps, 0, 1)
        ramp *= t < c.onset_step + c.attack_duration_steps
        active = compromised & (ramp > 0) & ~quarantined & ~recovery_block
        authority = active & c.physical_authority & (c.scenario != 'S3')
        delta = np.where(c.load_change_fraction >= 0, (feasible-baseline)*c.load_change_fraction, baseline*c.load_change_fraction)
        actual = np.clip(baseline + authority*delta*ramp, 0, feasible)
        if c.scenario == 'S4':
            actual = np.clip(baseline + targets*delta*ramp, 0, feasible)
        actual[quarantined] = 0
        if c.defenses.external_limiter:
            active_budget = max(0, math.sqrt(max(0, (c.feeder_capacity_kva*c.defenses.limiter_fraction)**2-qbase**2))-c.feeder_base_kw)
            for f in range(c.feeder_count):
                ids = feeder == f
                total = float(actual[ids].sum())
                if total > active_budget:
                    actual[ids] *= active_budget/total
        report = actual.copy()
        report[active] = baseline[active]*(1+c.telemetry_distortion)
        if c.scenario == 'S2':
            report = np.round(np.maximum(0, actual + 0.7*t/c.duration_steps + report_rng.normal(0, 0.15, n))*2)/2
            report[~connected] = 0
        missing = (report_rng.random(n) < 0.14) if c.scenario == 'S1' else np.zeros(n, dtype=bool)
        delayed = (report_rng.random(n) < 0.1) if c.scenario == 'S1' else np.zeros(n, dtype=bool)
        report[missing | delayed] = previous_power[missing | delayed]
        stale = np.where(missing | delayed, stale+1, 0)
        energy += report*dt
        if c.falsification_class == 'F1':
            energy[active] -= abs(c.telemetry_distortion)*baseline[active]*dt
        measured_raw = np.maximum(0, actual + sensor_rng.normal(0, c.sensor_noise_kw, n))
        station_predictions = np.zeros(n, dtype=bool)
        detector_predictions = {'D1': np.zeros(n, dtype=bool), 'D3': np.zeros(n, dtype=bool)}
        stations, feeders = [], []
        if active.any():
            injection_log.append({'step': t, 'station_ids': [f'EVSE-{i+1:03}' for i in np.flatnonzero(active)], 'label': 'synthetic unauthorized falsification or deviation'})
        for i in range(n):
            sid = f'EVSE-{i+1:03}'
            status = 'Charging' if report[i] > 0.1 else 'Available'
            reasons = validate_telemetry(float(report[i]), float(energy[i]), float(previous_energy[i]), float(previous_power[i]), c.charger_rating_kw, status, dt, int(stale[i])) if t else []
            residual = float(measured_raw[i]-report[i]) if covered[i] else None
            streak[i] = streak[i]+1 if residual is not None and abs(residual) > c.detection_threshold_kw else 0
            flags = [('D1', reasons)]
            if streak[i] >= c.sustained_steps:
                flags.append(('D3', ['Independent station measurement disagrees with device telemetry']))
            for detector, why in flags:
                if not why:
                    continue
                station_predictions[i] = True
                detector_predictions[detector][i] = True
                if (i, detector) not in issued:
                    issued.add((i, detector))
                    alerts.append({'id': f'AL-{len(alerts)+1:05}', 'step': t, 'timestamp_s': t*c.step_seconds,
                                   'station_id': sid, 'feeder_id': f'FDR-{feeder[i]+1:02}', 'detector': detector,
                                   'severity': 'critical' if detector == 'D3' else 'warning', 'explanation': '; '.join(why),
                                   'observed': {'reported_kw': float(report[i]), 'independent_kw': float(measured_raw[i]) if covered[i] else None}, 'status': 'open'})
                if detected_at[i] < 0:
                    detected_at[i] = t
                    if c.defenses.auto_quarantine:
                        due[i] = t + max(1, c.mitigation_delay_steps)
            if t == 0:
                event(t, i, 'BootNotification', {'vendor': 'Synthetic EVSE', 'model': 'GS-22'})
                event(t, i, 'StatusNotification', {'status': status})
                if connected[i]:
                    event(t, i, 'StartTransaction', {'transactionId': i+1, 'meterStart_kwh': 0})
            if t == c.onset_step and exposed[i]:
                event(t, i, 'FirmwareStatusNotification', {'status': 'Rejected' if not compromised[i] else 'Installed', 'manifest': {'signature_valid': c.signature_valid, 'version_monotonic': c.version_monotonic, 'hardware_compatible': c.hardware_compatible}}, severity='warning' if compromised[i] else 'info')
            if t % 10 == 0:
                event(t, i, 'Heartbeat', {'virtual_time_s': t*c.step_seconds})
            if not missing[i]:
                payload = {'power_kw': float(report[i]), 'energy_kwh': float(energy[i]), 'status': status, 'clock_skew_s': 15 if c.scenario == 'S2' else 0, 'delayed': bool(delayed[i])}
                event(t, i, 'MeterValues', payload, 'anomaly' if reasons else 'valid', 'warning' if reasons else 'info')
                if c.scenario == 'S1' and report_rng.random() < 0.06:
                    event(t, i, 'MeterValues', {**payload, 'duplicate': True}, 'duplicate', 'info')
            if t > 0 and (quarantined[i] and frames[-1]['stations'][i]['status'] != 'Quarantined'):
                event(t, i, 'StopTransaction', {'transactionId': i+1, 'reason': 'Independent isolation'})
                event(t, i, 'StatusNotification', {'status': 'Unavailable'})
            if t == c.duration_steps-1 and connected[i] and not quarantined[i]:
                event(t, i, 'StopTransaction', {'transactionId': i+1, 'reason': 'Experiment complete'})
            stations.append({'id': sid, 'feeder_id': f'FDR-{feeder[i]+1:02}', 'rating_kw': c.charger_rating_kw,
                             'vehicle_present': bool(connected[i]), 'vehicle_acceptance_kw': float(feasible[i]),
                             'baseline_power_kw': float(baseline[i]), 'actual_power_kw': float(actual[i]),
                             'reported_power_kw': float(report[i]), 'independent_measured_power_kw': float(measured_raw[i]) if covered[i] else None,
                             'firmware_state': 'Recovered' if recovery_block[i] else 'Unverified' if compromised[i] else 'Rejected' if exposed[i] else 'Verified',
                             'compromised': bool(compromised[i] and not recovery_block[i]), 'physical_authority': bool(c.physical_authority and c.scenario != 'S3'),
                             'detected': bool(detected_at[i] >= 0), 'contained': bool(quarantined[i]),
                             'status': 'Quarantined' if quarantined[i] else 'Charging' if actual[i] > 0.1 else 'Available'})
        for f in range(c.feeder_count):
            ids = feeder == f
            p = c.feeder_base_kw + float(actual[ids].sum())
            s = math.hypot(p, qbase)
            expected = c.feeder_base_kw + float(report[ids].sum())
            independent = p + float(sensor_rng.normal(0, c.sensor_noise_kw)) if covered[ids].any() else None
            residual = independent-expected if independent is not None else None
            feeder_streak[f] = feeder_streak[f]+1 if residual is not None and abs(residual) > c.detection_threshold_kw else 0
            if feeder_streak[f] >= c.sustained_steps and ('feeder', f) not in issued:
                issued.add(('feeder', f))
                alerts.append({'id': f'AL-{len(alerts)+1:05}', 'step': t, 'timestamp_s': t*c.step_seconds,
                               'station_id': None, 'feeder_id': f'FDR-{f+1:02}', 'detector': 'D2', 'severity': 'critical',
                               'explanation': 'Sustained independent feeder residual exceeds threshold; attribution requires station sensing.',
                               'observed': {'residual_kw': residual, 'expected_kw': expected, 'independent_kw': independent}, 'status': 'open'})
            v = math.sqrt(max(0, 1-2*(0.025*p/c.feeder_capacity_kva+0.015*qbase/c.feeder_capacity_kva)))
            feeders.append({'id': f'FDR-{f+1:02}', 'base_kw': c.feeder_base_kw, 'charger_kw': float(actual[ids].sum()),
                            'active_kw': p, 'reactive_kvar': qbase, 'apparent_kva': s, 'capacity_kva': c.feeder_capacity_kva,
                            'loading_pct': s/c.feeder_capacity_kva*100, 'voltage_pu': v, 'threshold_pct': 100,
                            'independent_kw': independent, 'residual_kw': residual})
        frames.append({'step': t, 'time_s': t*c.step_seconds, 'baseline_power_kw': float(baseline.sum()),
                       'actual_power_kw': float(actual.sum()), 'reported_power_kw': float(report.sum()),
                       'independent_measured_power_kw': float(measured_raw[covered].sum()) if covered.any() else None,
                       'delta_power_kw': float((actual-baseline).sum()), 'active_stations': int((actual > 0.1).sum()),
                       'max_loading_pct': max(f['loading_pct'] for f in feeders), 'min_voltage_pu': min(f['voltage_pu'] for f in feeders),
                       'stations': stations, 'feeders': feeders, 'labels': active.tolist(), 'predictions': station_predictions.tolist(),
                       'detector_predictions': {d: p.tolist() for d, p in detector_predictions.items()},
                       'gates': [bool(candidate.any()), bool(compromised.any()), bool(active.any()), bool(active.any() and c.telemetry_distortion != 0),
                                 bool(authority.any()), bool(np.abs(actual-baseline).sum() > 0.01),
                                 bool(authority.any() and any(f['loading_pct'] > 100 or f['voltage_pu'] < 0.95 for f in feeders))]})
        previous_power = report.copy()
        previous_energy = energy.copy()
    return {'frames': frames, 'events': events, 'alerts': alerts, 'injection_log': injection_log, 'actions': action_schedule}


def metrics(result, config: Config, cursor):
    frames = result['frames'][:cursor+1]
    labels = [y for f in frames for y in f['labels']]
    predictions = [p for f in frames for p in f['predictions']]
    output = evaluation(labels, predictions)
    output['by_detector'] = {d: evaluation(labels, [p for f in frames for p in f['detector_predictions'][d]]) for d in ['D1', 'D3']}
    # D2 has feeder-level attribution, so it is intentionally excluded from station metrics.
    injected = {(sid, x['step']) for x in result['injection_log'] if x['step'] <= cursor for sid in x['station_ids']}
    delays = []
    for sid in {sid for sid, _ in injected}:
        onset = min(t for s, t in injected if s == sid)
        alarms = [a['step'] for a in result['alerts'] if a['station_id'] == sid and onset <= a['step'] <= cursor]
        if alarms:
            delays.append((min(alarms)-onset)*config.step_seconds)
    output.update({'peak_deviation_kw': max(abs(f['delta_power_kw']) for f in frames),
                   'peak_loading_pct': max(f['max_loading_pct'] for f in frames),
                   'min_voltage_pu': min(f['min_voltage_pu'] for f in frames),
                   'energy_displaced_kwh': sum(f['delta_power_kw'] for f in frames)*config.step_seconds/3600,
                   'overload_duration_s': sum(f['max_loading_pct'] > 100 for f in frames)*config.step_seconds,
                   'detection_delay_s': float(np.mean(delays)) if delays else None,
                   'undetected_stations': len({s for s, _ in injected})-len(delays),
                   'contained_stations': sum(s['contained'] for s in frames[-1]['stations']),
                   'telemetry_mae_kw': float(np.mean([abs(s['actual_power_kw']-s['reported_power_kw']) for f in frames for s in f['stations']]))})
    return output
