import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { ComponentProps, useState } from 'react'
import { NavigationProvider } from '../Cell/CellNavigation'
import { DetectorEditor } from '../editDetector/DetectorEditor'
import {
  ConfigDetector,
  LocationStore,
  useLocationStore,
} from '../editLocation/locationStore'
import { useLocationEditorOptions } from '../editLocation/useLocationEditorOptions'

/** Manual configuration from inventory does not require movement-count evidence. */
export function UnusedZoneDetector({
  zone,
  disabled,
  onAdded,
}: {
  zone: string
  disabled: boolean
  onAdded: () => void
}) {
  const { approaches, location, addDetector } = useLocationStore()
  const [draft, setDraft] = useState<ConfigDetector | null>(null)
  const [approachId, setApproachId] = useState<number | ''>('')
  const [errors, setErrors] = useState<LocationStore['errors']>(null)
  const approach = approaches.find((a) => a.id === approachId)
  const existing = approaches.flatMap((a) => a.detectors)
  const channel = Number(draft?.detectorChannel)
  const invalid =
    !Number.isInteger(channel) ||
    channel < 65 ||
    existing.some((d) => Number(d.detectorChannel) === channel)
  function open() {
    let next = 65
    while (existing.some((d) => Number(d.detectorChannel) === next)) next++
    let id = -1
    while (existing.some((d) => d.id === id)) id--
    setErrors(null)
    setApproachId('')
    setDraft({
      id,
      isNew: true,
      detectorChannel: next,
      dectectorIdentifier: zone,
      detectionTypes: [],
      detectionHardware: 'NA',
      movementType: 'NA',
      laneType: 'V',
      laneNumber: null,
      latencyCorrection: 0,
      dateAdded: new Date().toISOString(),
      dateDisabled: null,
      decisionPoint: null,
      distanceFromStopBar: null,
      movementDelay: null,
      detectorComments: [],
    } as unknown as ConfigDetector)
  }
  return (
    <>
      <Button size="small" onClick={open} disabled={disabled}>
        Add Detector
      </Button>
      <Dialog
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle>Add detector for zone {zone}</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Verify the zone purpose, choose an approach and configure the
            detector. Adding stages a draft; save the approach to persist it.
          </Typography>
          <TextField
            select
            fullWidth
            label="Approach"
            value={approachId}
            onChange={(e) => setApproachId(Number(e.target.value))}
            sx={{ mb: 2 }}
          >
            {approaches.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.description || 'Approach'} ({a.id})
              </MenuItem>
            ))}
          </TextField>
          {!approaches.length && (
            <Alert severity="info">
              Create an approach before adding a detector.
            </Alert>
          )}
          {draft && approach && (
            <>
              {invalid && (
                <Alert severity="error">
                  Channel must be a unique whole number above 64.
                </Alert>
              )}
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <NavigationProvider>
                  <DraftDetectorEditor
                    locationTypeId={location?.locationTypeId}
                    approach={{ ...approach, detectors: [draft] }}
                    deleteMode={false}
                    errors={errors}
                    setErrors={setErrors}
                    warnings={null}
                    channelMap={
                      new Map(
                        [...existing, draft].map((d) => [
                          d.id,
                          Number(d.detectorChannel),
                        ])
                      )
                    }
                    updateDetector={(_id, name, value) =>
                      setDraft(
                        (current) =>
                          current && {
                            ...current,
                            [name]: value === '' ? null : value,
                          }
                      )
                    }
                  />
                </NavigationProvider>
              </LocalizationProvider>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={
              !approach ||
              invalid ||
              disabled ||
              !draft?.dectectorIdentifier?.trim()
            }
            onClick={() => {
              if (!draft || !approach || invalid) return
              addDetector(approach.id, channel, draft)
              setDraft(null)
              onAdded()
            }}
          >
            Add detector to editor
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function DraftDetectorEditor({
  locationTypeId,
  ...props
}: Omit<
  ComponentProps<typeof DetectorEditor>,
  'detectionTypes' | 'locationTypeName'
> & { locationTypeId?: number }) {
  const options = useLocationEditorOptions(locationTypeId)
  return <DetectorEditor {...props} {...options} />
}
