import { getDeviceActiveDevicesByLocationFromLocationId } from '@/api/config/device/device'
import { useFlags } from '@/feature-flags/FeatureFlagContext'
import { useGetDeviceConfigurations } from '@/features/devices/api'
import { configRequest, reportsRequest } from '@/lib/axios'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

async function openReview(
  warnings: string[] = [],
  aliases = false,
  unnamed = false,
  leftCount = 20
) {
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
    ...(aliases
      ? [
          {
            id: 8,
            deviceStatus: 'Active',
            deviceIdentifier: '1',
            ipaddress: '127.0.0.1',
            deviceConfiguration: { port: 8080 },
            deviceProperties: { TmcDecoder: 'VisionCameraAPI' },
          },
        ]
      : []),
  ])
  ;(configRequest as jest.Mock).mockResolvedValue(['Lane Alpha', 'Unused'])
  ;(reportsRequest as jest.Mock).mockResolvedValue({
    warnings,
    sourceDeviceIds: [7],
    zoneEvidence: [
      {
        deviceId: 7,
        zoneName: 'Lane Alpha',
        through: 80,
        left: leftCount,
        right: 0,
        bins: 96,
      },
      ...(unnamed
        ? [101, 102].map((zoneId) => ({
            deviceId: 7,
            zoneId,
            zoneName: null,
            through: 3,
            left: 0,
            right: 0,
            bins: 1,
          }))
        : []),
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

it('lets the user choose removal instead of addition and stages it without saving', async () => {
  const client = await openReview([], false, false, 0)
  const remove = screen.getByRole('checkbox', {
    name: 'Remove Channel 301 zone Lane Alpha Left',
  })
  const add = screen.getByRole('checkbox', { name: /use separate L \+ T/ })
  expect(remove.closest('[role="alert"]')).toHaveTextContent('no L observed')
  expect(add.closest('[role="alert"]')).toBeNull()
  expect(remove).not.toBeChecked()
  expect(add).not.toBeChecked()
  fireEvent.click(add)
  fireEvent.click(remove)
  expect(add).not.toBeChecked()
  expect(remove).toBeChecked()
  fireEvent.click(
    screen.getByRole('button', { name: 'Apply selected to editor' })
  )
  expect(useLocationStore.getState().approaches[0].detectors).toHaveLength(0)
  expect(useLocationStore.getState().savedApproaches[0].detectors).toHaveLength(
    1
  )
  expect(useLocationStore.getState().hasUnsavedChanges()).toBe(true)
  expect(
    (configRequest as jest.Mock).mock.calls.every(
      ([c]) => c.url === '/Detector/retrieveDetectionData'
    )
  ).toBe(true)
  client.clear()
})

it('uses the decoder-selected owner for serial/index aliases and retains recommendations', async () => {
  const client = await openReview([], true)
  expect(reportsRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ deviceIds: [7, 8] }),
    })
  )
  expect(configRequest).toHaveBeenCalledTimes(1)
  expect(configRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ deviceId: '123' }),
    })
  )
  const recommendation = screen.getByRole('checkbox', {
    name: /use separate L \+ T/,
  })
  fireEvent.click(recommendation)
  expect(recommendation).toBeChecked()
  client.clear()
})

it('shows separate unnamed zone IDs without suppressing valid named recommendations', async () => {
  const client = await openReview([], false, true)
  for (const id of [101, 102]) {
    expect(
      screen.getByRole('cell', { name: `Unnamed zone ${id}` })
    ).toBeVisible()
    expect(
      screen.getByText(new RegExp(`Unnamed zone ${id} on device 7`))
    ).toBeVisible()
  }
  const recommendation = screen.getByRole('checkbox', {
    name: /use separate L \+ T/,
  })
  fireEvent.click(recommendation)
  expect(recommendation).toBeChecked()
  client.clear()
})

it('invalidates the memoized review when location configuration changes', async () => {
  const client = await openReview()
  fireEvent.click(screen.getByRole('checkbox', { name: /use separate L \+ T/ }))
  act(() =>
    useLocationStore.setState({
      approaches: useLocationStore.getState().approaches.map((a) => ({
        ...a,
        detectors: a.detectors.map((d) => ({ ...d, laneNumber: 2 })),
      })),
    })
  )
  expect(
    screen.getByRole('button', { name: 'Apply selected to editor' })
  ).toBeDisabled()
  client.clear()
})
