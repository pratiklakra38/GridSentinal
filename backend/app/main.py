import html
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .database import Run, Session
from .schemas import CompareRequest, Config, ControlRequest, RunSummary, StationAction, StepRequest
from .simulation import ASSUMPTIONS, SCENARIOS, generate, metrics

app = FastAPI(title='GridSentinel', version='1.0.0', description='Offline synthetic EV security and grid impact experiments.')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'], allow_methods=['*'], allow_headers=['*'])
write_lock = threading.RLock()


def get_run(session, run_id=None):
    run = session.get(Run, run_id) if run_id else session.scalar(select(Run).order_by(Run.created_at.desc()).limit(1))
    if run is None:
        raise HTTPException(404, 'No simulation found. Create a run in Scenario Lab.')
    return run


def summary(run):
    return {'id': run.id, 'created_at': run.created_at, 'config': run.config, 'cursor': run.cursor, 'status': run.status}


def visible_alerts(run):
    frame = run.result['frames'][run.cursor]
    states = {s['id']: s for s in frame['stations']}
    return [{**a, 'status': 'contained' if a['station_id'] and states[a['station_id']]['contained'] else 'resolved' if a['station_id'] and states[a['station_id']]['firmware_state'] == 'Recovered' else 'open'} for a in run.result['alerts'] if a['step'] <= run.cursor]


def detail(run):
    frame = {k: v for k, v in run.result['frames'][run.cursor].items() if k not in ['labels', 'predictions', 'detector_predictions']}
    return {**summary(run), 'frame': frame, 'metrics': metrics(run.result, Config(**run.config), run.cursor),
            'alerts': visible_alerts(run), 'assumptions': ASSUMPTIONS}


def create(config, completed=False):
    run = Run(id=str(uuid4()), created_at=datetime.now(timezone.utc).isoformat(), config=config.model_dump(),
              result=generate(config), cursor=config.duration_steps-1 if completed else 0,
              status='completed' if completed else 'paused')
    return run


@app.get('/api/health')
def health():
    return {'status': 'ok', 'mode': 'synthetic-offline', 'version': '1.0.0'}


@app.get('/api/scenarios')
def scenarios():
    return [{'id': s, 'name': n, 'description': d} for s, n, d in SCENARIOS]


@app.get('/api/simulations', response_model=list[RunSummary])
def runs():
    with Session() as session:
        return [summary(r) for r in session.scalars(select(Run).order_by(Run.created_at.desc()))]


@app.post('/api/simulations', status_code=201)
def new_run(config: Config):
    with write_lock, Session() as session:
        run = create(config)
        session.add(run)
        session.commit()
        return detail(run)


@app.post('/api/simulations/compare')
def compare(request: CompareRequest):
    config = request.config
    left, right = config.model_copy(deep=True), config.model_copy(deep=True)
    if request.mode == 'defenses':
        left.defenses.firmware_verification = False
        left.defenses.external_limiter = False
        left.defenses.canary_rollout = False
        left.defenses.auto_quarantine = False
        right.defenses = config.defenses.model_copy(deep=True)
    elif request.mode == 'concentration':
        left.concentration, right.concentration = 0, 1
    elif request.mode == 'sensing':
        left.sensing_coverage, right.sensing_coverage = 0, 1
        left.defenses.independent_metering = right.defenses.independent_metering = True
    else:
        left.compromised_fraction, right.compromised_fraction = 0.1, 0.8
    with write_lock, Session() as session:
        a, b = create(left, True), create(right, True)
        session.add_all([a, b])
        session.commit()
        return {'mode': request.mode, 'left': detail(a), 'right': detail(b), 'seed_matched': a.config['seed'] == b.config['seed']}


@app.get('/api/simulations/{run_id}')
def run_detail(run_id: str):
    with Session() as session:
        return detail(get_run(session, run_id))


@app.post('/api/simulations/{run_id}/step')
def step(run_id: str, request: StepRequest):
    with write_lock, Session() as session:
        run = get_run(session, run_id)
        run.cursor = min(run.config['duration_steps']-1, run.cursor+request.steps)
        if run.cursor == run.config['duration_steps']-1:
            run.status = 'completed'
        session.commit()
        return detail(run)


@app.post('/api/simulations/{run_id}/control')
def control(run_id: str, request: ControlRequest):
    with write_lock, Session() as session:
        run = get_run(session, run_id)
        if request.action == 'reset':
            run.cursor, run.status = 0, 'paused'
            run.result = generate(Config(**run.config))
        elif request.action == 'finish':
            run.cursor, run.status = run.config['duration_steps']-1, 'completed'
        elif run.cursor < run.config['duration_steps']-1:
            run.status = 'playing' if request.action == 'resume' else 'paused'
        session.commit()
        return detail(run)


@app.get('/api/stations')
def stations(run_id: str | None = None):
    with Session() as session:
        run = get_run(session, run_id)
        return run.result['frames'][run.cursor]['stations']


@app.get('/api/stations/{station_id}')
def station_detail(station_id: str, run_id: str | None = None):
    with Session() as session:
        run = get_run(session, run_id)
        station = next((s for s in run.result['frames'][run.cursor]['stations'] if s['id'] == station_id), None)
        if station is None:
            raise HTTPException(404, 'Station not present in this fleet')
        return {'station': station, 'telemetry': [{'step': f['step'], **next(s for s in f['stations'] if s['id'] == station_id)} for f in run.result['frames'][:run.cursor+1]],
                'events': [e for e in run.result['events'] if e['station_id'] == station_id and e['step'] <= run.cursor]}


@app.post('/api/simulations/{run_id}/stations/{station_id}')
def station_action(run_id: str, station_id: str, request: StationAction):
    with write_lock, Session() as session:
        run = get_run(session, run_id)
        if run.status == 'completed':
            raise HTTPException(409, 'Completed runs are frozen. Reset or create a fresh run to apply an action.')
        if station_id not in {s['id'] for s in run.result['frames'][0]['stations']}:
            raise HTTPException(404, 'Station not present in this fleet')
        actions = [*run.result['actions'], {'step': run.cursor+1, 'station_id': station_id, 'action': request.action}]
        run.result = generate(Config(**run.config), actions)
        session.commit()
        return detail(run)


@app.get('/api/feeders')
def feeders(run_id: str | None = None):
    with Session() as session:
        run = get_run(session, run_id)
        return run.result['frames'][run.cursor]['feeders']


@app.get('/api/simulations/{run_id}/timeseries')
def timeseries(run_id: str):
    with Session() as session:
        run = get_run(session, run_id)
        return [{k: v for k, v in f.items() if k not in ['stations', 'feeders', 'labels', 'predictions', 'detector_predictions', 'gates']} for f in run.result['frames'][:run.cursor+1]]


@app.get('/api/simulations/{run_id}/events')
def events(run_id: str, station_id: str | None = None, message_type: str | None = None, severity: str | None = None,
           start_step: int = Query(0, ge=0), end_step: int | None = Query(None, ge=0), limit: int = Query(250, ge=1, le=5000)):
    with Session() as session:
        run = get_run(session, run_id)
        end = min(run.cursor, end_step) if end_step is not None else run.cursor
        values = [e for e in run.result['events'] if start_step <= e['step'] <= end and (not station_id or e['station_id'] == station_id)
                  and (not message_type or e['type'] == message_type) and (not severity or e['severity'] == severity)]
        return list(reversed(values[-limit:]))


@app.get('/api/simulations/{run_id}/alerts')
def alerts(run_id: str):
    with Session() as session:
        return visible_alerts(get_run(session, run_id))


@app.get('/api/simulations/{run_id}/metrics')
def run_metrics(run_id: str):
    with Session() as session:
        run = get_run(session, run_id)
        return metrics(run.result, Config(**run.config), run.cursor)


@app.get('/api/reports/{run_id}/export')
def export(run_id: str, format: str = Query('csv', pattern='^(csv|html|json)$')):
    with Session() as session:
        run = get_run(session, run_id)
        report = detail(run)
        if run.status != 'completed':
            raise HTTPException(409, 'Finish the run before exporting its report.')
        headers = {'Content-Disposition': f'attachment; filename="gridsentinel-{run.id[:8]}.{format}"'}
        if format == 'json':
            return Response(json.dumps({**report, 'result': run.result}, indent=2), media_type='application/json', headers=headers)
        if format == 'csv':
            rows = [{k: v for k, v in f.items() if k not in ['stations', 'feeders', 'labels', 'predictions', 'detector_predictions', 'gates']} for f in run.result['frames']]
            metadata = '\n'.join('# '+x for x in [f'GridSentinel synthetic [S] run {run.id}', f'Created UTC: {run.created_at}', 'Configuration: '+json.dumps(run.config), 'Metrics: '+json.dumps(report['metrics']), *ASSUMPTIONS])
            return Response(metadata+'\n'+pd.DataFrame(rows).to_csv(index=False), media_type='text/csv', headers=headers)
        esc = html.escape
        body = f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>GridSentinel experiment report</title>
        <style>body{{font:15px system-ui;color:#20252b;max-width:1000px;margin:40px auto;padding:24px}}h1{{color:#275d78}}pre{{white-space:pre-wrap;background:#f5f6f7;padding:18px}}table{{border-collapse:collapse;width:100%}}td,th{{text-align:left;border-bottom:1px solid #dce1e5;padding:8px}}</style>
        <h1>GridSentinel · Experiment report</h1><p>Synthetic simulation outputs [S]. Run {esc(run.id)} · {esc(run.created_at)} UTC</p>
        <h2>Configuration and seed</h2><pre>{esc(json.dumps(run.config, indent=2))}</pre>
        <h2>Calculated metrics</h2><pre>{esc(json.dumps(report['metrics'], indent=2))}</pre>
        <h2>Assumptions, implemented detectors and limitations</h2><ul>{''.join('<li>'+esc(x)+'</li>' for x in ASSUMPTIONS)}</ul>
        <h2>Independent actions</h2><pre>{esc(json.dumps(run.result['actions'], indent=2))}</pre>
        <h2>Security alerts</h2>{pd.DataFrame(report['alerts']).to_html(index=False, escape=True) if report['alerts'] else '<p>No alerts generated.</p>'}</html>'''
        return HTMLResponse(body, headers=headers)


dist = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
if dist.exists():
    app.mount('/', StaticFiles(directory=dist, html=True), name='frontend')
