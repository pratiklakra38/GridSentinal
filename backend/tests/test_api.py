import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('GRIDSENTINEL_DATABASE_URL', 'sqlite:///'+(tmp_path/'test.db').as_posix())
    import app.database
    import app.main
    importlib.reload(app.database)
    importlib.reload(app.main)
    return TestClient(app.main.app)


def test_workflow_persistence_and_export(client):
    assert client.get('/api/health').json()['status'] == 'ok'
    assert len(client.get('/api/scenarios').json()) == 10
    assert client.get('/api/stations').status_code == 404
    run = client.post('/api/simulations', json={'fleet_size': 8, 'scenario': 'S5'}).json()
    rid = run['id']
    assert client.get(f'/api/simulations/{rid}/timeseries').json()[0]['step'] == 0
    assert client.get(f'/api/stations/EVSE-001?run_id={rid}').status_code == 200
    assert client.get(f'/api/reports/{rid}/export').status_code == 409
    assert client.post(f'/api/simulations/{rid}/control', json={'action': 'resume'}).json()['status'] == 'playing'
    assert client.post(f'/api/simulations/{rid}/control', json={'action': 'pause'}).json()['status'] == 'paused'
    assert client.post(f'/api/simulations/{rid}/step', json={'steps': 2}).json()['cursor'] == 2
    client.post(f'/api/simulations/{rid}/stations/EVSE-001', json={'action': 'quarantine'})
    client.post(f'/api/simulations/{rid}/step', json={'steps': 1})
    assert client.get(f'/api/stations/EVSE-001?run_id={rid}').json()['station']['contained']
    client.post(f'/api/simulations/{rid}/control', json={'action': 'finish'})
    for format in ['csv', 'html', 'json']:
        response = client.get(f'/api/reports/{rid}/export?format={format}')
        assert response.status_code == 200
        assert 'attachment' in response.headers['content-disposition']
    assert client.get('/api/simulations').json()[0]['status'] == 'completed'
    assert client.post(f'/api/simulations/{rid}/stations/EVSE-001', json={'action': 'recover'}).status_code == 409
    client.post(f'/api/simulations/{rid}/control', json={'action': 'reset'})
    assert not client.get(f'/api/stations/EVSE-001?run_id={rid}').json()['station']['contained']
    assert client.get(f'/api/simulations/{rid}/events?station_id=EVSE-001').status_code == 200


def test_compare_and_validation(client):
    r = client.post('/api/simulations/compare', json={'config': {'fleet_size': 8, 'scenario': 'S5', 'defenses': {'firmware_verification': True}}, 'mode': 'defenses'}).json()
    assert r['seed_matched']
    assert r['left']['metrics']['peak_deviation_kw'] > r['right']['metrics']['peak_deviation_kw']
    assert r['left']['status'] == r['right']['status'] == 'completed'
    assert client.post('/api/simulations', json={'fleet_size': 9999}).status_code == 422
    assert client.post('/api/simulations', json={'onset_step': 200}).status_code == 422
    assert client.get('/api/simulations/missing').status_code == 404
