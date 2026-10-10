# Four-minute frontend demonstration

Start with `scripts/start.ps1`, then open localhost:5173. Default mode is the browser demo; no Python setup is needed.

1. **0:00–0:40 — Normal operation:** Scenario Lab, S0, Run full. Overview shows matching actual and reported power. The fleet and feeder values are computed.
2. **0:40–1:20 — Telemetry-only:** S3, Run full. The actual line follows baseline; the reported line diverges during the scheduled pulse. Physical authority cannot change the S3 result.
3. **1:20–2:00 — Physical conditions:** S5, Start simulation. Pause, Step, Resume, then Finish run. Grid Analysis shows bounded device demand, feeder loading in kVA and approximate voltage. Disable power authority and rerun to demonstrate the causal gate.
4. **2:00–2:40 — Concentration:** S7, compare Dispersed / concentrated. Same seed and total fleet demand; different local feeder peaks.
5. **2:40–3:20 — Detection:** Security Monitoring shows D1/D2/D3 explanations. S8 sensing comparison illustrates loss of cross-layer visibility with no independent coverage. Benign S1/S2 can create false positives.
6. **3:20–4:00 — Mitigation and reporting:** Defense Center, enable firmware verification or external limiting, then Run comparison. Report the computed changes. Export HTML or CSV from Experiment Reports.

Explain that these are synthetic implementation outputs [S], the paper contains untested hypotheses, and browser and Python modes use different seeded random generators.
