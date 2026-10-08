import { getDeviceActiveDevicesByLocationFromLocationId } from '@/api/config/device/device'
import { useFlags } from '@/feature-flags/FeatureFlagContext'
import {
  groupTmcSources,
  normalizeTmcDevices,
} from '@/features/charts/turningMovementCounts/useTmcSources'
import { useGetDeviceConfigurations } from '@/features/devices/api'
import { reportsRequest } from '@/lib/axios'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { format, startOfDay, subDays } from 'date-fns'
import { useState } from 'react'
import { useQuery } from 'react-query'
import { useLocationStore } from '../editLocation/locationStore'
import { laneDecoders } from './laneDecoders'
import {
  applyLaneRecommendations,
  LaneReview,
  reconcileLanes,
  ZoneEvidence,
  ZoneInventory,
} from './reconcileLanes'

export default function ReconcileLanesButton() {
  const flags = useFlags()
  const [open, setOpen] = useState(false)
  if (flags.laneReconciliation !== true) return null
  return (
    <>
      <Button variant="outlined" onClick={() => setOpen(true)}>
        Reconcile Lanes
      </Button>
      {open && <LaneDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function LaneDialog({ onClose }: { onClose: () => void }) {
  const location = useLocationStore((s) => s.location)!
  const approaches = useLocationStore((s) => s.approaches)
  const [selectedDecoder, setDecoder] = useState('')
  const [start, setStart] = useState(
    format(subDays(startOfDay(new Date()), 3), "yyyy-MM-dd'T'HH:mm")
  )
  const [end, setEnd] = useState(
    format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm")
  )
  const [minimum, setMinimum] = useState(5)
  const [review, setReview] = useState<LaneReview>()
  const [evidence, setEvidence] = useState<ZoneEvidence[]>([])
  const [snapshot, setSnapshot] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [channels, setChannels] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)
  const { data: configurations } = useGetDeviceConfigurations()
  const devicesQuery = useQuery(['lane-review-devices', location.id], () =>
    getDeviceActiveDevicesByLocationFromLocationId(location.id)
  )
  const devices = normalizeTmcDevices(devicesQuery.data).map((d) => ({
    ...d,
    deviceConfiguration: d.deviceConfiguration ?? {
      port: configurations?.value?.find((c) => c.id === d.deviceConfigurationId)
        ?.port,
    },
  }))
  const sources = groupTmcSources(devices).filter(
    (s) => s.decoder && laneDecoders[s.decoder]
  )
  // Use the same configured decoder groups as TMC. A single supported source needs no choice.
  const decoder =
    sources.length === 1
      ? sources[0].decoder!
      : sources.some((s) => s.decoder === selectedDecoder)
        ? selectedDecoder
        : ''
  const inputs = JSON.stringify({
    decoder,
    start,
    end,
    minimum,
    approaches,
    devices,
  })
  const stale = snapshot !== inputs
  async function run() {
    setBusy(true)
    setError('')
    setReview(undefined)
    setEvidence([])
    setApplied(false)
    setSelected([])
    setChannels({})
    try {
      if (
        !decoder ||
        !start ||
        !end ||
        end <= start ||
        !Number.isInteger(minimum) ||
        minimum < 1
      )
        throw new Error(
          'Choose a decoder, valid date range and positive minimum count.'
        )
      const source = sources.find((s) => s.decoder === decoder)
      if (!source)
        throw new Error('No configured device supports this decoder.')
      const adapter = laneDecoders[decoder]
      const chosen = devices
        .filter((d) => source.deviceIds.includes(d.id!))
        .sort((a, b) => a.id! - b.id!)
      const unique = [
        ...new Map(
          chosen
            .slice()
            .reverse()
            .map((d) => [adapter.identity(d), d])
        ).values(),
      ]
      const inventory: ZoneInventory[] = await Promise.all(
        unique.map(async (d) => {
          try {
            return { deviceId: d.id!, names: await adapter.readZones(d) }
          } catch {
            return { deviceId: d.id!, names: [], error: 'Get Zones failed' }
          }
        })
      )
      const result = await reportsRequest<{
        zoneEvidence: ZoneEvidence[]
        warnings: string[]
      }>({
        url: '/api/v1/TurningMovementCounts/getReportData',
        method: 'POST',
        data: {
          locationIdentifier: location.locationIdentifier,
          source: 'devices',
          deviceIds: unique.map((d) => d.id),
          decoder,
          start,
          end,
          binSize: 15,
          reconcileLanes: true,
        },
      })
      if (!Array.isArray(result.zoneEvidence))
        throw new Error(
          'The report API must be updated to support zone evidence.'
        )
      setEvidence(result.zoneEvidence)
      const analysis = reconcileLanes(
        approaches,
        inventory,
        result.zoneEvidence,
        minimum
      )
      // Partial responses are useful for diagnosis but cannot safely justify automatic edits.
      if (result.warnings?.length) {
        analysis.warnings.unshift(
          ...result.warnings,
          'Source warnings are present. Resolve them and rerun before applying recommendations.'
        )
        analysis.recommendations = []
      }
      setReview(analysis)
      setSnapshot(inputs)
    } catch (e) {
      const response = (e as { response?: { data?: unknown } }).response?.data
      setError(
        typeof response === 'string'
          ? response
          : e instanceof Error
            ? e.message
            : 'Unable to reconcile lanes.'
      )
    } finally {
      setBusy(false)
    }
  }
  function apply() {
    try {
      if (stale)
        throw new Error(
          'Configuration or review inputs changed. Run reconciliation again.'
        )
      const next = applyLaneRecommendations(
        approaches,
        review!.recommendations.filter((r) => selected.includes(r.id)),
        Object.fromEntries(
          Object.entries(channels).map(([key, value]) => [
            key,
            value.split(',').map(Number),
          ])
        )
      )
      useLocationStore.setState({
        approaches: next,
        channelMap: new Map(
          next.flatMap((a) =>
            a.detectors.map(
              (d) => [d.id, Number(d.detectorChannel)] as [number, number]
            )
          )
        ),
      })
      setApplied(true)
      setSelected([])
      setReview(undefined)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Reconcile Lanes</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            Compare the existing location configuration with independent device
            zones. Any template was already applied when the location was
            created. Channels 1–64 are excluded. Counts use the same location
            timezone as TMC reports. A count indicates an observed movement, not
            whether that turn is legally allowed.
          </Alert>
          <TextField
            select
            label="Decoder"
            value={decoder}
            onChange={(e) => setDecoder(e.target.value)}
            disabled={busy || sources.length === 1}
          >
            {sources.map((s) => (
              <MenuItem key={s.key} value={s.decoder}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
          {!devicesQuery.isLoading && sources.length === 0 && (
            <Alert severity="warning">
              No configured decoder with lane reconciliation support was found.
            </Alert>
          )}
          {devicesQuery.isError && (
            <Alert severity="error">
              Configuration could not be loaded. Close and reopen to retry.
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Start (location time)"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={busy}
            />
            <TextField
              label="End (exclusive)"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={busy}
            />
            <TextField
              label="Minimum observed count"
              type="number"
              value={minimum}
              onChange={(e) => setMinimum(Number(e.target.value))}
              disabled={busy}
              inputProps={{ min: 1 }}
            />
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          {applied && (
            <Alert severity="success">
              Changes staged in the location editor. Review and save the
              location to persist them.
            </Alert>
          )}
          <Button variant="contained" disabled={busy || !decoder} onClick={run}>
            {busy ? 'Reading zones and statistics…' : 'Compare lanes'}
          </Button>
          {review && (
            <>
              {stale && (
                <Alert severity="warning">
                  Inputs or configuration changed. Compare again before
                  applying.
                </Alert>
              )}
              <Typography variant="h6">
                Recommended changes ({review.recommendations.length})
              </Typography>
              {review.recommendations.length === 0 && (
                <Typography>
                  No changes can be recommended confidently. Review warnings
                  below.
                </Typography>
              )}
              {review.recommendations.map((r) => (
                <Box key={r.id}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selected.includes(r.id)}
                        onChange={(_, checked) =>
                          setSelected(
                            checked
                              ? [...selected, r.id]
                              : selected.filter((id) => id !== r.id)
                          )
                        }
                      />
                    }
                    label={r.description}
                  />
                  {r.movements && (
                    <TextField
                      fullWidth
                      label={`New channels for ${r.movements.slice(1).join(', ')} (comma separated)`}
                      value={channels[r.id] ?? ''}
                      onChange={(e) =>
                        setChannels({ ...channels, [r.id]: e.target.value })
                      }
                      helperText="Unused channels above 64. The existing entry keeps its channel; other settings and zone name are copied."
                    />
                  )}
                </Box>
              ))}
              <Typography variant="h6">
                Warnings — verify manually ({review.warnings.length})
              </Typography>
              {review.warnings.map((warning, i) => (
                <Alert key={i} severity="warning">
                  {warning}
                </Alert>
              ))}
              <Typography variant="h6">Observed zone counts</Typography>
              <Box
                sx={{
                  overflowX: 'auto',
                  '& th, & td': { p: 1, textAlign: 'left' },
                }}
              >
                <table aria-label="Observed zone counts">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Zone</th>
                      <th>Through</th>
                      <th>Left</th>
                      <th>Right</th>
                      <th>Bins returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.map((e) => (
                      <tr key={`${e.deviceId}:${e.zoneName}`}>
                        <td>{e.deviceId}</td>
                        <td>{e.zoneName}</td>
                        <td>{e.through}</td>
                        <td>{e.left}</td>
                        <td>{e.right}</td>
                        <td>{e.bins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
              <Typography variant="caption">
                Counts cover returned bins only. Missing bins and zero counts do
                not prove that a movement is unavailable. Bin statistics cannot
                determine protected versus permissive operation.
              </Typography>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button
          variant="contained"
          onClick={apply}
          disabled={busy || stale || selected.length === 0}
        >
          Apply selected to editor
        </Button>
      </DialogActions>
    </Dialog>
  )
}
