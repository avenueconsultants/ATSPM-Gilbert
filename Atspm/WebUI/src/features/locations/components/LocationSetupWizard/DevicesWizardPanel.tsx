import type { Device } from '@/api/config'
import type { DeviceEventDownload } from '@/api/data'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import LanIcon from '@mui/icons-material/Lan'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import { LoadingButton } from '@mui/lab'
import {
  Alert,
  Box,
  Button,
  Modal,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'

type CombinedDeviceEvent = Device & Partial<DeviceEventDownload>

interface DevicesWizardModalProps {
  open: boolean
  onClose: () => void
  onSaveAndClose: () => void
  devices: CombinedDeviceEvent[] | undefined
  onResync: () => void
  isResyncing: boolean
  ipChanges: Record<number, string>
  setIpChanges: React.Dispatch<React.SetStateAction<Record<number, string>>>
}

const getDeviceName = (device: Device) => {
  let deviceName = ''
  if (device?.deviceConfiguration?.product) {
    deviceName +=
      device.deviceConfiguration.product?.manufacturer +
      ' - ' +
      device.deviceConfiguration.product?.model +
      ' '
  }
  deviceName += device?.firmware ? device?.firmware : ''
  return deviceName || `Device ${device.id}`
}

const formatCount = (count?: number) =>
  typeof count === 'number' ? count.toLocaleString() : '--'

const getVerificationStatus = (device: CombinedDeviceEvent) => {
  const beforeWorkflowEventCount = device.beforeWorkflowEventCount
  const afterWorkflowEventCount = device.afterWorkflowEventCount
  const changeInEventCount = device.changeInEventCount

  const hasVerificationResult =
    typeof beforeWorkflowEventCount === 'number' &&
    typeof afterWorkflowEventCount === 'number' &&
    typeof changeInEventCount === 'number'

  if (!hasVerificationResult) {
    return {
      detail: '',
      icon: <RadioButtonUncheckedIcon color="disabled" fontSize="small" />,
      label: 'Not checked',
    }
  }

  if (changeInEventCount > 0) {
    return {
      detail:
        `${changeInEventCount.toLocaleString()} new rows downloaded.`,
      icon: <CheckCircleOutlineIcon color="success" fontSize="small" />,
      label: 'Connection verified',
    }
  }

  return {
    detail: '',
    icon: <ErrorOutlineIcon color="error" fontSize="small" />,
    label: 'Unable to verify',
  }
}

const DevicesWizardModal = ({
  open,
  onClose,
  onSaveAndClose,
  devices,
  onResync,
  isResyncing,
  ipChanges,
  setIpChanges,
}: DevicesWizardModalProps) => {
  const hasDevices = (devices?.length ?? 0) > 0

  const handleIpChange = (deviceId: number, newIp: string) => {
    setIpChanges((prev) => ({ ...prev, [deviceId]: newIp }))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="device-verification-title"
    >
      <Paper
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90%',
          maxWidth: 1000,
          maxHeight: '90vh',
          overflowY: 'auto',
          p: 4,
          borderRadius: 2,
        }}
      >
        <Typography
          id="device-verification-title"
          variant="h6"
          sx={{ fontWeight: 600, mb: 1 }}
        >
          Verify Device IP Addresses
        </Typography>

        <Alert severity="info" sx={{ mb: 3 }}>
          The verification workflow attempts to download the previous 24 hours
          of event data from each device. &quot;Existing Rows&quot; shows what
          was already in ATSPM before the workflow ran, and &quot;Rows
          Inserted&quot; shows what was downloaded during this check.
        </Alert>

        <TableContainer>
          <Table size="small" sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '30%' }}>Device Name</TableCell>
                <TableCell sx={{ width: '22%' }}>IP Address</TableCell>
                <TableCell align="right" sx={{ width: '14%' }}>
                  Existing Rows
                </TableCell>
                <TableCell align="right" sx={{ width: '14%' }}>
                  Rows Inserted
                </TableCell>
                <TableCell sx={{ width: '20%', minWidth: 220 }}>
                  Status
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {devices?.map((device) => {
                const newIp = ipChanges[device.id] ?? device.ipaddress ?? ''
                const existingRowCount = device.beforeWorkflowEventCount
                const insertedRowCount = device.changeInEventCount
                const verificationStatus = getVerificationStatus(device)
                const hasPendingIpChange = device.ipaddress !== newIp

                return (
                  <TableRow key={device.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {getDeviceName(device)}
                      </Typography>
                      {device.deviceIdentifier && (
                        <Typography variant="caption" color="text.secondary">
                          {device.deviceIdentifier}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ minWidth: 220 }}>
                        <TextField
                          fullWidth
                          label="IP Address"
                          size="small"
                          value={newIp}
                          onChange={(e) =>
                            handleIpChange(device.id, e.target.value)
                          }
                        />
                        <Typography
                          variant="caption"
                          color={
                            hasPendingIpChange
                              ? 'warning.main'
                              : 'text.secondary'
                          }
                          sx={{ display: 'block', mt: 0.5 }}
                        >
                          {hasPendingIpChange
                            ? 'Pending change'
                            : 'Saved value'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      {isResyncing ? '--' : formatCount(existingRowCount)}
                    </TableCell>
                    <TableCell align="right">
                      {isResyncing ? '--' : formatCount(insertedRowCount)}
                    </TableCell>
                    <TableCell>
                      {isResyncing ? (
                        <Typography variant="body2" color="text.secondary">
                          Checking...
                        </Typography>
                      ) : (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1,
                          }}
                        >
                          <Box sx={{ mt: 0.25 }}>{verificationStatus.icon}</Box>
                          <Box>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600 }}
                            >
                              {verificationStatus.label}
                            </Typography>
                            {verificationStatus.detail && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {verificationStatus.detail}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            mt: 3,
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Box>
            <LoadingButton
              startIcon={<LanIcon />}
              loading={isResyncing}
              loadingPosition="start"
              variant="contained"
              color="primary"
              disabled={!hasDevices}
              onClick={onResync}
            >
              Verify IP Addresses
            </LoadingButton>
          </Box>

          <Box>
            <Button onClick={onClose}>Close</Button>
            <Button
              variant="contained"
              onClick={onSaveAndClose}
              disabled={isResyncing}
            >
              Save and Close
            </Button>
          </Box>
        </Box>
      </Paper>
    </Modal>
  )
}

export default DevicesWizardModal
