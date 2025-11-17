import ApproachOptions from '@/features/locations/components/ApproachOptions/ApproachOptions'
import EditDevices from '@/features/locations/components/editLocation/EditDevices'
import LocationGeneralOptionsEditor from '@/features/locations/components/editLocation/LocationGeneralOptionsEditor'
import { useLocationStore } from '@/features/locations/components/editLocation/locationStore'
import { useLocationWizardStore } from '@/features/locations/components/LocationSetupWizard/locationSetupWizardStore'
import { TabContext, TabList, TabPanel } from '@mui/lab'
import { Box, Button, Modal, Tab, Typography } from '@mui/material'
import { useRouter } from 'next/router'
import React, { memo, useCallback, useEffect, useState } from 'react'
import EditLocationHeader from './EditLocationHeader'
import WatchdogEditor from './WatchdogEditor'

function EditLocation() {
  const router = useRouter()
  const { useWizard, deviceVerificationStatus, approachVerificationStatus } =
    useLocationWizardStore()
  const location = useLocationStore((state) => state.location)
  const hasUnsavedChanges = useLocationStore((state) => state.hasUnsavedChanges)
  const resetStore = useLocationStore((state) => state.resetStore)
  const resetApproaches = useLocationStore((state) => state.resetApproaches)
  const [currentTab, setCurrentTab] = useState('1')

  useEffect(() => {
    if (!useWizard) return // Don't run if not using wizard
    // For a 2-step wizard:
    //  step 1 => "Devices" => tab "2"
    //  step 2 => "Approaches" => tab "3"
    if (deviceVerificationStatus === 'READY_TO_RUN') {
      setCurrentTab('2') // Devices tab
    } else if (approachVerificationStatus === 'READY_TO_RUN') {
      setCurrentTab('3') // Approaches tab
    }
  }, [useWizard, deviceVerificationStatus, approachVerificationStatus])

  const handleTabChange = useCallback(
    (_: React.SyntheticEvent, newTab: string) => {
      if (hasUnsavedChanges() && currentTab !== newTab) {
        setPendingTab(newTab)
        setDialogOpen(true)
      } else {
        setCurrentTab(newTab)
      }
    },
    [currentTab, hasUnsavedChanges]
  )

  const handleDialogClose = (confirm: boolean) => {
    setDialogOpen(false)
    if (confirm) {
      if (pendingTab) {
        updateSavedApproachesFromCurrent()
        setCurrentTab(pendingTab)
        setPendingTab(null)
      } else if (pendingRoute) {
        updateSavedApproachesFromCurrent()
        router.push(pendingRoute)
        setPendingRoute(null)
      }
    } else {
      setPendingTab(null)
      setPendingRoute(null)
    }
  }

  useEffect(() => {
    const handleRouteChangeStart = (url: string) => {
      if (hasUnsavedChanges() && url !== router.asPath) {
        setPendingRoute(url)
        setDialogOpen(true)
        router.events.emit('routeChangeError')
        throw 'Route change aborted due to unsaved changes'
      }
    }

  useEffect(() => () => resetStore(), [resetStore])

  if (!location) return null

  return (
    <>
      <TabContext value={currentTab}>
        <EditLocationHeader />
        <TabList onChange={handleTabChange} aria-label="Location Tabs">
          <Tab label="General" value="1" />
          <Tab label="Devices" value="2" />
          <Tab label="Approaches" value="3" />
          <Tab label="Watchdog" value="4" />
        </TabList>

        <TabPanel value="1" sx={{ padding: 0 }}>
          <LocationGeneralOptionsEditor />
        </TabPanel>
        <TabPanel value="2" sx={{ padding: 0, marginBottom: '100px' }}>
          <EditDevices />
        </TabPanel>
        <TabPanel value="3" sx={{ padding: 0, minHeight: '400px' }}>
          <ApproachOptions />
        </TabPanel>
        <TabPanel value="4" sx={{ padding: 0 }}>
          <WatchdogEditor />
        </TabPanel>
      </TabContext>

      <Prompt />
    </>
  )
}

export default memo(EditLocation)
