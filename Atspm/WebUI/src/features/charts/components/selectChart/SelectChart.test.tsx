import { Location } from '@/api/config'
import { useChartDefaults } from '@/features/charts/api/getChartDefaults'
import { useGetMeasureTypes } from '@/features/charts/api/getMeasureTypes'
import { ChartOptions, ChartType } from '@/features/charts/common/types'
import { Default } from '@/features/charts/types'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import SelectChart from './SelectChart'

jest.mock('@/features/charts/api/getChartDefaults', () => ({
  useChartDefaults: jest.fn(),
}))
jest.mock('@/features/charts/api/getMeasureTypes', () => ({
  useGetMeasureTypes: jest.fn(),
}))
const setYAxisMaxStore = jest.fn()
jest.mock('@/stores/charts', () => ({
  useChartsStore: () => ({ setYAxisMaxStore, yAxisMaxStore: '300' }),
}))

const location = { charts: [1, 5, 7] } as Location
const measureTypes = {
  value: [
    { id: 1, abbreviation: 'PPT', showOnWebsite: true },
    { id: 5, abbreviation: 'TMC', showOnWebsite: true },
    { id: 7, abbreviation: 'AV', showOnWebsite: true },
  ],
}
const defaults: {
  value: {
    chartType: ChartType
    measureOptions: Record<string, Default>
  }[]
} = {
  value: [
    {
      chartType: ChartType.TurningMovementCounts,
      measureOptions: {
        binSize: { id: 85, option: 'binSize', value: '15' },
        yAxisDefault: { id: 120, option: 'yAxisDefault', value: '300' },
        combineThruRight: {
          id: 121,
          option: 'combineThruRight',
          value: 'FALSE',
        },
      },
    },
    {
      chartType: ChartType.ApproachVolume,
      measureOptions: {
        binSize: { id: 50, option: 'binSize', value: '60' },
      },
    },
    {
      chartType: ChartType.PurduePhaseTermination,
      measureOptions: {
        selectedConsecutiveCount: {
          id: 1,
          option: 'selectedConsecutiveCount',
          value: '5',
        },
      },
    },
  ],
}
const savedOptions = {
  binSize: '5',
  combineThruRight: 'TRUE',
} as unknown as Partial<ChartOptions>

function setDefaults(data: typeof defaults | undefined = defaults) {
  jest.mocked(useChartDefaults).mockReturnValue({
    data,
    isLoading: !data,
  } as unknown as ReturnType<typeof useChartDefaults>)
}

function setMeasureTypes(data: typeof measureTypes | undefined = measureTypes) {
  jest.mocked(useGetMeasureTypes).mockReturnValue({
    data,
    isLoading: !data,
  } as unknown as ReturnType<typeof useGetMeasureTypes>)
}

function Harness({
  initialType = ChartType.TurningMovementCounts,
  initialOptions = savedOptions,
  selectedLocation = location,
}: {
  initialType?: ChartType | null
  initialOptions?: Partial<ChartOptions>
  selectedLocation?: Location | null
}) {
  const [chartType, setChartType] = useState(initialType)
  const [options, setOptions] = useState<Partial<ChartOptions> | undefined>(
    initialOptions
  )
  return (
    <>
      <SelectChart
        chartType={chartType}
        setChartType={setChartType}
        chartOptions={options}
        setChartOptions={setOptions}
        location={selectedLocation}
      />
      <button
        onClick={() => {
          setChartType(ChartType.TurningMovementCounts)
          setOptions(savedOptions)
        }}
      >
        Restore saved request
      </button>
      <output data-testid="chart-type">{chartType ?? 'none'}</output>
      <output data-testid="request-options">{JSON.stringify(options)}</output>
    </>
  )
}

function requestOptions() {
  return JSON.parse(screen.getByTestId('request-options').textContent || '{}')
}

beforeEach(() => {
  jest.clearAllMocks()
  setDefaults()
  setMeasureTypes()
})

it('fills missing defaults without overwriting saved options when defaults arrive last', () => {
  jest.mocked(useChartDefaults).mockReturnValue({
    data: undefined,
    isLoading: true,
  } as ReturnType<typeof useChartDefaults>)
  const { rerender } = render(<Harness />)
  expect(requestOptions()).toEqual(savedOptions)

  setDefaults()
  rerender(<Harness />)
  expect(requestOptions()).toEqual({ ...savedOptions, yAxisDefault: '300' })
  expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('5')
  expect(screen.getByRole('checkbox')).toBeChecked()
})

it('synchronizes controls when saved URL options arrive after defaults', async () => {
  const user = userEvent.setup()
  render(<Harness initialOptions={{}} />)
  expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('15')

  await user.click(
    screen.getByRole('button', { name: 'Restore saved request' })
  )
  expect(requestOptions()).toEqual(savedOptions)
  expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('5')
  expect(screen.getByRole('checkbox')).toBeChecked()
})

it('preserves user edits when defaults refresh', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<Harness />)
  await user.click(screen.getAllByRole('combobox')[1])
  await user.click(screen.getByRole('option', { name: '60' }))
  await user.click(screen.getByRole('checkbox'))

  setDefaults({
    value: defaults.value.map((value) => ({
      ...value,
      measureOptions: { ...value.measureOptions },
    })),
  })
  rerender(<Harness />)
  expect(String(requestOptions().binSize)).toBe('60')
  expect(requestOptions().combineThruRight).toBe('FALSE')
  expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('60')
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})

it('retains a saved measure while measure metadata is loading', () => {
  jest.mocked(useGetMeasureTypes).mockReturnValue({
    data: undefined,
    isLoading: true,
  } as ReturnType<typeof useGetMeasureTypes>)
  const { rerender } = render(<Harness />)
  expect(screen.getByTestId('chart-type')).toHaveTextContent(
    ChartType.TurningMovementCounts
  )

  setMeasureTypes()
  rerender(<Harness />)
  expect(screen.getByRole('combobox', { name: 'Measure' })).toHaveTextContent(
    'Turning Movement Counts'
  )
  expect(requestOptions()).toMatchObject(savedOptions)
})

it('resets options on intentional measure changes and does not reuse the previous measure options', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('combobox', { name: 'Measure' }))
  await user.click(screen.getByRole('option', { name: 'Approach Volume' }))
  expect(requestOptions()).toEqual({ binSize: '60' })

  await user.click(screen.getByRole('combobox', { name: 'Measure' }))
  await user.click(
    screen.getByRole('option', { name: 'Turning Movement Counts' })
  )
  expect(requestOptions()).toEqual({
    binSize: '15',
    combineThruRight: 'FALSE',
    yAxisDefault: '300',
  })
  expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('15')
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})

it('rejects an unavailable saved TMC only after metadata arrives without selecting a fallback', () => {
  jest.mocked(useGetMeasureTypes).mockReturnValue({
    data: undefined,
    isLoading: true,
  } as ReturnType<typeof useGetMeasureTypes>)
  const { rerender } = render(<Harness />)
  expect(screen.getByTestId('chart-type')).toHaveTextContent(
    ChartType.TurningMovementCounts
  )

  setMeasureTypes({
    value: measureTypes.value.filter((measure) => measure.id !== 5),
  })
  rerender(<Harness />)
  expect(screen.getByTestId('chart-type')).toHaveTextContent('none')
  expect(requestOptions()).toMatchObject(savedOptions)
})

it('keeps the existing default and refetch behavior for other measures', () => {
  const { rerender } = render(
    <Harness initialType={ChartType.ApproachVolume} />
  )
  expect(requestOptions()).toEqual({ binSize: '60' })

  setDefaults({
    value: defaults.value.map((value) =>
      value.chartType === ChartType.ApproachVolume
        ? {
            ...value,
            measureOptions: {
              binSize: { id: 50, option: 'binSize', value: '15' },
            },
          }
        : value
    ),
  })
  rerender(<Harness initialType={ChartType.ApproachVolume} />)
  expect(requestOptions()).toEqual({ binSize: '15' })
})

it('leaves non-TMC availability checks and page-level default selection unchanged', () => {
  jest.mocked(useGetMeasureTypes).mockReturnValue({
    data: undefined,
    isLoading: true,
  } as ReturnType<typeof useGetMeasureTypes>)
  const { rerender } = render(
    <Harness initialType={ChartType.ApproachVolume} />
  )
  expect(screen.getByTestId('chart-type')).toHaveTextContent('none')

  setMeasureTypes()
  rerender(<Harness initialType={ChartType.ApproachVolume} />)
  expect(screen.getByTestId('chart-type')).toHaveTextContent('none')
})
