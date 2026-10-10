# GridSentinel implementation

1. Seeded NumPy fleet and discrete virtual time; preserve distinct baseline, actual, reported and independent measurements.
2. Implement S0–S9, bounded demand, separate causal gates, transparent D1 rules, sustained feeder residual D2 and cross-layer station residual D3 heuristic.
3. Precompute a run once and reveal through a persisted playback cursor. Manual containment/recovery schedules regenerate deterministically with actions at their effective time; past frames remain unchanged.
4. FastAPI REST contracts; SQLite JSON run records through SQLAlchemy; exports and matched-seed comparisons.
5. React/TypeScript operational console with seven working routes, restrained industrial styling, backend data and explicit empty/error states.
6. Scientific invariant tests, API integration tests, browser workflow checks, lint/type/build checks; Windows startup and research mapping.

Source inspected: overleaf_project.pdf, 29 pages, dated 9 October 2026. Sections 4–5 define gates and physical equations; sections 8–9 define scenarios and independent evaluation; section 11 defines controls. The source contains no completed experiments. This implementation produces its own synthetic [S] outputs.
