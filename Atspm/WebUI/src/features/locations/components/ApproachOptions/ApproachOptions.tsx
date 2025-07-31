import {
  useGetDeviceConfiguration,
  useGetLocationSyncLocationFromKey,
} from '@/api/config/aTSPMConfigurationApi'
import { AddButton } from '@/components/addButton'
import ApproachesInfo from '@/features/locations/components/ApproachesInfo/approachesInfo'
import ApproachesReconcilationReport from '@/features/locations/components/ApproachesReconcilationReport/ApproachesReconcilationReport'
import { LocationDiscrepancyReport } from '@/features/locations/components/ApproachesReconcilationReport/useDiscrepancyStatuses'
import { NavigationProvider } from '@/features/locations/components/Cell/CellNavigation'
import DetectorsInfo from '@/features/locations/components/DetectorsInfo/detectorsInfo'
import EditApproach from '@/features/locations/components/editApproach/EditApproach'
import { useLocationStore } from '@/features/locations/components/editLocation/locationStore'
import { useLocationWizardStore } from '@/features/locations/components/LocationSetupWizard/locationSetupWizardStore'
import { usePostRequest } from '@/hooks/usePostRequest'
import { configAxios } from '@/lib/axios'
import { useNotificationStore } from '@/stores/notifications'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SyncIcon from '@mui/icons-material/Sync'
import { LoadingButton } from '@mui/lab'
import {
  Box,
  Button,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Typography,
} from '@mui/material'
import { AxiosHeaders } from 'axios'
import Cookies from 'js-cookie'
import { useCallback, useEffect, useMemo, useState } from 'react'

const token = Cookies.get('token')
const headers: AxiosHeaders = new AxiosHeaders({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
})

export function useGetZones() {
  const mutation = usePostRequest({
    url: '/Detector/retrieveDetectionData',
    configAxios,
    headers,
    notify: false,
  })
  return mutation
}

const ApproachOptions = () => {
  const {
    approachVerificationStatus,
    setApproachVerificationStatus,
    setBadApproaches,
    setBadDetectors,
  } = useLocationWizardStore()
  const { addNotification } = useNotificationStore()

  const { approaches, location, addApproach } = useLocationStore()
  const { mutateAsync, isLoading } = useGetLocationSyncLocationFromKey()
  const { mutateAsync: getZones } = useGetZones()
  const [zones, setZones] = useState([])
  const [showZones, setShowZones] = useState(false)
  const { data: deviceConfigurationsData } = useGetDeviceConfiguration()

  const handleToggleZones = () => {
    setShowZones((prev) => !prev)
  }

  const [showSummary, setShowSummary] = useState(false)
  const [categories, setCategories] = useState<LocationDiscrepancyReport>({
    foundPhaseNumbers: [],
    notFoundApproaches: [],
    foundDetectorChannels: [],
    notFoundDetectorChannels: [],
  })

  const currentPhaseNumbersUsed = useMemo(
    () =>
      approaches
        .flatMap((approach) => [
          approach.protectedPhaseNumber,
          approach.permissivePhaseNumber,
          approach.pedestrianPhaseNumber,
        ])
        .filter((phase) => phase != null),
    [approaches]
  )

  const currentDetectorChannelsUsed = useMemo(
    () =>
      approaches
        .flatMap((approach) =>
          approach.detectors.map((det) => det.detectorChannel)
        )
        .filter((chan) => chan != null),
    [approaches]
  )

  const handleGetZones = async () => {
    // get device with detection type FIRCamera
    const device = location?.devices?.find(
      (device) => device?.deviceType === 'FIRCamera'
    )
    if (!device) {
      addNotification({
        title: 'No FIRCamera device found',
        type: 'error',
      })
      return
    }

    const deviceConfig = deviceConfigurationsData?.value?.find(
      (config) => config.id === device?.deviceConfigurationId
    )
    try {
      const zones = await getZones({
        IpAddress: device?.ipaddress,
        port: deviceConfig?.port?.toString(),
        detectionType: device?.deviceType,
        deviceId: device?.deviceIdentifier?.toString(),
      })
      setZones(zones)
      setShowZones(true)
    } catch (error) {
      console.error('Failed to get zones:', error)
      addNotification({
        title: 'Error fetching zones',
        type: 'error',
      })
    }
  }

  const handleSyncLocation = useCallback(async () => {
    if (!location?.id) return

    try {
      const response = await mutateAsync({ key: location.id })

      // Identify removed approaches
      const notFoundApproaches =
        response?.removedApproachIds
          ?.map((id) => approaches.find((a) => a.id === id))
          .filter(Boolean) || []

      if (response?.removedApproachIds) {
        setBadApproaches(response.removedApproachIds)
      }
      if (response?.removedDetectors) {
        setBadDetectors(response.removedDetectors)
      }

      const foundPhaseNumbers: number[] = []

      if (response?.loggedButUnusedProtectedOrPermissivePhases) {
        foundPhaseNumbers.push(
          ...response.loggedButUnusedProtectedOrPermissivePhases
        )
      }
      if (response?.loggedButUnusedOverlapPhases) {
        foundPhaseNumbers.push(...response.loggedButUnusedOverlapPhases)
      }

      setCategories({
        foundPhaseNumbers,
        notFoundApproaches,
        foundDetectorChannels: response?.loggedButUnusedDetectorChannels || [],
        notFoundDetectorChannels: response?.removedDetectors || [],
      })
    } catch (error) {
      console.error(error)
    }
    setApproachVerificationStatus('DONE')
  }, [
    mutateAsync,
    location?.id,
    approaches,
    setBadApproaches,
    setBadDetectors,
    setApproachVerificationStatus,
  ])

  useEffect(() => {
    async function handleSyncLocationOnMount() {
      if (approachVerificationStatus === 'READY_TO_RUN') {
        await handleSyncLocation()
        setApproachVerificationStatus('DONE')
      }
    }
    handleSyncLocationOnMount()
  }, [
    approachVerificationStatus,
    handleSyncLocation,
    setApproachVerificationStatus,
  ])

  const approachesSynced = approachVerificationStatus === 'DONE'

  const combinedLocation = { ...location, approaches }

  const hasFirCameraDevice = useMemo(() => {
    return combinedLocation?.devices?.some(
      (device) => device?.deviceType === 'FIRCamera'
    )
  }, [combinedLocation?.devices])

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <AddButton
          label="New Approach"
          onClick={() => addApproach()}
          sx={{ mr: 1 }}
        />

        <Button
          variant="outlined"
          onClick={() => setShowSummary((prev) => !prev)}
        >
          {showSummary ? 'Hide Summary' : 'Summary'}
        </Button>

        <LoadingButton
          startIcon={<SyncIcon />}
          loading={isLoading}
          loadingPosition="start"
          variant="outlined"
          onClick={handleSyncLocation}
          sx={{ ml: 1 }}
        >
          Reconcile Approaches
        </LoadingButton>
        {hasFirCameraDevice && (
          <Button variant="outlined" onClick={handleGetZones} sx={{ ml: 1 }}>
            Get Zones
          </Button>
        )}
      </Box>
      {showZones && (
        <Paper sx={{ mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              Found Zones:
            </Typography>
            <IconButton size="small" onClick={handleToggleZones}>
              {showZones ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={showZones}>
            <Divider sx={{ mx: 1 }} />
            <Box sx={{ p: 2 }}>
              {zones.length > 0 ? (
                zones.map((zone, index) => (
                  <Typography key={index} variant="body1">
                    {zone}
                  </Typography>
                ))
              ) : (
                <Typography variant="body1" color="textSecondary">
                  No zones found
                </Typography>
              )}
            </Box>
          </Collapse>
        </Paper>
      )}

      {approachesSynced && (
        <ApproachesReconcilationReport categories={categories} />
      )}
      {showSummary && (
        <Paper sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ p: 2, fontWeight: 'bold' }}>
            Approaches
          </Typography>
          <Divider sx={{ m: 1 }} />
          <ApproachesInfo location={combinedLocation} />
          <Typography variant="h6" sx={{ p: 2, fontWeight: 'bold' }}>
            Detectors
          </Typography>
          <Divider sx={{ m: 1 }} />
          <DetectorsInfo location={combinedLocation} />
        </Paper>
      )}

      {approaches.length > 0 ? (
        <NavigationProvider>
          {approaches.map((approach) => (
            <EditApproach key={approach.id} approach={approach} />
          ))}
        </NavigationProvider>
      ) : (
        <Box sx={{ p: 2, mt: 2, textAlign: 'center' }}>
          <Typography variant="caption" fontStyle="italic">
            No approaches found
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export default ApproachOptions
