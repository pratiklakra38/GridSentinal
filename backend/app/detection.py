import math


def validate_telemetry(power, energy, previous_energy, previous_power, rating, status, dt_hours, stale):
    reasons = []
    if not math.isfinite(power) or power < -0.1 or power > rating + 0.5:
        reasons.append('Reported power outside device rating')
    if energy < previous_energy - 0.001:
        reasons.append('Energy register decreased')
    if abs((energy - previous_energy) - power * dt_hours) > max(0.1, rating * dt_hours * 0.15):
        reasons.append('Energy increment disagrees with reported power integral')
    if (status == 'Available' and power > 0.5) or (status == 'Charging' and power < 0.1):
        reasons.append('Reported connector status disagrees with power')
    if abs(power - previous_power) > rating * 0.65:
        reasons.append('Reported power changed beyond configured ramp tolerance')
    if stale >= 2:
        reasons.append('Telemetry missing or outdated for two intervals')
    return reasons


def evaluation(labels, predictions):
    tp = sum(bool(y) and bool(p) for y, p in zip(labels, predictions, strict=True))
    fp = sum(not y and bool(p) for y, p in zip(labels, predictions, strict=True))
    tn = sum(not y and not p for y, p in zip(labels, predictions, strict=True))
    fn = sum(bool(y) and not p for y, p in zip(labels, predictions, strict=True))
    return {
        'true_positives': tp, 'false_positives': fp, 'true_negatives': tn, 'false_negatives': fn,
        'precision': tp / (tp + fp) if tp + fp else None,
        'recall': tp / (tp + fn) if tp + fn else None,
        'f1_score': 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
        'false_positive_rate': fp / (fp + tn) if fp + tn else None,
        'evaluation_unit': 'station × simulation step; benign communication/sensor faults are negative labels',
        'undefined_reason': 'N/A means the metric denominator is zero; no relevant observations.',
    }
