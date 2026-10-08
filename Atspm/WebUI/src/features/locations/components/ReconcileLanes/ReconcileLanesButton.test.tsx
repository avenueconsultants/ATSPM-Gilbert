import { getDeviceActiveDevicesByLocationFromLocationId } from '@/api/config/device/device'
import { useFlags } from '@/feature-flags/FeatureFlagContext'
import { useGetDeviceConfigurations } from '@/features/devices/api'
import { configRequest, reportsRequest } from '@/lib/axios'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import {
  ConfigApproach,
  ConfigLocation,
  useLocationStore,
} from '../editLocation/locationStore'
import ReconcileLanesButton from './ReconcileLanesButton'

jest.mock('@/feature-flags/FeatureFlagContext', () => ({ useFlags: jest.fn() }))
jest.mock('@/features/devices/api', () => ({
  useGetDeviceConfigurations: jest.fn(),
}))
jest.mock('@/api/config/device/device', () => ({
  getDeviceActiveDevicesByLocationFromLocationId: jest.fn(),
}))
jest.mock('@/lib/axios', () => ({
  configRequest: jest.fn(),
  reportsRequest: jest.fn(),
}))

beforeAll(() => {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value))
})

it.each([{}, { laneReconciliation: false }, { laneReconciliation: 'true' }])(
  'hides the button unless explicitly enabled: %p',
  (flags) => {
    ;(useFlags as jest.Mock).mockReturnValue(flags)
    render(<ReconcileLanesButton />)
    expect(
      screen.queryByRole('button', { name: 'Reconcile Lanes' })
    ).not.toBeInTheDocument()
  }
)

it('shows the separate button when enabled', () => {
  ;(useFlags as jest.Mock).mockReturnValue({ laneReconciliation: true })
  render(<ReconcileLanesButton />)
  expect(screen.getByRole('button', { name: 'Reconcile Lanes' })).toBeEnabled()
})

async function openReview(warnings: string[] = []) {
  jest.clearAllMocks()
  ;(useFlags as jest.Mock).mockReturnValue({ laneReconciliation: true })
  ;(useGetDeviceConfigurations as jest.Mock).mockReturnValue({
    data: { value: [] },
  })
  const approaches = [
    {
      id: 10,
      protectedPhaseNumber: 1,
      directionTypeId: 'NB',
      detectors: [
        {
          id: 100,
          detectorChannel: 301,
          dectectorIdentifier: 'Lane Alpha',
          movementType: 'L',
          laneType: 'V',
          laneNumber: 1,
        },
      ],
    },
  ] as unknown as ConfigApproach[]
  useLocationStore.setState({
    location: { id: 1, locationIdentifier: 'Site' } as ConfigLocation,
    approaches,
    savedApproaches: structuredClone(approaches),
  })
  ;(
    getDeviceActiveDevicesByLocationFromLocationId as jest.Mock
  ).mockResolvedValue([
    {
      id: 7,
      deviceStatus: 'Active',
      deviceIdentifier: '123',
      ipaddress: '127.0.0.1',
      deviceConfiguration: { port: 8080 },
      deviceProperties: { TmcDecoder: 'VisionCameraAPI' },
    },
  ])
  ;(configRequest as jest.Mock).mockResolvedValue(['Lane Alpha', 'Unused'])
  ;(reportsRequest as jest.Mock).mockResolvedValue({
    warnings,
    zoneEvidence: [
      {
        deviceId: 7,
        zoneName: 'Lane Alpha',
        through: 80,
        left: 20,
        right: 0,
        bins: 96,
      },
    ],
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ReconcileLanesButton />
    </QueryClientProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reconcile Lanes' }))
  await waitFor(() =>
    expect(getDeviceActiveDevicesByLocationFromLocationId).toHaveBeenCalled()
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Compare lanes' })).toBeEnabled()
  )
  expect(
    screen.queryByLabelText('Reference template location')
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('Decoder')).toHaveTextContent(
    'Vision Camera API'
  )
  expect(configRequest).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Compare lanes' }))
  await screen.findByRole('table', { name: 'Observed zone counts' })
  return client
}

it('reads independent zones and report evidence, separates warnings, and stages selected changes without saving', async () => {
  const client = await openReview()
  expect(configRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/Detector/retrieveDetectionData',
      method: 'POST',
    })
  )
  expect(reportsRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        reconcileLanes: true,
        decoder: 'VisionCameraAPI',
        deviceIds: [7],
      }),
    })
  )
  expect(screen.getByText(/Unused zone Unused/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: /use separate L \+ T/ }))
  fireEvent.change(screen.getByLabelText(/New channels for T/), {
    target: { value: '302' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Apply selected to editor' })
  )
  expect(await screen.findByText(/Changes staged/)).toBeVisible()
  expect(useLocationStore.getState().approaches[0].detectors).toHaveLength(2)
  expect(useLocationStore.getState().savedApproaches[0].detectors).toHaveLength(
    1
  )
  expect(useLocationStore.getState().hasUnsavedChanges()).toBe(true)
  expect(
    (configRequest as jest.Mock).mock.calls.every(
      ([c]) => !['PATCH', 'PUT', 'DELETE'].includes(c.method)
    )
  ).toBe(true)
  client.clear()
})

it('blocks applying stale results after review inputs change', async () => {
  const client = await openReview()
  fireEvent.click(screen.getByRole('checkbox', { name: /use separate L \+ T/ }))
  fireEvent.change(screen.getByLabelText('Minimum observed count'), {
    target: { value: '10' },
  })
  expect(
    screen.getByRole('button', { name: 'Apply selected to editor' })
  ).toBeDisabled()
  expect(useLocationStore.getState().approaches[0].detectors).toHaveLength(1)
  client.clear()
})

it('keeps partial source responses diagnostic-only', async () => {
  const client = await openReview(['Device did not return one day'])
  expect(
    screen.queryByRole('checkbox', { name: /use separate/ })
  ).not.toBeInTheDocument()
  expect(screen.getByText(/Resolve them and rerun/)).toBeVisible()
  client.clear()
})
