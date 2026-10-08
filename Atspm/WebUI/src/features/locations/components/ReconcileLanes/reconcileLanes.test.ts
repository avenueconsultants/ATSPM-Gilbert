import type {
  ConfigApproach,
  ConfigDetector,
} from '../editLocation/locationStore'
import {
  applyLaneRecommendations,
  reconcileLanes,
  ZoneEvidence,
} from './reconcileLanes'

const detector = (id = 1, overrides = {}) =>
  ({
    id,
    detectorChannel: 300 + id,
    dectectorIdentifier: 'Arbitrary zone',
    laneNumber: 1,
    laneType: 'V',
    movementType: 'L',
    detectionTypes: [{ id: 4 }],
    ...overrides,
  }) as unknown as ConfigDetector
const approach = (detectors = [detector()]) =>
  [
    { id: 10, protectedPhaseNumber: 1, directionTypeId: 'NB', detectors },
  ] as unknown as ConfigApproach[]
const inventory = [{ deviceId: 7, names: ['Arbitrary zone'] }]
const evidence: ZoneEvidence[] = [
  {
    deviceId: 7,
    zoneName: 'Arbitrary zone',
    through: 80,
    left: 20,
    right: 0,
    bins: 96,
  },
]
beforeAll(() => {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value))
})

it('uses configured lanes and arbitrary names to recommend separate left and through entries', () => {
  const current = approach()
  const review = reconcileLanes(current, inventory, evidence)
  expect(review.recommendations[0].movements).toEqual(['L', 'T'])
  const next = applyLaneRecommendations(current, review.recommendations, {
    'movements-1': [302],
  })
  expect(next[0].detectors.map((d) => d.movementType)).toEqual(['L', 'T'])
  expect(next[0].detectors.map((d) => d.dectectorIdentifier)).toEqual([
    'Arbitrary zone',
    'Arbitrary zone',
  ])
  expect(next[0].detectors[1]).toMatchObject({
    isNew: true,
    laneNumber: 1,
    approachId: 10,
    detectionTypes: [{ id: 4 }],
  })
  expect(current[0].detectors).toHaveLength(1)
})

it('excludes controller channels including 64 and does not call their zones unused', () => {
  const current = approach([
    detector(1, { detectorChannel: 1 }),
    detector(2, { detectorChannel: 64 }),
  ])
  expect(reconcileLanes(current, inventory, evidence)).toEqual({
    recommendations: [],
    warnings: [],
  })
})

it('never removes a configured movement based on zero counts', () => {
  const current = approach()
  const result = reconcileLanes(current, inventory, [
    { ...evidence[0], through: 0, left: 0 },
  ])
  expect(result.recommendations).toHaveLength(0)
  expect(result.warnings.join(' ')).toContain('Zero counts')
})

it('splits combined movements without losing an unobserved configured movement', () => {
  const current = approach([detector(1, { movementType: 'TR' })])
  const result = reconcileLanes(current, inventory, [
    { ...evidence[0], left: 0 },
  ])
  expect(result.recommendations[0].movements).toEqual(['T', 'R'])
  expect(result.warnings.join(' ')).toContain('Zero counts')
})

it('warns about overlapping assignments without adding more counts', () => {
  const current = approach([detector(1, { movementType: 'TL' }), detector(2)])
  const result = reconcileLanes(current, inventory, evidence)
  expect(result.recommendations).toHaveLength(0)
  expect(result.warnings.join(' ')).toContain('double-count')
})

it('warns about unused zones and missing configured zones', () => {
  const current = approach()
  const result = reconcileLanes(
    current,
    [{ deviceId: 7, names: ['Unassigned'] }],
    []
  )
  expect(result.warnings.join(' ')).toContain('not returned')
  expect(result.warnings.join(' ')).toContain('Unused zone Unassigned')
})

it('does not guess a replacement for a missing zone', () => {
  const current = approach([detector(1, { dectectorIdentifier: 'Mistyped' })])
  const result = reconcileLanes(current, inventory, evidence)
  expect(result.recommendations).toHaveLength(0)
  expect(result.warnings.join(' ')).toContain('not returned')
})

it('does not match identical names across cameras', () => {
  const current = approach()
  const result = reconcileLanes(
    current,
    [...inventory, { ...inventory[0], deviceId: 8 }],
    evidence
  )
  expect(result.recommendations).toHaveLength(0)
  expect(result.warnings.join(' ')).toContain('multiple devices')
})

it('suppresses edits when another device inventory cannot be read', () => {
  const current = approach()
  const result = reconcileLanes(
    current,
    [...inventory, { deviceId: 8, names: [], error: 'offline' }],
    evidence
  )
  expect(result.recommendations).toHaveLength(0)
  expect(result.warnings.join(' ')).toContain('inventory unavailable')
})

it('requires a configured physical lane number before recommending an added movement', () => {
  const result = reconcileLanes(
    approach([detector(1, { laneNumber: null })]),
    inventory,
    evidence
  )
  expect(result.recommendations).toHaveLength(0)
  expect(result.warnings.join(' ')).toContain('lane number needs verification')
})

it('does not recommend a new movement for a few misclassified vehicles', () => {
  const current = approach()
  const result = reconcileLanes(current, inventory, [
    { ...evidence[0], through: 1 },
  ])
  expect(result.recommendations).toHaveLength(0)
  expect(result.warnings.join(' ')).toContain('low-volume')
})

it.each([1, 64, 301, 302.5, NaN])(
  'rejects invalid or occupied new channel %s atomically',
  (channel) => {
    const current = approach()
    const result = reconcileLanes(current, inventory, evidence)
    expect(() =>
      applyLaneRecommendations(current, result.recommendations, {
        'movements-1': [channel],
      })
    ).toThrow()
    expect(current[0].detectors).toHaveLength(1)
  }
)
