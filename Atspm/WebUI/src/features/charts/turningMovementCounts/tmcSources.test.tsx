import { getDeviceActiveDevicesByLocationFromLocationId } from '@/api/config/device/device'
import { reportsAxios, reportsRequest } from '@/lib/axios'
import '@testing-library/jest-dom'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { getCharts, useCharts } from '../api/getCharts'
import { ChartType } from '../common/types'
import { TmcSourceOptions } from './components/TmcSourceOptions'
import { formatDecoderLabel, groupTmcSources } from './useTmcSources'

jest.mock('@/lib/axios', () => ({
  reportsRequest: jest.fn(),
  reportsAxios: { post: jest.fn() },
}))
jest.mock('@/api/config/device/device', () => ({
  getDeviceActiveDevicesByLocationFromLocationId: jest.fn(),
}))
jest.mock('../api/transformData', () => ({
  transformChartData: (value: unknown) => value,
}))
const camera = (id: number, identifier = String(id)) => ({
  id,
  deviceStatus: 'Active',
  ipaddress: '10.10.10.26',
  deviceIdentifier: identifier,
  deviceConfiguration: { port: 8080 },
  TmcDecoder: 'VisionCameraAPI',
})
const request = reportsRequest as jest.Mock
const devices = getDeviceActiveDevicesByLocationFromLocationId as jest.Mock
function show(location: any, onChange = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider
      client={client}
    >
      <TmcSourceOptions location={location} onChange={onChange} />
    </QueryClientProvider>
  )
  return { ...view, client }
}
beforeEach(() => {
  jest.clearAllMocks()
  request.mockResolvedValue(true)
})
test('one physical camera has one choice even with two logging streams; multiple cameras are grouped', () => {
  const groups = groupTmcSources([
    camera(1),
    camera(2, '1-bins'),
    camera(3),
  ] as any)
  expect(groups[0].key).toBe('atspm')
  expect(groups[1]).toMatchObject({
    name: 'Vision Camera API (2 cameras)',
    deviceIds: [1, 2, 3],
  })
})
test('page data defaults to ATSPM and selecting cameras sends all device IDs', async () => {
  const change = jest.fn()
  show({ id: 1, devices: [camera(1), camera(2)] }, change)
  expect(await screen.findByLabelText('Indiana Events (ATSPM)')).toBeChecked()
  fireEvent.click(screen.getByLabelText('Vision Camera API (2 cameras)'))
  expect(change).toHaveBeenCalledWith('devices', [1, 2], 'VisionCameraAPI')
  expect(devices).not.toHaveBeenCalled()
})
test('saved statistics are separate from live data and select all stored cameras only', async () => {
  const saved = (id: number, identifier: string) => ({
    ...camera(id, identifier),
    deviceProperties: { TmcDecoder: 'VisionBinStatisticsStored' },
  })
  const change = jest.fn()
  show({ id: 1, devices: [camera(1), saved(2, '1-bins'), camera(3), saved(4, '3-bins')] }, change)
  expect(await screen.findByLabelText('Vision Camera API (2 cameras)')).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Vision Bin Statistics Stored (2 cameras)'))
  expect(change).toHaveBeenCalledWith('devices', [2, 4], 'VisionBinStatisticsStored')
})
test('OData open properties select the database decoder', () => {
  const sources = groupTmcSources([camera(1), { ...camera(2, '1-bins'), TmcDecoder: 'VisionBinStatisticsStored' }] as any)
  expect(sources).toHaveLength(3)
  expect(sources[2]).toMatchObject({ name: 'Vision Bin Statistics Stored (1 camera)', deviceIds: [2] })
})

test('comma-separated decoders give one device two distinct source choices', async () => {
  const change = jest.fn()
  show({ id: 1, devices: [{ ...camera(2), TmcDecoder: ' VisionCameraAPI, VisionBinStatisticsStored, VisionCameraAPI, ' }] }, change)
  fireEvent.click(await screen.findByLabelText('Vision Camera API (1 camera)'))
  expect(change).toHaveBeenLastCalledWith('devices', [2], 'VisionCameraAPI')
  fireEvent.click(screen.getByLabelText('Vision Bin Statistics Stored (1 camera)'))
  expect(change).toHaveBeenLastCalledWith('devices', [2], 'VisionBinStatisticsStored')
  expect(screen.getAllByRole('radio')).toHaveLength(3)
})
test('loads OData device envelope when search location has no devices', async () => {
  devices.mockResolvedValue({ value: [camera(1)] })
  show({ id: 9 })
  expect(
    await screen.findByLabelText('Vision Camera API (1 camera)')
  ).toBeInTheDocument()
  expect(devices).toHaveBeenCalledWith(9)
})
test('hides group without device sources', async () => {
  devices.mockResolvedValue({ value: [] })
  show({ id: 9 })
  await waitFor(() => expect(devices).toHaveBeenCalled())
  expect(screen.queryByText('Count source')).not.toBeInTheDocument()
})
test.each([false, undefined])('feature flag %s hides sources and does not fetch cameras', async (value) => {
  request.mockResolvedValue(value)
  const { client } = show({ id: 9 })
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect(devices).not.toHaveBeenCalled()
  expect(screen.queryByText('Count source')).not.toBeInTheDocument()
})

test('feature discovery failure hides even preloaded camera sources', async () => {
  request.mockRejectedValue(new Error('Not found'))
  const { client } = show({ id: 9, devices: [camera(1)] })
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect(devices).not.toHaveBeenCalled()
  expect(screen.queryByText('Count source')).not.toBeInTheDocument()
})
test('report request carries device selection and defaults to ATSPM', async () => {
  const options = {
    start: new Date(2026, 8, 24),
    end: new Date(2026, 8, 25),
    locationIdentifier: '1',
    source: 'devices',
    deviceIds: '1,2',
    decoder: 'VisionCameraAPI',
  }
  await getCharts(ChartType.TurningMovementCounts, options as any)
  expect(reportsAxios.post).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ source: 'devices', deviceIds: [1, 2], decoder: 'VisionCameraAPI' })
  )
  await getCharts(ChartType.TurningMovementCounts, {
    ...options,
    source: undefined,
  } as any)
  expect(reportsAxios.post).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ source: 'atspm', deviceIds: [] })
  )
})

test.each([
  ['enabled', () => request.mockResolvedValue(true), 'Vision Camera API (3 of 4 cameras)'],
  ['disabled', () => request.mockResolvedValue(false), undefined],
  ['unavailable', () => request.mockRejectedValue(new Error('Not found')), undefined],
])('report source label follows the device sources flag when %s', async (_, flag, expected) => {
  flag()
  ;(reportsAxios.post as jest.Mock).mockResolvedValue({ source: 'Vision Camera API (3 of 4 cameras)', charts: [] })
  const result = await getCharts(ChartType.TurningMovementCounts, {
    start: new Date(2026, 8, 24), end: new Date(2026, 8, 25), locationIdentifier: '1',
  } as any, new QueryClient())
  expect((result as any).data.source).toBe(expected)
})

test('a failed report is requested once, not retried', async () => {
  ;(reportsAxios.post as jest.Mock).mockRejectedValue(new Error('None of the selected devices responded.'))
  // The app's client keeps react-query's default of three retries.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  const { result } = renderHook(() => useCharts({
    chartType: ChartType.TurningMovementCounts,
    chartOptions: { start: new Date(2026, 8, 24), end: new Date(2026, 8, 25), locationIdentifier: '1' } as any,
  }), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  await act(() => result.current.refetch())
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(reportsAxios.post).toHaveBeenCalledTimes(1)
})



test('new decoders get labels and groups without manufacturer-specific UI code', () => {
  const sources = groupTmcSources([{ ...camera(1), TmcDecoder: 'OtherCameraTmcDecoder' }] as any)
  expect(sources[1]).toMatchObject({ name: 'Other Camera Tmc Decoder (1 camera)', deviceIds: [1] })
})

test.each([
  ['VisionCameraAPI', 'Vision Camera API'],
  ['VisionBinStatisticsStored', 'Vision Bin Statistics Stored'],
  ['APIClient', 'API Client'],
  ['Camera2API', 'Camera2 API'],
])('formats decoder %s without splitting acronyms', (name, expected) => {
  expect(formatDecoderLabel(name)).toBe(expected)
})
