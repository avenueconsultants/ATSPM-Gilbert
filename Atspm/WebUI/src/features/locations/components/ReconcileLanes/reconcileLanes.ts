import type {
  ConfigApproach,
  ConfigDetector,
} from '../editLocation/locationStore'

export type ZoneEvidence = {
  deviceId: number
  zoneName: string | null
  zoneId?: number | null
  through: number
  left: number
  right: number
  bins: number
}
export type ZoneInventory = {
  deviceId: number
  names: string[]
  error?: string
}
export type Recommendation = {
  id: string
  detectorId: number
  description: string
  movements?: string[]
  remove?: boolean
  /** Related verification warning; render this optional change alongside it. */
  warning?: string
}
export type LaneReview = {
  recommendations: Recommendation[]
  warnings: string[]
}
const movements: Record<string, string[]> = {
  T: ['T'],
  L: ['L'],
  R: ['R'],
  TL: ['T', 'L'],
  TR: ['T', 'R'],
  LTR: ['L', 'T', 'R'],
}
const movementName = (value: unknown) =>
  typeof value === 'number'
    ? ['NA', 'T', 'R', 'L', 'TR', 'TL', 'NW', 'LTR'][value]
    : String(value)
const movementLabels: Record<string, string> = {
  T: 'Through',
  L: 'Left',
  R: 'Right',
}
const removalLabel = (d: ConfigDetector, removed: string[]) =>
  `Remove Channel ${d.detectorChannel} zone ${d.dectectorIdentifier} ${removed.map((m) => movementLabels[m] ?? m).join(' + ')}`
const active = (d: ConfigDetector) => !d.dateDisabled
const eligible = (d: ConfigDetector) =>
  active(d) && Number(d.detectorChannel) > 64
const flatten = (approaches: ConfigApproach[]) =>
  approaches.flatMap((a) => a.detectors.map((d) => ({ a, d })))

export const zoneEvidenceLabel = (row: ZoneEvidence) =>
  row.zoneName?.trim()
    ? row.zoneName
    : `Unnamed zone ${row.zoneId ?? '(ID unavailable)'}`

/** The current location already includes its template. Match exact configured zone names without a naming convention. */
export function reconcileLanes(
  approaches: ConfigApproach[],
  inventory: ZoneInventory[],
  evidence: ZoneEvidence[],
  minimum = 5
): LaneReview {
  const recommendations: Recommendation[] = []
  const warnings: string[] = []
  const configured = flatten(approaches).filter(({ d }) => eligible(d))
  // Build indexes once rather than rescanning every detector and bin row per lane.
  const groups = new Map<string, typeof configured>()
  for (const entry of configured) {
    const name = entry.d.dectectorIdentifier ?? ''
    const group = groups.get(name) ?? []
    group.push(entry)
    groups.set(name, group)
  }
  const assignments = new Map(
    [...groups].map(([name, group]) => {
      const assigned = group.flatMap(
        ({ d }) => movements[movementName(d.movementType)] ?? []
      )
      return [
        name,
        {
          assigned: new Set(assigned),
          overlap: new Set(assigned).size !== assigned.length,
        },
      ]
    })
  )
  const evidenceByDevice = new Map<number, Map<string, ZoneEvidence[]>>()
  for (const row of evidence) {
    if (!row.zoneName?.trim()) {
      warnings.push(
        `${zoneEvidenceLabel(row)} on device ${row.deviceId}: configure a zone name before matching lanes.`
      )
      continue
    }
    const zones =
      evidenceByDevice.get(row.deviceId) ?? new Map<string, ZoneEvidence[]>()
    const rows = zones.get(row.zoneName) ?? []
    rows.push(row)
    zones.set(row.zoneName, rows)
    evidenceByDevice.set(row.deviceId, zones)
  }
  const owners = new Map<string, number[]>()
  for (const camera of inventory) {
    if (camera.error)
      warnings.push(
        `Device ${camera.deviceId}: zone inventory unavailable (${camera.error}). Missing zones cannot be verified.`
      )
    else
      for (const name of new Set(camera.names))
        owners.set(name, [...(owners.get(name) ?? []), camera.deviceId])
  }
  const completeInventory =
    inventory.length > 0 && inventory.every((i) => !i.error)
  for (const { d } of configured) {
    const label = `Channel ${d.detectorChannel}, zone ${d.dectectorIdentifier || '(unassigned)'}`
    const name = d.dectectorIdentifier ?? ''
    const devices = owners.get(name) ?? []
    if (devices.length !== 1) {
      if (devices.length > 1)
        warnings.push(
          `${label}: zone name occurs on multiple devices. The importer matches names; verify uniqueness before applying changes.`
        )
      else if (completeInventory)
        warnings.push(
          `${label}: not returned by the devices. Verify the assignment or camera configuration; do not delete the lane automatically.`
        )
      continue
    }
    if (!completeInventory) continue // Another unreachable device could own the same zone name.
    const rows = evidenceByDevice.get(devices[0])?.get(name) ?? []
    if (rows.length !== 1 || rows[0].bins === 0) {
      warnings.push(
        `${label}: no unambiguous bin evidence in the selected period.`
      )
      if (
        name.trim() &&
        ['V', '1'].includes(String(d.laneType)) &&
        (rows.length === 0 || (rows.length === 1 && rows[0].bins === 0))
      )
        recommendations.push({
          id: `remove-${d.id}`,
          warning: warnings[warnings.length - 1],
          detectorId: d.id,
          remove: true,
          description: removalLabel(
            d,
            movements[movementName(d.movementType)] ?? [
              movementName(d.movementType),
            ]
          ),
        })
      continue
    }
    const counts: Record<string, number> = {
      T: rows[0].through,
      L: rows[0].left,
      R: rows[0].right,
    }
    const group = groups.get(name)!
    const { assigned, overlap } = assignments.get(name)!
    if (overlap) {
      if (group[0].d.id === d.id)
        warnings.push(
          `Zone ${name}: overlapping movement assignments can double-count vehicles. Review channels ${group.map((r) => r.d.detectorChannel).join(', ')}.`
        )
      continue
    }
    const declared = movements[movementName(d.movementType)]
    if (!declared || !['V', '1'].includes(String(d.laneType))) {
      warnings.push(
        `${label}: verify movement/lane type manually (T ${counts.T}, L ${counts.L}, R ${counts.R}).`
      )
      continue
    }
    const absent = declared.filter((m) => counts[m] === 0)
    if (absent.length) {
      warnings.push(
        `${label}: no ${absent.join('/')} observed. Zero counts do not establish a turn-only lane; verify permitted movements before choosing removal.`
      )
      const retained = declared.filter((m) => !absent.includes(m))
      recommendations.push({
        id: `remove-${d.id}`,
        warning: warnings[warnings.length - 1],
        detectorId: d.id,
        ...(retained.length ? { movements: retained } : { remove: true }),
        description: removalLabel(d, absent),
      })
    }
    const unassigned = Object.keys(counts).filter(
      (m) => counts[m] > 0 && !assigned.has(m)
    )
    // Do not infer which of several physical lanes sharing a zone should receive another movement.
    if (group.length > 1 && unassigned.length) {
      warnings.push(
        `Zone ${name}: unassigned ${unassigned.join('/')} observed across multiple configured lanes; verify which lane serves it.`
      )
      continue
    }
    const enough = unassigned.filter((m) => counts[m] >= minimum)
    if (unassigned.some((m) => counts[m] < minimum))
      warnings.push(
        `${label}: low-volume unassigned movements; review T ${counts.T}, L ${counts.L}, R ${counts.R} before adding a lane.`
      )
    if (Number(d.laneNumber) > 0 && (declared.length > 1 || enough.length)) {
      const next = [...new Set([...declared, ...enough])]
      recommendations.push({
        id: `movements-${d.id}`,
        detectorId: d.id,
        movements: next,
        description: `${label}: use separate ${next.join(' + ')} entries sharing this zone and physical lane (T ${counts.T}, L ${counts.L}, R ${counts.R}). Verify camera classification and allowed turns before applying.`,
      })
    } else if (enough.length)
      warnings.push(
        `${label}: unassigned ${enough.join('/')} observed; configured lane number needs verification before recommending a split.`
      )
  }
  const allAssigned = new Set(
    flatten(approaches)
      .filter(({ d }) => active(d))
      .map(({ d }) => d.dectectorIdentifier)
  )
  for (const [name, devices] of owners) {
    // Zones used exclusively on channels 1–64 are deliberately outside this review.
    if (!allAssigned.has(name))
      warnings.push(
        `Unused zone ${name} (device ${devices.join(', ')}): no configured detector uses it. Assign only after verifying its purpose.`
      )
  }
  for (const row of evidence)
    if (
      row.zoneName?.trim() &&
      !owners.get(row.zoneName)?.includes(row.deviceId)
    )
      warnings.push(
        `Bin zone ${row.zoneName} on device ${row.deviceId} is absent from the current inventory; configuration may have changed.`
      )
  return { recommendations, warnings: [...new Set(warnings)] }
}

/** Stages changes only. Existing IDs/settings remain intact; new entries require explicit unique channels. */
export function applyLaneRecommendations(
  approaches: ConfigApproach[],
  selected: Recommendation[],
  channels: Record<string, number[]>
): ConfigApproach[] {
  const result = structuredClone(approaches)
  if (new Set(selected.map((r) => r.detectorId)).size !== selected.length)
    throw new Error('Choose only one change per lane entry.')
  const used = new Set(
    flatten(result).map(({ d }) => Number(d.detectorChannel))
  )
  let nextId = Math.max(0, ...flatten(result).map(({ d }) => d.id)) + 1
  for (const change of selected) {
    const match = flatten(result).find(({ d }) => d.id === change.detectorId)
    if (!match || !eligible(match.d))
      throw new Error('Configuration changed. Run reconciliation again.')
    const { a, d } = match
    if (change.remove) {
      a.detectors = a.detectors.filter((entry) => entry.id !== d.id)
      continue
    }
    if (change.movements) {
      const [first, ...rest] = change.movements
      const additions = channels[change.id] ?? []
      if (additions.length !== rest.length)
        throw new Error(
          'Provide one unused channel above 64 for each new movement.'
        )
      const original = { ...d }
      d.movementType = first as unknown as ConfigDetector['movementType']
      rest.forEach((movement, i) => {
        const channel = additions[i]
        if (!Number.isInteger(channel) || channel <= 64 || used.has(channel))
          throw new Error(`Channel ${channel} must be unused and above 64.`)
        used.add(channel)
        a.detectors.push({
          ...original,
          id: nextId++,
          isNew: true,
          approachId: a.id,
          detectorChannel: channel,
          movementType: movement as unknown as ConfigDetector['movementType'],
          dateAdded: new Date().toISOString(),
          detectorComments: [],
        })
      })
    }
  }
  return result
}
