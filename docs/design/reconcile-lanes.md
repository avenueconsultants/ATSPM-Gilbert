# Reconcile Lanes

Reconcile Lanes is a separate location-editor action. It does not run Reconcile Approaches, import events, or save configuration automatically.

## Enablement

Both settings default off:

- WebUI runtime environment: `ENABLE_LANE_RECONCILIATION=true` shows the button through the existing `/api/feature-flags` route.
- Report API configuration: `Features:LaneReconciliation=true` (`Features__LaneReconciliation=true` in Docker) authorizes zone-evidence requests.

This flag is independent of `Features:TmcDeviceSources` and `Features:DeviceTestDownload`. Enabling lane review does not enable device TMC charts or test downloads. Device selection, decoder configuration, and location-version validation still apply.

## Workflow

1. Open **Reconcile Lanes**. The current location configuration is the baseline; any template was already applied during creation. Decoder choices come from the active devices’ comma-separated `TmcDecoder` properties, using the same grouping as the TMC chart. Only decoders supporting lane evidence are offered. A single supported decoder is selected automatically; multiple supported decoders require a choice.
2. Choose the observation period, interpreted in the same location timezone as TMC reports. The end is exclusive. The existing Vision decoder converts to UTC for the camera request. Default: three completed calendar days, 15-minute bins. Minimum count defaults to five and controls recommendations for previously unassigned movements.
3. Read the complete zone inventory using the existing Get Zones endpoint. Fetch independent zone movement evidence through the existing TMC report endpoint with `reconcileLanes: true`.
4. Compare active detectors above channel 64 against the inventory by exact configured zone name. A configured physical lane number and vehicle lane type are required before recommending a movement split. There are no Gilbert zone-name expressions or special 100/300-series rules in this comparison.
5. Review recommended changes separately from warnings. Select changes explicitly and provide unused channels above 64 for new movement entries. **Apply selected to editor** stages changes; use the existing location/approach save controls to persist them.

The inventory is independent of configured ATSPM detectors, so unused zones remain visible even when the Indiana importer cannot import them. Missing or placeholder zone assignments are warnings for manual verification. No replacement name is guessed, and no separate template is loaded or compared.

For example, a configured left entry with substantial through counts can be recommended as separate L and T entries sharing the exact zone name, physical lane number and detector settings. A TL/TR entry can be split into independent movement entries. Existing configured movements are preserved even if their observed count is zero. Overlapping assignments, such as TL plus L on the same zone, are warnings because they may double-count.

## Evidence and limitations

- Channels 1–64 are excluded from matching and movement recommendations. A zone used exclusively on one of these channels is not called unused.
- Counts cannot prove permitted turns, turn-only restrictions, or protected/permissive signal operation. Review camera geometry and classification before accepting a movement recommendation.
- Zero counts never cause a movement or lane to be removed. Low counts, missing bins, missing configured lane numbers, and conflicting zone assignments require review.
- The count table reports returned bins, not guaranteed complete coverage. Source read warnings disable recommendations for that run. An unavailable inventory prevents edits because another device could own the same zone name.
- Duplicate zone names across cameras, or multiple zone IDs with the same name during the selected period, need verification. Indiana matching uses zone names, so blindly combining these would conceal ambiguity.
- Existing location configuration is the intended baseline, not proof of current road geometry. Verify physical geometry before accepting recommendations.
- Configurations and review inputs must remain unchanged between comparison and application. New channels are validated together before staging, so one invalid channel leaves the editor unchanged.

## Decoder contract and reuse

`ITurningMovementCountDecoder.SupportsLaneReconciliation` defaults to false. Supporting decoders return `TmcZoneEvidence` (device ID, exact zone name, T/L/R totals and distinct bin count) in `TmcDecodeResult.ZoneEvidence` when requested. DeviceCountSource retains separate evidence per device; it does not combine zones into approaches. Ordinary TMC chart behavior is unchanged.

VisionCameraAPI supports this optional mode before its chart-specific name/layer mapping, closest-advance filtering and chart aggregation. It uses the same camera access, cancellation, UTC conversion and bin-statistics parser as reporting. The front-end `laneDecoders` adapter supplies independent inventory access through the existing Get Zones endpoint. A future source supplies its own adapter and optional report-decoder capability; matching and application logic remain source-neutral.

No importer, downloader, archive code, or API controller changes are required.

## Tests

- Report API HTTP end-to-end tests: independent/default-off feature gate, configured decoder capability, unfiltered advance/RR/arbitrary zone names, UTC query, and ordinary report regressions.
- Frontend tests: controller-channel exclusion, current-configuration matching and missing zone names, automatic device decoder selection without template requests, split movement recommendations, zero/low counts, duplicate names, offline inventory, overlapping assignments, channel conflicts, atomic staging, stale review protection, warning-only partial responses, and feature-flag behavior.
