import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import { ApproachesReconciliationView } from "@/features/locations/components/ApproachesReconcilationReport/ApproachesReconciliationView";
import type { LocationDiscrepancyReport } from "@/features/locations/components/ApproachesReconcilationReport/useDiscrepancyStatuses";
import type {
  ConfigApproach,
  ConfigDetector,
} from "@/features/locations/components/editLocation/locationStore";
import scenarios from "./approachMockScenarios.json";

export function approachScenarioReport(
  index: number,
): LocationDiscrepancyReport {
  const { location, expected } = scenarios[index];
  return {
    missingPhaseAssignments:
      expected.missingPhaseAssignments as LocationDiscrepancyReport["missingPhaseAssignments"],
    foundPhaseNumbers: expected.loggedButUnusedProtectedOrPermissivePhases,
    foundOverlapNumbers: expected.loggedButUnusedOverlapPhases,
    foundDetectorChannels: expected.loggedButUnusedDetectorChannels,
    notFoundDetectorChannels: expected.removedDetectors,
    notFoundApproaches: expected.removedApproachIds.map((id) => ({
      id,
      description: location.approaches.find((a) => a.id === id)?.description,
    })),
    warnings: expected.reconciliationWarnings,
  };
}
const configuration = (index: number) =>
  structuredClone(
    scenarios[index].location.approaches,
  ) as unknown as ConfigApproach[];

/** Fixed API responses generated and checked by ApproachScenarioFixtureTests.
 * Actions only modify this component's local state, including delete and ignore.
 */
export default function ApproachMockScenarios() {
  const [scenario, setScenario] = useState(0);
  const [approaches, setApproaches] = useState(() => configuration(0));
  const [report, setReport] = useState<LocationDiscrepancyReport>();
  const [revision, setRevision] = useState(0);
  const nextId = useRef(10000);
  const sample = scenarios[scenario];
  const reset = (index: number) => {
    setScenario(index);
    setApproaches(configuration(index));
    setReport(undefined);
    setRevision((r) => r + 1);
    nextId.current = 10000;
  };
  return (
    <Stack spacing={2} sx={{ p: 3, maxWidth: 1100, mx: "auto" }}>
      <Typography variant="h4">
        Approach reconciliation mock scenarios
      </Typography>
      <Alert severity="info">
        Isolated test editor. Add, delete, and ignore affect only this mock
        configuration. No configuration API writes are made. Responses are
        generated from the backend rules; comparing again replays the same
        sample response.
      </Alert>
      <TextField
        select
        label="Approach scenario"
        value={scenario}
        onChange={(e) => reset(Number(e.target.value))}
      >
        {scenarios.map((s, i) => (
          <MenuItem key={s.name} value={i}>
            {s.name}
          </MenuItem>
        ))}
      </TextField>
      <Typography>{sample.explanation}</Typography>
      <Typography variant="h6">Sample recorded events</Typography>
      <Typography>
        {sample.events.length
          ? sample.events
              .map((e) => `Event ${e.eventCode}: identifier ${e.eventParam}`)
              .join("; ")
          : "No events returned."}
      </Typography>
      <Typography variant="h6">Current mock configuration</Typography>
      <Box
        sx={{ overflowX: "auto", "& td, & th": { p: 1, textAlign: "left" } }}
      >
        <table aria-label="Mock approach configuration">
          <thead>
            <tr>
              <th>Approach</th>
              <th>Protected</th>
              <th>Permissive</th>
              <th>Pedestrian</th>
              <th>Detector channels</th>
            </tr>
          </thead>
          <tbody>
            {approaches.map((a) => (
              <tr key={a.id}>
                <td>{a.description}</td>
                <td>
                  {a.protectedPhaseNumber || "—"}
                  {a.isProtectedPhaseOverlap ? " (overlap)" : ""}
                </td>
                <td>
                  {a.permissivePhaseNumber || "—"}
                  {a.isPermissivePhaseOverlap ? " (overlap)" : ""}
                </td>
                <td>
                  {a.pedestrianPhaseNumber || "—"}
                  {a.isPedestrianPhaseOverlap ? " (overlap)" : ""}
                </td>
                <td>
                  {a.detectors.map((d) => d.detectorChannel).join(", ") ||
                    "None"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          onClick={() => {
            setReport(approachScenarioReport(scenario));
            setRevision((r) => r + 1);
          }}
        >
          Compare mock approaches
        </Button>
        <Button onClick={() => reset(scenario)}>Reset scenario</Button>
      </Stack>
      {sample.expected.loggedButUnusedPedestrianPhases.length > 0 && (
        <Alert severity="info">
          API-only result: unconfigured pedestrian phases{" "}
          {sample.expected.loggedButUnusedPedestrianPhases.join(", ")}. The
          regular report does not yet provide a pedestrian-add action.
        </Alert>
      )}
      {report && (
        <ApproachesReconciliationView
          key={revision}
          categories={report}
          locationTypeName="Intersection"
          detectionTypes={
            [
              {
                id: "1",
                displayOrder: 1,
                abbreviation: "LLC",
                description: "Lane-by-lane count",
              },
              {
                id: "2",
                displayOrder: 2,
                abbreviation: "SBP",
                description: "Stop bar presence",
              },
              {
                id: "3",
                displayOrder: 3,
                abbreviation: "AC",
                description: "Advanced count",
              },
            ] as import("@/features/locations/types").DetectionType[]
          }
          approaches={approaches}
          updateApproach={(updated) =>
            setApproaches((items) =>
              items.map((a) => (a.id === updated.id ? updated : a)),
            )
          }
          onIgnore={() => {
            /* Keep real wizard state untouched. */
          }}
          addApproach={(phase, overlap = false, properties) => {
            const approach = {
              ...properties,
              id: nextId.current++,
              description:
                properties?.description ??
                `New ${overlap ? "overlap" : "phase"} ${phase}`,
              protectedPhaseNumber: phase ?? 0,
              isProtectedPhaseOverlap: overlap,
              permissivePhaseNumber: null,
              pedestrianPhaseNumber: null,
              detectors: [],
              isNew: true,
            } as ConfigApproach;
            Object.assign(approach, properties, {
              id: approach.id,
              detectors: [],
              isNew: true,
            });
            setApproaches((items) => [...items, approach]);
          }}
          addDetector={(id, channel, properties) => {
            const detector = {
              ...properties,
              id: nextId.current++,
              approachId: id,
              detectorChannel: channel,
              isNew: true,
              detectionTypes: properties?.detectionTypes ?? [],
            } as ConfigDetector;
            setApproaches((items) =>
              items.map((a) =>
                a.id === id
                  ? { ...a, detectors: [...a.detectors, detector] }
                  : a,
              ),
            );
          }}
          deleteApproach={(target) =>
            setApproaches((items) => items.filter((a) => a.id !== target.id))
          }
          deleteDetector={(id) =>
            setApproaches((items) =>
              items.map((a) => ({
                ...a,
                detectors: a.detectors.filter((d) => d.id !== id),
              })),
            )
          }
        />
      )}
      <details>
        <summary>Current detector properties</summary>
        <pre data-testid="mock-detector-properties">
          {JSON.stringify(
            approaches.flatMap((a) => a.detectors),
            null,
            2,
          )}
        </pre>
      </details>
      <details>
        <summary>Current approach properties</summary>
        <pre data-testid="mock-approach-properties">
          {JSON.stringify(approaches, null, 2)}
        </pre>
      </details>
      <details>
        <summary>Mock configuration API response</summary>
        <pre>{JSON.stringify(sample.expected, null, 2)}</pre>
      </details>
    </Stack>
  );
}
