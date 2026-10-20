import type {
  ConfigApproach,
  ConfigDetector,
} from '../editLocation/locationStore'
import type { ZoneEvidence, ZoneInventory } from './reconcileLanes'

export const mockScenarios = [
  {
    name: 'Split Through/Right',
    movements: ['TR'],
    counts: [120, 0, 30],
    explanation:
      'Keep the existing channel for Through and add Right on a new channel, using the same zone and physical lane.',
  },
  {
    name: 'Split Through/Left',
    movements: ['TL'],
    counts: [120, 25, 0],
    explanation:
      'Keep the existing channel for Through and add Left on a new channel, using the same zone and physical lane.',
  },
  {
    name: 'Left only, missing Through',
    movements: ['L'],
    counts: [120, 25, 0],
    explanation:
      'Keep Left and offer a new Through entry sharing its zone and physical lane.',
  },
  {
    name: 'Through only, both turns missing',
    movements: ['T'],
    counts: [120, 25, 30],
    explanation:
      'Offer separate Left and Right entries with distinct suggested channels.',
  },
  {
    name: 'Separate Left/Right, missing Through',
    movements: ['L', 'R'],
    counts: [120, 25, 30],
    explanation:
      'Offer Through once; keep the existing Left and Right entries separate.',
  },
  {
    name: 'Zero-count turn removal',
    movements: ['T', 'R'],
    counts: [120, 0, 0],
    explanation:
      'Offer optional removal of Right. Zero counts do not prove that the turn is unavailable.',
  },
  {
    name: 'Already matching',
    movements: ['T', 'L', 'R'],
    counts: [120, 25, 30],
    explanation: 'No additions or removals should be needed.',
  },
  {
    name: 'Overlapping TL/TR on different physical lanes',
    movements: ['TL', 'TR'],
    counts: [120, 25, 30],
    separateLanes: true,
    explanation:
      'Both entries claim Through. Warn and preserve both physical lanes instead of duplicating zone totals.',
  },
  {
    name: 'Low-volume turn',
    movements: ['T'],
    counts: [120, 0, 2],
    explanation:
      'Below the minimum count of five: warn rather than recommend adding Right.',
  },
]

export function loadMockScenario(index: number) {
  const scenario = mockScenarios[index]
  const approaches = [
    {
      id: 1,
      description: 'Mock Northbound',
      directionTypeId: 'NB',
      protectedPhaseNumber: 2,
      detectors: scenario.movements.map(
        (movementType, i) =>
          ({
            id: i + 1,
            approachId: 1,
            detectorChannel: 118 + i,
            dectectorIdentifier: 'NB-18',
            laneNumber: scenario.separateLanes ? i + 1 : 1,
            movementType,
            laneType: 'V',
            detectionTypes: [{ id: 4 }],
          }) as unknown as ConfigDetector
      ),
    },
  ] as unknown as ConfigApproach[]
  const inventory: ZoneInventory[] = [{ deviceId: 1, names: ['NB-18'] }]
  const evidence: ZoneEvidence[] = [
    {
      deviceId: 1,
      zoneId: 100,
      zoneName: 'NB-18',
      through: scenario.counts[0],
      left: scenario.counts[1],
      right: scenario.counts[2],
      bins: 96,
    },
  ]
  return { approaches, inventory, evidence }
}

