import { useDeviceTestDownloadEnabled } from '@/features/devices/api/useDeviceTestDownloadEnabled'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import LocationSetupWizard from './LocationSetupWizard'

jest.mock('@/features/devices/api/useDeviceTestDownloadEnabled', () => ({
  useDeviceTestDownloadEnabled: jest.fn(),
}))
jest.mock('./locationSetupWizardStore', () => ({
  useLocationWizardStore: () => ({
    activeStep: 0,
    setActiveStep: jest.fn(),
    setDeviceVerificationStatus: jest.fn(),
    setApproachVerificationStatus: jest.fn(),
    resetStore: jest.fn(),
    setUseWizard: jest.fn(),
  }),
}))
jest.mock('@/stores/notifications', () => ({
  useNotificationStore: () => ({ addNotification: jest.fn() }),
}))

test('disabled flag hides device verification but leaves reconciliation usable', () => {
  ;(useDeviceTestDownloadEnabled as jest.Mock).mockReturnValue(false)
  render(<LocationSetupWizard />)
  expect(screen.queryByText('Verify Devices')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Run Verification' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Run Reconciliation' })
  ).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
})

test('enabled flag exposes device verification', () => {
  ;(useDeviceTestDownloadEnabled as jest.Mock).mockReturnValue(true)
  render(<LocationSetupWizard />)
  expect(screen.getByRole('button', { name: 'Run Verification' })).toBeVisible()
})
