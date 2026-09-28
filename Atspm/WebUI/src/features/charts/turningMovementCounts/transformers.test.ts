// #region license
// Copyright 2026 Utah Departement of Transportation
// for WebUI - transformers.test.ts
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//http://www.apache.org/licenses/LICENSE-2.
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// #endregion
import { ChartType } from '@/features/charts/common/types'
import { init, type EChartsOption, type LineSeriesOption } from 'echarts'
import type { TransformedTurningMovementCountsResponse } from '../types'
import transformTurningMovementCountsData from './turningMovementCounts.transformer'
import {
  RawTurningMovementCountsData,
  RawTurningMovementCountsResponse,
} from './types'

type ChartWithDisplayProps = {
  displayProps: {
    description: string
  }
}

type ChartWithTitle = {
  title?: { text?: string }[]
}

const buildChart = (
  movementType: string,
  overrides: Partial<RawTurningMovementCountsData> = {}
): RawTurningMovementCountsData => ({
  locationIdentifier: '1001',
  locationDescription: 'Main St & 100 S',
  start: '2026-04-01T08:00:00',
  end: '2026-04-01T09:00:00',
  direction: 'Northbound',
  laneType: 'Vehicle',
  movementType,
  plans: [],
  lanes: [
    {
      laneNumber: 1,
      movementType,
      volume: [{ timestamp: '2026-04-01T08:00:00', value: 12 }],
      laneType: 1,
    },
  ],
  totalHourlyVolumes: [{ timestamp: '2026-04-01T08:00:00', value: 12 }],
  totalVolume: 12,
  peakHour: '08:00 - 09:00',
  peakHourVolume: 12,
  peakHourFactor: 1,
  laneUtilizationFactor: 1,
  ...overrides,
})

describe('transformTurningMovementCountsData', () => {
  it.each([
    {
      description: 'combined movements that both use lane 1',
      movementType: 'Thru + Thru-Right',
      lanes: [
        { movementType: 'Thru', laneNumber: 1, approachId: 10 },
        { movementType: 'Thru-Right', laneNumber: 1, approachId: 10 },
      ],
      expected: ['Thru - Lane 1', 'Thru-Right - Lane 1'],
    },
    {
      description: 'the same movement and lane number on different approaches',
      movementType: 'Thru',
      lanes: [
        {
          movementType: 'Thru',
          laneNumber: 1,
          approachId: 10,
          approachDescription: 'NB Main St',
        },
        {
          movementType: 'Thru',
          laneNumber: 1,
          approachId: 20,
          approachDescription: 'NB Frontage Rd',
        },
        {
          movementType: 'Thru',
          laneNumber: 2,
          approachId: 10,
          approachDescription: 'NB Main St',
        },
      ],
      expected: ['Lane 1 (NB Main St)', 'Lane 1 (NB Frontage Rd)', 'Lane 2'],
    },
    {
      description: 'duplicate lanes on approaches without a description',
      movementType: 'Thru',
      lanes: [
        {
          movementType: 'Thru',
          laneNumber: 1,
          approachId: 10,
          approachDescription: null,
        },
        {
          movementType: 'Thru',
          laneNumber: 1,
          approachId: 20,
          approachDescription: ' ',
        },
      ],
      expected: ['Lane 1 (Approach 10)', 'Lane 1 (Approach 20)'],
    },
    {
      description:
        'multiple unassigned lanes with and without approach identity',
      movementType: 'Thru',
      lanes: [
        { movementType: 'Thru', laneNumber: null },
        { movementType: 'Thru', laneNumber: null, approachId: null },
        {
          movementType: 'Thru',
          laneNumber: null,
          approachId: 10,
          approachDescription: 'NB Main St',
        },
        { movementType: 'Thru', laneNumber: null, approachId: 20 },
      ],
      expected: [
        'Unassigned lane (1)',
        'Unassigned lane (2)',
        'Unassigned lane (NB Main St)',
        'Unassigned lane (Approach 20)',
      ],
    },
    {
      description: 'duplicate legacy lane labels without approach identity',
      movementType: 'Thru',
      lanes: [
        { movementType: 'Thru', laneNumber: 1 },
        { movementType: 'Thru', laneNumber: 1 },
      ],
      expected: ['Lane 1 (1)', 'Lane 1 (2)'],
    },
    {
      description: 'ordinary single-movement lanes from older responses',
      movementType: 'Thru',
      lanes: [
        { movementType: 'Thru', laneNumber: 1 },
        { movementType: 'Thru', laneNumber: 2 },
      ],
      expected: ['Lane 1', 'Lane 2'],
    },
  ])(
    'keeps $description independently selectable',
    ({ movementType, lanes, expected }) => {
      const rawChart = buildChart(movementType, {
        lanes: lanes.map((lane, index) => ({
          ...lane,
          laneType: 1,
          volume: [
            { timestamp: '2026-04-01T08:00:00', value: 12 * (index + 1) },
          ],
        })),
      })
      const result = transformTurningMovementCountsData({
        type: ChartType.TurningMovementCounts,
        data: {
          charts: [rawChart],
          table: [],
          peakHour: null,
          peakHourFactor: null,
        },
      }) as TransformedTurningMovementCountsResponse
      const option = result.data.charts[0].chart as EChartsOption
      const lines = (option.series as LineSeriesOption[]).filter(
        (series) => series.type === 'line'
      )
      const names = ['Total Volume', ...expected]
      expect(lines.map((series) => series.name)).toEqual(names)
      expect(new Set(names).size).toBe(names.length)
      expect(option.legend).toEqual(
        expect.objectContaining({
          data: names.map((name) => expect.objectContaining({ name })),
        })
      )
      expected.forEach((name, index) => {
        expect(lines.find((line) => line.name === name)?.data).toEqual([
          [rawChart.start, (12 * (index + 1)).toFixed(2)],
          [rawChart.end, (12 * (index + 1)).toFixed(2)],
        ])
      })

      // Exercise ECharts' name-based legend selection with the generated series.
      const chart = init(null, undefined, {
        renderer: 'svg',
        ssr: true,
        width: 400,
        height: 200,
      })
      try {
        chart.setOption({
          animation: false,
          legend: { show: false, data: names },
          xAxis: { type: 'time', show: false },
          yAxis: { show: false },
          series: lines,
        })
        for (const name of expected) {
          chart.dispatchAction({ type: 'legendToggleSelect', name })
          const legend = (
            chart.getOption().legend as { selected: Record<string, boolean> }[]
          )[0]
          expect(legend.selected[name]).toBe(false)
          for (const other of names.filter((candidate) => candidate !== name)) {
            expect(legend.selected[other]).toBe(true)
          }
          chart.dispatchAction({ type: 'legendToggleSelect', name })
        }
      } finally {
        chart.dispose()
      }
    }
  )

  it('sorts combined movements correctly and builds labels and peak hour rows', () => {
    const response: RawTurningMovementCountsResponse = {
      type: ChartType.TurningMovementCounts,
      data: {
        charts: [
          buildChart('Right'),
          buildChart('Thru + Thru-Right'),
          buildChart('Thru'),
        ],
        table: [
          {
            direction: 'Northbound',
            movementType: 'Right',
            laneType: 'Vehicle',
            volumes: [],
            peakHourVolume: { value: 30 },
          },
          {
            direction: 'Northbound',
            movementType: 'Thru + Thru-Right',
            laneType: 'Vehicle',
            volumes: [],
            peakHourVolume: { value: 20 },
          },
          {
            direction: 'Northbound',
            movementType: 'Thru',
            laneType: 'Vehicle',
            volumes: [],
            peakHourVolume: { value: 10 },
          },
        ],
        peakHourFactor: 0.92,
        peakHour: { key: '2026-04-01T08:00:00', value: 60 },
      },
    }

    const result = transformTurningMovementCountsData(
      response
    ) as TransformedTurningMovementCountsResponse
    const chartDescriptions = result.data.charts.map(
      (chart) => (chart.chart as ChartWithDisplayProps).displayProps.description
    )

    expect(chartDescriptions).toEqual([
      'NorthboundThru',
      'NorthboundThru + Thru-Right',
      'NorthboundRight',
    ])

    expect(result.data.labels.columnGroups).toEqual([
      { title: null, columns: ['Hour'] },
      {
        title: 'Northbound',
        columns: ['Thru', 'Thru + Thru-Right', 'Right', 'Total'],
      },
      { title: null, columns: ['Bin Total'] },
    ])

    expect(result.data.peakHour).toEqual({
      peakHourFactor: 0.92,
      peakHourData: [['08:00 - 09:00', 10, 20, 30, 60, 60]],
    })
    expect(result.data.displayProps?.exportFileName).toBe(
      'Turning_Movement_Counts_Main_St_100_S_2026-04-01_08-00_to_2026-04-01_09-00'
    )
  })

  it('formats nullable chart summary values as N/A', () => {
    const response: RawTurningMovementCountsResponse = {
      type: ChartType.TurningMovementCounts,
      data: {
        charts: [
          buildChart('Thru', {
            peakHour: null,
            peakHourVolume: null,
            peakHourFactor: null,
            laneUtilizationFactor: null,
          }),
        ],
        table: [
          {
            direction: 'Northbound',
            movementType: 'Thru',
            laneType: 'Vehicle',
            volumes: [],
            peakHourVolume: null,
          },
        ],
        peakHourFactor: null,
        peakHour: null,
      },
    }

    const result = transformTurningMovementCountsData(
      response
    ) as TransformedTurningMovementCountsResponse
    const chart = result.data.charts[0].chart as ChartWithTitle
    const infoText = chart.title?.find((title) =>
      title.text?.includes('Total Volume')
    )?.text

    expect(infoText).toContain('Peak Hour:  {values|N/A}')
    expect(infoText).toContain('Peak Hour Volume:  {values|N/A}')
    expect(infoText).toContain('Peak Hour Factor:  {values|N/A}')
    expect(infoText).toContain('fLU:  {values|N/A}')
  })

  it.each([1, 2])(
    'keeps all volume lines visible for a single-bin report with %i lanes',
    (laneCount) => {
      const rawChart = buildChart('Thru', {
        lanes: Array.from({ length: laneCount }, (_, index) => ({
          laneNumber: index + 1,
          laneType: 1,
          movementType: 'Thru',
          volume: [{ timestamp: '2026-04-01T08:00:00', value: 12 }],
        })),
        totalHourlyVolumes: [
          { timestamp: '2026-04-01T08:00:00', value: 12 * laneCount },
        ],
      })
      const result = transformTurningMovementCountsData({
        type: ChartType.TurningMovementCounts,
        data: {
          charts: [rawChart],
          table: [],
          peakHour: null,
          peakHourFactor: null,
        },
      }) as TransformedTurningMovementCountsResponse
      const series = result.data.charts[0].chart.series as {
        name: string
        type: string
        data: (string | number)[][]
      }[]
      const volumeLines = series.filter((item) => item.type === 'line')

      expect(volumeLines).toHaveLength(laneCount === 1 ? 1 : laneCount + 1)
      for (const line of volumeLines) {
        const rate = line.name === 'Total Volume' ? 12 * laneCount : 12
        expect(line.data).toEqual([
          [rawChart.start, rate.toFixed(2)],
          [rawChart.end, rate.toFixed(2)],
        ])
      }
      // Plotting the extent must not introduce extra API counts or mutate its bins.
      expect(rawChart.lanes[0].volume).toHaveLength(1)
      expect(rawChart.totalHourlyVolumes).toHaveLength(1)
    }
  )

  it('preserves the original timestamps for reports with multiple bins', () => {
    const volume = [
      { timestamp: '2026-04-01T08:00:00', value: 12 },
      { timestamp: '2026-04-01T08:30:00', value: 20 },
    ]
    const rawChart = buildChart('Thru', {
      lanes: [
        { laneNumber: 1, laneType: 1, movementType: 'Thru', volume },
        { laneNumber: 2, laneType: 1, movementType: 'Thru', volume },
      ],
      totalHourlyVolumes: volume.map((point) => ({
        ...point,
        value: point.value * 2,
      })),
    })
    const result = transformTurningMovementCountsData({
      type: ChartType.TurningMovementCounts,
      data: {
        charts: [rawChart],
        table: [],
        peakHour: null,
        peakHourFactor: null,
      },
    }) as TransformedTurningMovementCountsResponse
    const series = result.data.charts[0].chart.series as {
      type: string
      data: (string | number)[][]
    }[]

    for (const line of series.filter((item) => item.type === 'line')) {
      expect(line.data.map((point) => point[0])).toEqual(
        volume.map((point) => point.timestamp)
      )
    }
  })
})
