# Vision bin-statistics fixtures

Captured from the single office test camera, AveTest (index 1), at
`10.10.10.26:8080`, on September 25, 2026. No credentials are included.

- `vision-15-minute.json`: 2026-09-25 17:00–18:00 UTC, interval 15.
- `vision-5-minute.json`: same hour, interval 5. Both contain four counts.
- `vision-one-day.json`: 2026-09-24 00:00–2026-09-25 00:00 UTC, interval 15.
- The date-error text is the camera's response to an invalid date format.
- Empty and truncated JSON files are synthetic failure fixtures.

Requests use `/api/v1/cameras/1/bin-statistics` with `start-time`, `end-time`
and `interval`. Tests use simulated HTTP responses, so they do not need LAN
access or more physical cameras. One/four/eight-camera report tests live in
`ReportApiTests/TmcEndToEndTests.cs`.
