import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
import TurningMovementCountsTable, {
  buildTurningMovementCountsCsvFilename,
} from './TurningMovementCountsTable'

const filtersMock = jest.fn<JSX.Element, [unknown]>(() => <div>Filters</div>)
const toolbarMock = jest.fn<JSX.Element, [{ onDownloadCsv: () => void }]>(
  () => <div>Toolbar</div>
)

jest.mock('./TurningMovementCountsFilters', () => ({
  __esModule: true,
  default: (props: unknown) => filtersMock(props),
}))

jest.mock('./TurningMovementCountsResultsTable', () => ({
  __esModule: true,
  default: () => <div>Results Table</div>,
}))

jest.mock('./TurningMovementCountsTableToolbar', () => ({
  __esModule: true,
  default: (props: { onDownloadCsv: () => void }) => toolbarMock(props),
}))

const sourceData = (source?: string) => ({
  data: {
    source,
    labels: {
      columnGroups: [{ title: null, columns: ['Hour'] }],
      flatColumns: ['Hour'],
    },
    peakHour: null,
    table: [
      {
        direction: 'Northbound',
        movementType: 'Thru',
        laneType: 'Vehicle',
        volumes: [{ timestamp: '2026-04-01T08:00:00', value: 1 }],
      },
    ],
  },
})

async function downloadCsv() {
  let blob: Blob | undefined
  URL.createObjectURL = jest.fn((value: Blob) => {
    blob = value
    return 'blob:csv'
  })
  URL.revokeObjectURL = jest.fn()
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined)
  act(() => toolbarMock.mock.lastCall![0].onDownloadCsv())
  // jsdom's Blob has no text().
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsText(blob!)
  })
}

describe('TurningMovementCountsTable', () => {
  beforeEach(() => {
    filtersMock.mockClear()
    toolbarMock.mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('names the source beside the heading and in a CSV column when the report has one', async () => {
    render(
      <TurningMovementCountsTable
        chartData={sourceData('Vision Camera API (3 of 4 cameras)')}
      />
    )

    expect(
      screen.getByText('Source: Vision Camera API (3 of 4 cameras)')
    ).toBeInTheDocument()
    const lines = (await downloadCsv()).split('\n')
    expect(lines[0]).toMatch(/^Source,/)
    expect(lines.slice(1).length).toBeGreaterThan(0)
    lines.slice(1).forEach((line) =>
      expect(line).toMatch(/^Vision Camera API \(3 of 4 cameras\),/)
    )
  })

  it('leaves the source out of the heading and CSV when the report has none', async () => {
    render(<TurningMovementCountsTable chartData={sourceData()} />)

    expect(screen.queryByText(/^Source:/)).not.toBeInTheDocument()
    expect(await downloadCsv()).not.toContain('Source')
  })

  it('builds CSV export names with chart-style location and date context', () => {
    expect(
      buildTurningMovementCountsCsvFilename(
        'Turning_Movement_Counts_1001_2026-04-01_08-00_to_2026-04-01_09-00',
        'Vehicle',
        'split',
        'combine'
      )
    ).toBe(
      'Turning_Movement_Counts_1001_2026-04-01_08-00_to_2026-04-01_09-00_Vehicle_split_combine.csv'
    )
  })

  it('orders combined movements between thru and thru-right in the filters', () => {
    render(
      <TurningMovementCountsTable
        chartData={{
          data: {
            labels: {
              columnGroups: [{ title: null, columns: ['Hour'] }],
              flatColumns: ['Hour'],
            },
            peakHour: null,
            table: [
              {
                direction: 'Northbound',
                movementType: 'Right',
                laneType: 'Vehicle',
                volumes: [{ timestamp: '2026-04-01T08:00:00', value: 1 }],
              },
              {
                direction: 'Northbound',
                movementType: 'Thru-Right',
                laneType: 'Vehicle',
                volumes: [{ timestamp: '2026-04-01T08:00:00', value: 1 }],
              },
              {
                direction: 'Northbound',
                movementType: 'Thru + Thru-Right',
                laneType: 'Vehicle',
                volumes: [{ timestamp: '2026-04-01T08:00:00', value: 1 }],
              },
              {
                direction: 'Northbound',
                movementType: 'Thru',
                laneType: 'Vehicle',
                volumes: [{ timestamp: '2026-04-01T08:00:00', value: 1 }],
              },
              {
                direction: 'Northbound',
                movementType: 'Left',
                laneType: 'Vehicle',
                volumes: [{ timestamp: '2026-04-01T08:00:00', value: 1 }],
              },
            ],
          },
        }}
      />
    )

    const filterProps = filtersMock.mock.calls[0][0] as {
      movementOptions: { value: string; label: string }[]
    }

    expect(filterProps.movementOptions.map((option) => option.value)).toEqual([
      'Left',
      'Thru',
      'Thru + Thru-Right',
      'Thru-Right',
      'Right',
    ])
    expect(filterProps.movementOptions[2]).toEqual({
      value: 'Thru + Thru-Right',
      label: 'Thru + Thru-Right',
    })
  })
})
