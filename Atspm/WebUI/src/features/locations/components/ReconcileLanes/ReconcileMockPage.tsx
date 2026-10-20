import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import DiscrepancyButton from '../ApproachesReconcilationReport/DiscrepancyButton'
import { loadMockScenario, mockScenarios } from './mockScenarios'
import {
  applyLaneRecommendations,
  LaneReview,
  movementLabels,
  reconcileLanes,
  suggestLaneChannels,
} from './reconcileLanes'

// Deliberately uses local React state, never the real location store or API clients.
export default function ReconcileMockPage() {
  const [scenario, setScenario] = useState(0)
  const [data, setData] = useState(() => loadMockScenario(0))
  const [review, setReview] = useState<LaneReview>()
  const [selected, setSelected] = useState<string[]>([])
  const [channels, setChannels] = useState<Record<string, string[]>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  function reset(index: number) {
    setScenario(index)
    setData(loadMockScenario(index))
    setReview(undefined)
    setSelected([])
    setChannels({})
    setMessage('')
    setError('')
  }
  function compare() {
    const result = reconcileLanes(
      data.approaches,
      data.inventory,
      data.evidence,
      5
    )
    setReview(result)
    setSelected([])
    setChannels(suggestLaneChannels(data.approaches, result.recommendations))
    setMessage('')
    setError('')
  }
  function apply() {
    try {
      const approaches = applyLaneRecommendations(
        data.approaches,
        review!.recommendations.filter((r) => selected.includes(r.id)),
        Object.fromEntries(
          Object.entries(channels).map(([id, values]) => [
            id,
            values.map(Number),
          ])
        )
      )
      setData({ ...data, approaches })
      setReview(undefined)
      setSelected([])
      setMessage(
        'Applied to mock configuration only. Compare again to verify the result.'
      )
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Stack spacing={2} sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h4">Reconciliation mock scenarios</Typography>
      <Alert severity="info">
        Isolated test editor. Counts and configuration are fictional. No camera
        requests or database saves are made. Reload or reset to discard changes.
      </Alert>
      <TextField
        select
        label="Scenario"
        value={scenario}
        onChange={(e) => reset(Number(e.target.value))}
      >
        {mockScenarios.map((s, i) => (
          <MenuItem key={s.name} value={i}>
            {s.name}
          </MenuItem>
        ))}
      </TextField>
      <Typography>{mockScenarios[scenario].explanation}</Typography>
      <Typography variant="h6">Mock camera counts � zone NB-18</Typography>
      <Stack direction="row" spacing={2}>
        {(['through', 'left', 'right'] as const).map((movement) => (
          <TextField
            key={movement}
            type="number"
            size="small"
            label={movement}
            inputProps={{ min: 0 }}
            value={data.evidence[0][movement]}
            onChange={(e) => {
              setData({
                ...data,
                evidence: [
                  {
                    ...data.evidence[0],
                    [movement]: Math.max(0, Number(e.target.value)),
                  },
                ],
              })
              setReview(undefined)
              setSelected([])
            }}
          />
        ))}
      </Stack>
      <Typography variant="h6">Current mock configuration</Typography>
      <Box sx={{ '& th, & td': { p: 1, textAlign: 'left' } }}>
        <table aria-label="Mock lane configuration">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Zone</th>
              <th>Physical lane</th>
              <th>Movement</th>
            </tr>
          </thead>
          <tbody>
            {data.approaches[0].detectors.map((d) => (
              <tr key={d.id}>
                <td>{d.detectorChannel}</td>
                <td>{d.dectectorIdentifier}</td>
                <td>{d.laneNumber}</td>
                <td>
                  {movementLabels[String(d.movementType)] ??
                    String(d.movementType)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
      <Stack direction="row" spacing={2}>
        <Button variant="contained" onClick={compare}>
          Compare mock lanes
        </Button>
        <Button onClick={() => reset(scenario)}>Reset scenario</Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      {review && (
        <>
          <Typography variant="h6">
            Optional changes ({review.recommendations.length})
          </Typography>
          {review.recommendations.map((r) => (
            <Box key={r.id}>
              {r.warning && <Alert severity="warning">{r.warning}</Alert>}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DiscrepancyButton
                  width="auto"
                  item={{
                    id: r.id,
                    label: r.warning
                      ? r.description
                      : r
                          .movements!.slice(1)
                          .map(
                            (m, i) =>
                              `Add Channel ${channels[r.id]?.[i]} zone NB-18 ${movementLabels[m]}`
                          )
                          .join('; '),
                  }}
                  selected={selected.includes(r.id)}
                  onToggle={() =>
                    setSelected(
                      selected.includes(r.id)
                        ? selected.filter((id) => id !== r.id)
                        : [
                            ...selected.filter(
                              (id) =>
                                !review.recommendations.some(
                                  (other) =>
                                    other.id === id &&
                                    other.detectorId === r.detectorId
                                )
                            ),
                            r.id,
                          ]
                    )
                  }
                />
                {r.movements?.slice(1).map((m, i) => (
                  <TextField
                    key={m}
                    size="small"
                    type="number"
                    sx={{ width: 110 }}
                    label="Channel"
                    inputProps={{
                      min: 65,
                      'aria-label': `Channel for ${movementLabels[m]}`,
                    }}
                    value={channels[r.id]?.[i] ?? ''}
                    onChange={(e) =>
                      setChannels({
                        ...channels,
                        [r.id]: channels[r.id].map((v, j) =>
                          i === j ? e.target.value : v
                        ),
                      })
                    }
                  />
                ))}
              </Box>
            </Box>
          ))}
          {review.warnings
            .filter(
              (warning) =>
                !review.recommendations.some((r) => r.warning === warning)
            )
            .map((warning) => (
              <Alert key={warning} severity="warning">
                {warning}
              </Alert>
            ))}
          {review.recommendations.length === 0 && (
            <Typography>No changes recommended.</Typography>
          )}
          <Button
            variant="contained"
            disabled={selected.length === 0}
            onClick={apply}
          >
            Apply selected to mock configuration
          </Button>
        </>
      )}
    </Stack>
  )
}
