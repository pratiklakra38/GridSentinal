import math

import pytest

from app.detection import evaluation, validate_telemetry
from app.schemas import Config, Defenses
from app.simulation import generate, metrics


def config(**kwargs):
    return Config(fleet_size=12, trigger_dispersion_steps=0, sensor_noise_kw=0, **kwargs)


def test_deterministic():
    c = config(scenario='S5')
    assert generate(c) == generate(c)


@pytest.mark.parametrize('scenario', [f'S{i}' for i in range(10)])
def test_physical_bounds(scenario):
    c = config(scenario=scenario)
    r = generate(c)
    for f in r['frames']:
        for s in f['stations']:
            assert 0 <= s['actual_power_kw'] <= min(s['rating_kw'], s['vehicle_acceptance_kw'])+1e-9


def test_no_authority_no_deviation():
    r = generate(config(scenario='S5', physical_authority=False))
    assert all(abs(f['delta_power_kw']) < 1e-9 for f in r['frames'])


def test_telemetry_only_matches_normal_actual():
    normal = generate(config())
    manipulated = generate(config(scenario='S3'))
    assert [f['actual_power_kw'] for f in normal['frames']] == [f['actual_power_kw'] for f in manipulated['frames']]
    assert any(f['actual_power_kw'] != f['reported_power_kw'] for f in manipulated['frames'])


def test_independent_measurements_and_aggregate():
    r = generate(config(scenario='S5'))
    for f in r['frames']:
        assert f['independent_measured_power_kw'] == pytest.approx(f['actual_power_kw'])
        assert f['delta_power_kw'] == pytest.approx(sum(s['actual_power_kw']-s['baseline_power_kw'] for s in f['stations']))


def test_feeder_units_and_voltage():
    c = config()
    f = generate(c)['frames'][0]['feeders'][0]
    assert f['apparent_kva'] == pytest.approx(math.hypot(f['active_kw'], f['reactive_kvar']))
    assert f['loading_pct'] == pytest.approx(f['apparent_kva']/c.feeder_capacity_kva*100)
    assert f['voltage_pu'] == pytest.approx(math.sqrt(1-2*(0.025*f['active_kw']/c.feeder_capacity_kva+0.015*f['reactive_kvar']/c.feeder_capacity_kva)))


def test_known_anomaly_rules():
    reasons = validate_telemetry(30, -1, 0, 0, 22, 'Available', 1/60, 3)
    assert len(reasons) >= 5


def test_metrics_undefined_and_valid():
    assert evaluation([False], [False])['precision'] is None
    assert evaluation([False], [False])['recall'] is None
    m = evaluation([True, True, False, False], [True, False, True, False])
    assert m['precision'] == m['recall'] == m['f1_score'] == m['false_positive_rate'] == 0.5


def test_cross_layer_catches_consistent_falsification():
    c = config(scenario='S3', compromised_fraction=1, connection_rate=1)
    r = generate(c)
    m = metrics(r, c, 89)
    assert m['by_detector']['D3']['recall'] > 0.8
    assert m['by_detector']['D1']['recall'] == 0
    assert any(a['detector'] == 'D2' for a in r['alerts'])


def test_no_sensing_no_cross_layer_alerts():
    r = generate(config(scenario='S3', sensing_coverage=0))
    assert not any(a['detector'] in ['D2', 'D3'] for a in r['alerts'])


@pytest.mark.parametrize('vector', [{'signature_valid': False}, {'signature_valid': True, 'version_monotonic': False}, {'signature_valid': True, 'hardware_compatible': False}])
def test_manifest_rejection(vector):
    r = generate(config(scenario='S5', defenses=Defenses(firmware_verification=True), **vector))
    assert all(f['delta_power_kw'] == 0 for f in r['frames'])


def test_valid_signed_compromise_residual_risk():
    r = generate(config(scenario='S5', signature_valid=True, defenses=Defenses(firmware_verification=True)))
    assert any(f['delta_power_kw'] > 0 for f in r['frames'])


def test_limiter_and_canary():
    c = config(scenario='S5', feeder_capacity_kva=220, feeder_base_kw=80, compromised_fraction=1)
    r = generate(c.model_copy(update={'defenses': Defenses(external_limiter=True)}))
    assert all(f['max_loading_pct'] <= 95+1e-8 for f in r['frames'])
    staged = generate(c.model_copy(update={'defenses': Defenses(canary_rollout=True, canary_fraction=0.1)}))
    assert sum(s['compromised'] for s in staged['frames'][0]['stations']) == 1


def test_quarantine_recovery_and_fresh_reset():
    c = config(scenario='S5')
    actions = [{'step': 20, 'station_id': 'EVSE-001', 'action': 'quarantine'}, {'step': 25, 'station_id': 'EVSE-001', 'action': 'recover'}]
    original, acted = generate(c), generate(c, actions)
    assert original['frames'][:20] == acted['frames'][:20]
    assert acted['frames'][20]['stations'][0]['actual_power_kw'] == 0
    assert acted['frames'][25]['stations'][0]['firmware_state'] == 'Recovered'
    assert generate(c) == original


def test_identical_seed_comparison_and_concentration():
    c = config(scenario='S7')
    spread, concentrated = generate(c), generate(c.model_copy(update={'concentration': 1.0}))
    assert [f['baseline_power_kw'] for f in spread['frames']] == [f['baseline_power_kw'] for f in concentrated['frames']]
    assert [f['actual_power_kw'] for f in spread['frames']] == [f['actual_power_kw'] for f in concentrated['frames']]
    assert max(f['max_loading_pct'] for f in concentrated['frames']) > max(f['max_loading_pct'] for f in spread['frames'])


def test_auto_containment():
    c = config(scenario='S5', defenses=Defenses(auto_quarantine=True))
    r = generate(c)
    assert any(s['contained'] for f in r['frames'] for s in f['stations'])


def test_no_vehicle_no_physical_impact():
    r = generate(config(scenario='S5', connection_rate=0))
    assert all(f['actual_power_kw'] == 0 for f in r['frames'])
