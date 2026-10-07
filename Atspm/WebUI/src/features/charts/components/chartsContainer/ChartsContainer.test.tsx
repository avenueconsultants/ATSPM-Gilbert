import { useCharts } from '@/features/charts/api'
import { ChartType } from '@/features/charts/common/types'
import '@testing-library/jest-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { AxiosError, AxiosResponse } from 'axios'
import ChartsContainer from './ChartsContainer'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/performance-measures',
}))
jest.mock('@/features/charts/api', () => ({ useCharts: jest.fn() }))
jest.mock('@/features/charts/components/chartsToolbox', () => ({
  __esModule: true,
  default: () => <div>Toolbox</div>,
}))
jest.mock('@/features/charts/components/defaultChartResults', () => ({
  __esModule: true,
  default: () => <div>Charts</div>,
}))
jest.mock(
  '@/features/charts/turningMovementCounts/components/TurningMovementCountsTable',
  () => ({ __esModule: true, default: () => <div>Table View</div> })
)
jest.mock('@/features/locations/components/locationConfigContainer', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock(
  '@/features/charts/approachVolume/components/ApproachVolumeChartResults',
  () => ({ __esModule: true, default: () => null })
)
jest.mock(
  '@/features/charts/timingAndActuation/components/timingAndActuationChartsResults/TimingAndActuationChartsResults',
  () => ({ __esModule: true, default: () => null })
)
jest.mock(
  '@/features/charts/timingAndActuation/components/timingAndActuationChartsToolbox/TimingAndActuationChartsToolbox',
  () => ({ __esModule: true, default: () => null })
)
jest.mock(
  '@/features/charts/prioritySummary/components/PrioritySummaryChart',
  () => ({ __esModule: true, default: () => null })
)
jest.mock('@/features/charts/splitMonitor/components/PhaseTable', () => ({
  __esModule: true,
  default: () => null,
}))

const charts = useCharts as jest.Mock
// The container restores scroll position, which jsdom doesn't implement.
window.scrollTo = jest.fn()

function show() {
  render(
    <ChartsContainer
      location="7115"
      chartType={ChartType.TurningMovementCounts}
      startDateTime={new Date(2026, 3, 14)}
      endDateTime={new Date(2026, 3, 21)}
      options={{}}
    />
  )
  return screen.getByRole('button', { name: 'Generate Charts' })
}

function expectBelow(button: HTMLElement, element: HTMLElement) {
  expect(button.parentElement).not.toContainElement(element)
  expect(
    button.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
}

beforeEach(() => jest.clearAllMocks())

test('a failed report lists each device on its own line, spaced below Generate Charts', () => {
  const message = [
    'None of the selected devices responded.',
    'Camera 1: no data for 2026-04-14 (login rejected; check the username and password on the device configuration).',
    'Camera 2: no data for 2026-04-14 (timed out after 30 seconds).',
  ].join('\n')
  charts.mockReturnValue({
    refetch: jest.fn(),
    isError: true,
    isLoading: false,
    error: new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
      status: 503,
      data: message,
    } as AxiosResponse),
  })

  const button = show()
  const alert = screen.getByRole('alert')

  expect(alert).toHaveTextContent('Camera 2: no data for 2026-04-14 (timed out after 30 seconds).')
  expect(alert).toHaveStyle({ whiteSpace: 'pre-line' })
  expectBelow(button, alert)
  expect(alert.parentElement).toHaveStyle({ marginTop: '16px' })
})

test('camera warnings are spaced below Generate Charts and only shown when there are some', () => {
  const report = (warnings: string[]) => ({
    refetch: jest.fn(),
    isError: false,
    isLoading: false,
    data: {
      type: ChartType.TurningMovementCounts,
      data: { charts: [{ chart: {} }], source: 'Vision Camera API (3 of 4 cameras)', warnings },
    },
  })
  charts.mockReturnValue(
    report(['Camera 2: unreachable; skipped 2026-04-15 to 2026-04-20.'])
  )

  const button = show()
  const alert = screen.getByRole('alert')

  expect(alert).toHaveTextContent('Camera 2: unreachable; skipped 2026-04-15 to 2026-04-20.')
  expectBelow(button, alert)
  expect(alert.parentElement).toHaveStyle({ marginTop: '16px' })
  expect(screen.getByText('Table View')).toBeInTheDocument()

  cleanup()
  charts.mockReturnValue(report([]))
  show()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
