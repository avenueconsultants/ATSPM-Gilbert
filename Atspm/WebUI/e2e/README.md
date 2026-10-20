# Reconciliation browser tests

These tests open the regular `/admin/locations/990001` page and use the combined **Reconcile Approaches → Lanes** dialog. They do not use the `/dev/reconcile-scenarios` page or inject editor state.

Start the WebUI, then run from `Atspm/WebUI` in PowerShell:

```powershell
$env:TMC_E2E_URL = 'http://localhost:3080'
npm run test:e2e -- e2e/reconcile-location.mock.spec.ts
```

For interactive debugging, add `--headed` or `--ui`. Playwright Chromium must be installed (`npx playwright install chromium`). No camera, database credentials, login, or enabled server-side feature flag is needed. The browser mocks the feature flag, configuration, profile, zone inventory, approach comparison, bin-statistics report, and approach save responses. All API traffic is intercepted; unmatched writes are blocked and fail assertions. Map services are disabled in this test browser. The existing hardware smoke tests are separate and are not selected by this command.

The ten reviewed fixtures are shared with the manual scenario page in `../../scenario-mock-tool/src/components/mockScenarios.ts`. Assertions independently specify the expected saved channels and movements. Tests verify split previews, separate turn additions, optional removal warnings, unchanged valid configurations, ambiguous/low-volume warnings, separate Through lanes on different zones, the disabled feature flag, individual turn selection with an edited channel, and closing without applying. Applying must not write to the API; only explicitly saving the approach sends the intercepted payload.

On failure, Playwright retains a trace in `test-results`. Open it with `npx playwright show-trace <trace.zip>`.

## Interactive scenario tool

The interactive mocks and their browser tests now live in the separate [scenario mock tool](../../../scenario-mock-tool/README.md), served at http://localhost:3081. The old WebUI development route has been removed. Regular-location tests above continue to exercise the real location page using API interception.
