import { Device } from '@/api/config/aTSPMConfigurationApi.schemas'
import { DeviceEventDownload } from '@/api/data/aTSPMLogDataApi.schemas'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import LanIcon from '@mui/icons-material/Lan'
import { LoadingButton } from '@mui/lab'
import {
  Badge,
  Box,
  Button,
  Modal,
  Paper,
  TextField,
  Typography,
} from '@mui/material'

type CombinedDeviceEvent = Device &
  DeviceEventDownload & {
    ipModified: boolean
  }

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
  return deviceName
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
  const handleIpChange = (deviceId: number, newIp: string) => {
    setIpChanges((prev) => ({ ...prev, [deviceId]: newIp }))
  }

  return (
    <Modal open={open} onClose={onClose}>
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
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '3fr 2fr 1fr 1fr 2fr',
            alignItems: 'center',
            px: 1,
            pb: 2,
          }}
        >
          <Typography variant="subtitle2">Device Name</Typography>
          <Typography variant="subtitle2">IP Address</Typography>
          <Typography variant="subtitle2" sx={{ textAlign: 'right' }}>
            Rows added in last 24 hours
          </Typography>
          <Typography variant="subtitle2" sx={{ textAlign: 'right' }}>
            New Rows Added
          </Typography>
          <Typography variant="subtitle2" sx={{ textAlign: 'center' }}>
            Status
          </Typography>
        </Box>

        {devices?.map((device, i) => {
          const newIp = ipChanges[device.id] ?? device.ipaddress
          const dbCount = device.beforeWorkflowEventCount ?? 0
          const downloadedCount = device.changeInEventCount ?? 0

          return (
            <Box
              key={i}
              sx={{
                display: 'grid',
                gridTemplateColumns: '3fr 2fr 1fr 1fr 2fr',
                alignItems: 'center',
                gap: 2,
                p: 1.5,
                border: '1px solid #ccc',
                borderRadius: '4px',
                mb: 1,
              }}
            >
              <Typography>{getDeviceName(device)}</Typography>

              <Badge
                color="error"
                variant="dot"
                invisible={device.ipaddress === newIp}
              >
                <TextField
                  label="IP Address"
                  size="small"
                  value={newIp}
                  onChange={(e) => handleIpChange(device.id, e.target.value)}
                />
              </Badge>

              <Typography sx={{ textAlign: 'right' }}>
                {isResyncing ? '' : dbCount.toLocaleString()}
              </Typography>

              <Typography sx={{ textAlign: 'right' }}>
                {isResyncing ? '' : downloadedCount.toLocaleString()}
              </Typography>

              <Box
                sx={{
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isResyncing ? (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    Loading...
                  </Typography>
                ) : dbCount > 0 ? (
                  <>
                    <CheckIcon color="success" />
                    <Typography variant="body2" sx={{ ml: 1 }}>
                      Data found
                    </Typography>
                  </>
                ) : (
                  <>
                    <CloseIcon color="error" />
                    <Typography variant="body2" sx={{ ml: 1 }}>
                      No data found
                    </Typography>
                  </>
                )}
              </Box>
            </Box>
          )
        })}

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mt: 3,
            gap: 1,
          }}
        >
          <LoadingButton
            startIcon={<LanIcon />}
            loading={isResyncing}
            loadingPosition="start"
            variant="contained"
            color="primary"
            onClick={onResync}
          >
            Verify IP Addresses
          </LoadingButton>

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
