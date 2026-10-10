# GridSentinel — implementation and execution instructions

EV Charging Network Security & Grid Impact Simulator.

GitHub repository: https://github.com/pratiklakra38/GridSentinal

This submission provides a working frontend with seeded simulations calculated in the browser. The Python backend is included as groundwork; full backend development is deferred.

## Run the included Windows executable

1. Extract the entire ZIP to a folder. Keep `GridSentinel.exe` next to the `frontend` folder; do not run it from inside the ZIP.
2. Double-click `GridSentinel.exe`.
3. The launcher serves the included production frontend on the local loopback address and opens the browser. The usual address is http://127.0.0.1:5173. If that port is busy, the launcher selects another port; use the address printed in its console if the browser does not open.
4. Leave the launcher running while using the simulator. Close its console or press `Ctrl+C` in the console to stop the local server.

The executable uses `frontend/dist`. Node.js, npm, Python, an API key and a GitHub account are not required to run this packaged frontend. The simulator is for local Windows use.

To start without automatically opening a browser, open PowerShell in the extracted folder:

```powershell
.\GridSentinel.exe --no-browser --port 5173
```

To request another port:

```powershell
.\GridSentinel.exe --port 5174
```

Then use the address printed in the launcher console, normally http://127.0.0.1:5174. The executable serves the frontend only; it does not start the optional Python backend.

To check the bundled frontend through a temporary loopback server, then exit:

```powershell
.\GridSentinel.exe --self-test
```

## Run or edit the frontend source

Install Node.js with npm, open PowerShell in the extracted project folder, then run:

```powershell
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Internet access is required for the first dependency installation. Once dependencies are installed, the default simulation runs locally in the browser.

To regenerate the production frontend used by the executable:

```powershell
npm run build
```

The output is written to `frontend/dist`. Source changes require a new build before they appear through `GridSentinel.exe`.

## Demonstrate the simulator

All scenarios S0–S9 are selectable in **Scenario lab**: normal operation, benign communication faults, benign meter error, telemetry-only manipulation, authorized load change, coordinated deviation, partial compromise, geographic concentration, sensing coverage and mitigation.

1. Select **S0** and **Run full** to establish normal operation. Inspect matching actual and reported power in **Overview**.
2. Select **S3** and **Run full**. Actual demand remains at baseline while reported telemetry differs.
3. Select **S5** and **Start simulation**. Use Pause, Step, Resume and Finish run. Disable physical authority and rerun to show how authority changes the result.
4. Select **S7**, choose **Dispersed / concentrated**, and **Run comparison** to compare identical-seed placement and local feeder loading.
5. Inspect **Charging stations**, **Grid analysis** and **Security monitoring**. Try S1/S2 for benign anomalies and S8 for sensing coverage comparisons.
6. In **Defense center**, enable verification or the external limiter, then run a defense comparison.
7. In **Experiment reports**, export CSV, HTML or JSON results with the configuration, seed, computed metrics and limitations.

Configuration and playback cursors are saved in local browser storage. Browser histories belong to the browser and origin being used; changing port or browser creates a separate storage context.

## Submission contents

| Location | Contents |
| --- | --- |
| `GridSentinel.exe` | Windows launcher for the local production frontend |
| `README.md` | Submission instructions and GitHub link |
| `frontend/src/` | React and TypeScript interface, simulation model and styling |
| `frontend/public/` | Static frontend assets |
| `frontend/dist/` | Ready-to-run production frontend |
| `frontend/tests/` | Playwright browser tests |
| `frontend/package.json`, `frontend/package-lock.json` | Frontend commands and locked dependencies |
| `backend/app/`, `backend/tests/` | Optional Python backend groundwork and tests |
| `backend/requirements.txt`, `backend/pyproject.toml` | Optional backend dependency and test configuration |
| `scripts/launcher.py` | Source for the Windows executable launcher |
| `scripts/package_submission.py` | Submission packaging script |
| `scripts/start.ps1` | Frontend development startup script |
| `docs/` | Demonstration guide, research mapping, implementation notes and validation record |
| `overleaf_project.pdf`, if present | Passive local research reference; no executable code |

The package excludes `node_modules`, `.git`, local databases, virtual environments, test output and caches. Dependencies can be reinstalled from the included manifests. The local research PDF is not included in GitHub commits.

## Verification recorded for the frontend

`docs/VALIDATION.md` records passing TypeScript, ESLint, Prettier and production build checks, plus five passing Chromium Playwright tests. Those tests cover simulation execution, playback controls, computed charts, station search/details, quarantine/recovery, persistence, HTML exports, defense comparisons, error/empty states, seven-page navigation and mobile use.

The browser engine invariants were also checked for deterministic seeds, S0–S9 generation, device/vehicle bounds, telemetry-only independence, authority gating, independent measurements, aggregate deviation and manifest protection effects. The production build has a non-fatal large-chunk advisory for the chart library. No generator watermark or attribution was found in the product code.

To repeat the frontend checks after installing dependencies:

```powershell
cd frontend
npm run typecheck
npm run lint
npm run format:check
npm run build
npx playwright install chromium
npm test
```

This record describes project checks already executed; it does not by itself certify the final ZIP or executable.

## Rebuild the Windows launcher from source

On 64-bit Windows with Python 3.11 or later, run from the extracted project root:

```powershell
python -m pip install pyinstaller==6.16.0
python -m PyInstaller --onefile --console --name GridSentinel --distpath . --workpath tmp/launcher-build --specpath tmp scripts/launcher.py
```

Keep the rebuilt executable alongside `frontend/dist`. The included executable embeds the Python runtime and serves the bundled frontend; the simulation model remains in the frontend source and compiled JavaScript.

## Optional backend and limitations

The default executable and frontend development command use the browser simulation and do not require Python. The optional FastAPI/NumPy/SQLite backend source and dependency manifest are included for future development. Its development and production hardening are deferred.

The model uses synthetic charging stations, fixed vehicle availability, a baseline/taper model and bounded demand. Actual, reported and independent power are kept separate. Detection uses transparent heuristics, voltage uses a linearized DistFlow screening approximation, and firmware verification checks synthetic metadata.

This is an academic simulator. It does not connect to real chargers, perform real exploitation, implement full OCPP compliance, use trained machine learning, solve full AC power flow or simulate system frequency. Browser and Python modes use different random generators; seeded repeatability applies within the same implementation and version. Browser and SQLite histories are separate.
