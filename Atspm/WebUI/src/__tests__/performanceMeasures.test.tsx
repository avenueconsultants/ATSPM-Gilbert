import PerformanceMeasures from '@/pages/performance-measures'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

const missingDay = new Date(2026, 3, 14)
let mockSearchParams = new URLSearchParams()
const mockSelectDateTime = jest.fn<null, [{ markDays?: Date[] }]>(() => null)

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))
jest.mock('@/features/locations/api', () => ({
  useLatestVersionOfAllLocations: () => ({
    data: { value: [{ id: 1, locationIdentifier: '7115' }] },
  }),
}))
jest.mock('@/hooks/useMissingDays', () => ({
  __esModule: true,
  default: () => [missingDay],
}))
jest.mock('@/components/ResponsivePage', () => ({
  ResponsivePageLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
jest.mock('@/components/selectTimeSpan', () => ({
  __esModule: true,
  default: (props: { markDays?: Date[] }) => mockSelectDateTime(props),
}))
jest.mock('@/features/charts/components/selectChart', () => ({
  __esModule: true,
  default: ({
    setChartOptions,
  }: {
    setChartOptions: (options: { source: string }) => void
  }) => (
    <>
      <button onClick={() => setChartOptions({ source: 'devices' })}>
        Vision Camera API
      </button>
      <button onClick={() => setChartOptions({ source: 'atspm' })}>
        Indiana Events (ATSPM)
      </button>
    </>
  ),
}))
jest.mock('@/features/charts/components/chartsContainer', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/features/locations/components/selectLocation', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/features/locations/components/locationConfigContainer', () => ({
  __esModule: true,
  default: () => null,
}))

const markDays = () => mockSelectDateTime.mock.lastCall![0].markDays

function show(params: Record<string, string>) {
  mockSearchParams = new URLSearchParams({
    location: '7115',
    start: '2026-04-14T00:00:00',
    end: '2026-04-15T00:00:00',
    ...params,
  })
  render(<PerformanceMeasures />)
}

beforeEach(() => mockSelectDateTime.mockClear())

test('switching turning movement counts to cameras hides the missing-day marks', () => {
  show({ chartType: 'TurningMovementCounts' })
  expect(markDays()).toEqual([missingDay])

  fireEvent.click(screen.getByRole('button', { name: 'Vision Camera API' }))
  expect(markDays()).toBeUndefined()

  fireEvent.click(screen.getByRole('button', { name: 'Indiana Events (ATSPM)' }))
  expect(markDays()).toEqual([missingDay])
})

test('a saved camera link opens without missing-day marks', () => {
  show({ chartType: 'TurningMovementCounts', source: 'devices' })
  expect(markDays()).toBeUndefined()
})

test('other measures keep the missing-day marks', () => {
  show({ chartType: 'PurduePhaseTermination', source: 'devices' })
  expect(markDays()).toEqual([missingDay])
})
