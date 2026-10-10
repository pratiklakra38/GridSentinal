# GridSentinel

EV Charging Network Security & Grid Impact Simulator. An offline academic console based on the supplied research blueprint.

## Quick start — frontend demo

Only Node.js and npm are required. No Python server or API key is needed for the default demo.

```powershell
cd E:\GridSentinal
.\scripts\start.ps1
```

Or:

```powershell
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. The default mode computes seeded synthetic simulations in the browser and saves configurations and playback cursors in local browser storage. Charts are calculated from bounded electrical states, not canned sample data.

## Demonstration

1. Open **Scenario lab**. Choose **S3** and click **Run full**: actual demand remains at baseline while reported telemetry differs.
2. Choose **S5** and **Start simulation**: watch demand evolve; pause, step, resume or finish. Disabling physical authority prevents scenario-driven physical changes.
3. Select **S7**, choose **Dispersed / concentrated**, then **Run comparison** to compare identical-seed placement.
4. In **Defense center**, enable verification or the external limiter and run the defense comparison.
5. Inspect stations, grid state and security logs. **Experiment reports** exports CSV, HTML and JSON, including configuration, seed, computed metrics and limitations.

All scenarios **S0–S9** are selectable: normal operation, benign communication faults, benign meter error, telemetry-only manipulation, authorized load change, coordinated deviation, partial compromise, geographic concentration, sensing coverage and mitigation.

## Modes and limitations

The current priority is the working frontend demonstration. Browser mode is a simplified seeded TypeScript model, explicitly labeled in the interface and exports. It uses fixed vehicle availability, a synthetic baseline/taper, separate actual/reported/independent power and transparent detection heuristics. Voltage is a linearized DistFlow screening approximation. Firmware verification checks synthetic metadata. No real hardware, actual exploitation, full OCPP compliance, trained ML, full AC power flow or system-frequency simulation is provided.

The optional Python/FastAPI/NumPy/SQLite implementation is included as backend groundwork. Further backend hardening is deferred at the user's request. Its random generator differs from the browser implementation; identical results are guaranteed within the same implementation and version, not across modes. Browser histories and SQLite histories are separate.

## Optional Python mode

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd frontend
$env:VITE_API_MODE = 'backend'
npm run dev
```

API documentation: http://127.0.0.1:8000/docs.

## Frontend checks

```powershell
cd frontend
npm run typecheck
npm run lint
npm run format:check
npm run build
npx playwright install chromium
npm test
```

Backend test suite: `cd backend; python -m pytest -q --basetemp=../tmp/pytest`.

No account registration, paid service, watermark or generator attribution appears in the product.
