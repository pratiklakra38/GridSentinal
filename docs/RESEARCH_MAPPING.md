# Research mapping

| Paper area | Browser demo | Status |
|---|---|---|
| Section 4, G0–G6 | Conditional gate indicators, synthetic manifest checks, distinct telemetry and power authority | Simplified |
| Section 5.2, equations 2–4 | Clipped actual power, independent reported power, acceptance headroom, onset/dispersion/ramp | Implemented with synthetic fleet assumptions |
| Section 5.3, equation 5 | Base P and Q, actual EV P, apparent kVA, feeder loading | Implemented |
| Section 5.4, equation 6 | Single equivalent radial branch per feeder, normalized r/x/P/Q | Simplified screening approximation |
| Section 5.5, frequency | No bulk-system dynamics | Not implemented |
| Section 8, S0–S9 | Scenario selection and controlled seed comparisons | Implemented |
| Section 9, device rules | Power range, energy monotonicity/integral, jumps, stale messages | Simplified D1 |
| Section 9, CUSUM and ML | Sustained residual heuristics only, with separate station/feeder attribution | Simplified; no CUSUM or ML |
| Section 9, independent ground truth | Injection schedule labels, station-step confusion matrix, undefined metrics as N/A | Implemented with narrower evaluation unit |
| Section 11, M2/M5/M7/M8 | Inert metadata verifier, independent sensing, upstream limit, canary rollout | Simplified |
| Section 4.3 and S10 | Manual upstream quarantine and verified recovery at next step | Simplified; not a separate S10 scenario |
| Appendix A | Saved seed, configuration, assumptions, event logs and reports | Implemented for browser-local demo |

The application generates new synthetic outputs [S]. It does not reproduce completed results from the paper, which is an untested research blueprint. Browser and optional Python modes are distinct implementations with separate random generators and storage.
