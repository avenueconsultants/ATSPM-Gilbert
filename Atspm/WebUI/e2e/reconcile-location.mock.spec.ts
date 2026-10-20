import approachScenarios from '../../../scenario-mock-tool/src/components/approachMockScenarios.json'
import { expect, test, type Page } from '@playwright/test'
import {
  loadMockScenario,
  mockScenarios,
} from '../../../scenario-mock-tool/src/components/mockScenarios'

// Exercise the production location editor. Only its HTTP boundary is replaced;
// reconciliation, selection, staging and save serialization all run normally.
const locationId = 990001
test.use({ serviceWorkers: 'block' })
const enums = {
  DirectionTypes: ['NA', 'NB', 'SB', 'EB', 'WB'],
  MovementTypes: ['NA', 'T', 'R', 'L', 'TR', 'TL', 'NW', 'LTR'],
  LaneTypes: ['NA', 'V'],
  DetectionHardwareTypes: ['Unknown', 'Video'],
  DetectionTypes: ['Unknown', 'Basic', 'Advanced', 'Count', 'LaneByLaneCount'],
}
const metadata = `<Schema>${Object.entries(enums)
  .map(
    ([name, values]) =>
      `<EnumType Name="${name}">${values.map((name, value) => `<Member Name="${name}" Value="${value}"/>`).join('')}</EnumType>`
  )
  .join('')}</Schema>`

async function openScenario(page: Page, index: number, lanes = true, approachScenario?: typeof approachScenarios[number]) {
  // Leaflet's pending zoom transition can outlive the General tab on unmount.
  await page.addInitScript('window.L_DISABLE_3D = true')

  const fixture = loadMockScenario(index)
  if (approachScenario) fixture.approaches = approachScenario.location.approaches.map(a => ({
    ...a, directionTypeId: 'NA',
    detectors: a.detectors.map(d => ({ ...d, detectionTypes: [], movementType: 'T', laneType: 'V', detectionHardware: 'Video' })),
  })) as any
  const device = {
    id: 1,
    deviceStatus: 'Active',
    deviceType: 'FIRCamera',
    deviceIdentifier: 'mock-camera',
    ipaddress: '192.0.2.1',
    deviceConfiguration: { port: 80 },
    deviceProperties: { TmcDecoder: 'VisionCameraAPI' },
  }
  const location = {
    id: locationId,
    locationIdentifier: 'MOCK',
    primaryName: 'Mock',
    secondaryName: 'Intersection',
    latitude: 40,
    longitude: -111,
    start: '2026-01-01T00:00:00',
    areas: [],
    devices: [device],
    approaches: fixture.approaches.map((a) => ({
      ...a,
      locationId,
      detectors: a.detectors.map((d) => ({
        ...d,
        dateAdded: '2026-01-01T00:00:00',
        detectionTypes: [{ id: 4, abbreviation: 'LaneByLaneCount' }],
      })),
    })),
  }
  const writes: any[] = []
  const reports: any[] = []
  const unexpected: string[] = []
  page.on('pageerror', (error) => unexpected.push(error.message))
  let syncs = 0
  const origin = new URL(test.info().project.use.baseURL as string).origin
  await page.context().addCookies([
    { name: 'loggedIn', value: 'true', url: origin },
    { name: 'claims', value: 'Admin', url: origin },
  ])
  // Deny all API fallthrough, including writes and camera access. Test data
  // cannot reach a real service even if a new endpoint is introduced.
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const json = (body: unknown) => route.fulfill({ json: body })
    if (path === '/api/get-env')
      return json({
        CONFIG_URL: `${origin}/mock/config`,
        REPORTS_URL: `${origin}/mock/reports`,
        IDENTITY_URL: `${origin}/mock/identity`,
        DATA_URL: `${origin}/mock/data`,
        MAP_DEFAULT_LATITUDE: '40',
        MAP_DEFAULT_LONGITUDE: '-111',
        MAP_DEFAULT_ZOOM: '12',
        MAP_TILE_LAYER: '',
        MAP_TILE_ATTRIBUTION: 'Mock',
      })
    if (path === '/api/google/tiles/session')
      return route.fulfill({
        status: 503,
        json: { error: 'Map tiles disabled in reconciliation tests' },
      })
    if (path === '/api/feature-flags')
      return json({ laneReconciliation: lanes, speedManagementTool: false })
    if (path.endsWith('/Profile'))
      return json({ firstName: 'Mock', lastName: 'Admin' })
    if (path.endsWith('/$metadata'))
      return route.fulfill({ contentType: 'application/xml', body: metadata })
    if (path.endsWith(`/Location/${locationId}`)) return json(location)
    if (
      path.endsWith('/GetLatestVersionOfAllLocations') ||
      path.endsWith('/GetLocationsForSearch')
    )
      return json({ value: [location] })
    if (path.endsWith('/SyncLocation')) {
      syncs++
      return json(approachScenario?.expected ?? {})
    }
    if (path.includes('/Device/GetActiveDevicesByLocation'))
      return json([device])
    if (path.endsWith('/Detector/retrieveDetectionData'))
      return json(fixture.inventory[0].names)
    if (path.endsWith('/TurningMovementCounts/getReportData')) {
      reports.push(request.postDataJSON())
      return json({
        zoneEvidence: fixture.evidence,
        sourceDeviceIds: [1],
        warnings: [],
      })
    }
    if (path.endsWith('/UpsertApproach')) {
      const body = request.postDataJSON()
      writes.push(body)
      return json(body)
    }
    if (path.startsWith('/mock/') && request.method() === 'GET')
      return json({ value: [] })
    if (
      path.startsWith('/api/') ||
      path.startsWith('/mock/') ||
      request.method() !== 'GET' ||
      url.origin !== origin
    ) {
      unexpected.push(`${request.method()} ${path}`)
      return route.abort()
    }
    return route.continue()
  })
  await page.goto(`/admin/locations/${locationId}`)
  await expect(page.locator('.leaflet-container').first()).toBeVisible()
  await page.getByRole('tab', { name: 'Approaches', exact: true }).click()
  await page
    .getByRole('button', { name: 'Reconcile Approaches', exact: true })
    .click()
  await expect.poll(() => syncs).toBe(1)
  expect(reports).toHaveLength(0)
  if (lanes) {
    await page.getByRole('tab', { name: 'Lanes', exact: true }).click()
    await page
      .getByLabel('Start (location time)', { exact: true })
      .fill('2026-10-01T00:00')
    await page
      .getByLabel('End (exclusive)', { exact: true })
      .fill('2026-10-02T00:00')
    await page
      .getByRole('button', { name: 'Compare lanes', exact: true })
      .click()
    await expect(
      page.getByRole('table', { name: 'Observed zone counts' })
    ).toBeVisible()
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      locationIdentifier: 'MOCK',
      decoder: 'VisionCameraAPI',
      deviceIds: [1],
      reconcileLanes: true,
      start: '2026-10-01T00:00',
      end: '2026-10-02T00:00',
    })
  }
  return { fixture, writes, reports, unexpected }
}

const expected = [
  [
    [118, 'T'],
    [65, 'R'],
  ],
  [
    [118, 'T'],
    [65, 'L'],
  ],
  [
    [118, 'L'],
    [65, 'T'],
  ],
  [
    [118, 'T'],
    [65, 'L'],
    [66, 'R'],
  ],
  [
    [118, 'L'],
    [119, 'R'],
    [65, 'T'],
  ],
  [[118, 'T']],
  [
    [118, 'T'],
    [119, 'L'],
    [120, 'R'],
  ],
  [
    [118, 'TL'],
    [119, 'TR'],
  ],
  [[118, 'T']],
  [
    [118, 'T'],
    [119, 'T'],
  ],
  [[118, 'T'], [119, 'R']],
]
const additions = [1, 1, 1, 2, 1, 0, 0, 0, 0, 0, 1]
for (const [index, scenario] of mockScenarios.entries()) {
  test(scenario.name, async ({ page }) => {
    const state = await openScenario(page, index)
    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByText(`Recommended lane changes (${additions[index]})`, {
        exact: true,
      })
    ).toBeVisible()
    if ([5, 7, 8, 10].includes(index))
      await expect(
        dialog.getByText(/Warnings — verify manually \([1-9]/)
      ).toBeVisible()
    else
      await expect(
        dialog.getByText('Warnings — verify manually (0)', { exact: true })
      ).toBeVisible()
    if (index === 5)
      await expect(
        dialog.getByText(/Zero counts do not establish a turn-only lane/)
      ).toBeVisible()
    if (index === 7)
      await expect(
        dialog.getByText(/overlapping movement assignments can double-count/)
      ).toBeVisible()
    if (index === 8)
      await expect(
        dialog.getByText(/low-volume unassigned movements/)
      ).toBeVisible()
    if (index < 2)
      await expect(
        dialog.getByText(
          new RegExp(
            'Channel 118 zone NB-18 will change from Through/.* to Through'
          )
        )
      ).toBeVisible()
    if (index === 9) {
      const rows = dialog.getByRole('table').getByRole('row')
      await expect(rows).toHaveCount(3)
      await expect(rows.nth(1)).toContainText('NB-18')
      await expect(rows.nth(1)).toContainText('120')
      await expect(rows.nth(2)).toContainText('NB-19')
      await expect(rows.nth(2)).toContainText('85')
    }
    const choices = dialog.getByRole('button', {
      name: /^(Add|Remove|Change) Channel/,
    })
    await expect(choices).toHaveCount(additions[index] + (index === 5 ? 1 : 0))
    await expect(
      dialog.getByRole('button', { name: 'Apply selected to editor' })
    ).toBeDisabled()
    for (const choice of await choices.all()) {
      await expect(choice).toHaveAttribute('aria-pressed', 'false')
      await choice.click()
    }
    expect(state.writes).toHaveLength(0)
    if (await choices.count()) {
      await dialog
        .getByRole('button', { name: 'Apply selected to editor' })
        .click()
      await expect(
        dialog.getByText(/Changes staged in the location editor/)
      ).toBeVisible()
    }
    expect(state.writes).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await page
      .getByRole('button', { name: 'save approach', exact: true })
      .click()
    await expect.poll(() => state.writes.length).toBe(1)
    const detectors = state.writes[0].detectors
    const actual = detectors
      .map((d: any) => [d.detectorChannel, enums.MovementTypes[d.movementType]])
      .sort((a: any, b: any) => a[0] - b[0])
    expect(actual).toEqual(
      [...expected[index]].sort((a, b) => Number(a[0]) - Number(b[0]))
    )
    for (const d of detectors) {
      expect(d.dectectorIdentifier).toBe(
        index === 9 && d.detectorChannel === 119 ? 'NB-19' : 'NB-18'
      )
      expect(d.laneNumber).toBe(
        [7, 9].includes(index) && d.detectorChannel === 119 ? 2 : 1
      )
    }
    expect(state.unexpected).toEqual([])
  })
}

test('disabled flag retains approaches without requesting lane evidence', async ({
  page,
}) => {
  const state = await openScenario(page, 0, false)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('tab', { name: 'Lanes', exact: true })
  ).toHaveCount(0)
  expect(state.reports).toEqual([])
  expect(state.writes).toEqual([])
  expect(state.unexpected).toEqual([])
})

for (const movement of ['Left', 'Right']) {
  test(`both turns missing: select only ${movement} and edit its channel`, async ({
    page,
  }) => {
    const state = await openScenario(page, 3)
    const dialog = page.getByRole('dialog')
    await dialog
      .getByRole('spinbutton', { name: `Channel for NB-18 ${movement}` })
      .fill('130')
    await dialog
      .getByRole('button', {
        name: `Add Channel 130 zone NB-18 ${movement}`,
        exact: true,
      })
      .click()
    await dialog
      .getByRole('button', { name: 'Apply selected to editor' })
      .click()
    await expect(
      dialog.getByText(/Changes staged in the location editor/)
    ).toBeVisible()
    expect(state.writes).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await page
      .getByRole('button', { name: 'save approach', exact: true })
      .click()
    await expect.poll(() => state.writes.length).toBe(1)
    expect(
      state.writes[0].detectors.map((d: any) => ({
        channel: d.detectorChannel,
        movement: d.movementType,
        zone: d.dectectorIdentifier,
        lane: d.laneNumber,
      }))
    ).toEqual([
      { channel: 118, movement: 1, zone: 'NB-18', lane: 1 },
      {
        channel: 130,
        movement: movement === 'Left' ? 3 : 2,
        zone: 'NB-18',
        lane: 1,
      },
    ])
    expect(state.unexpected).toEqual([])
  })
}

test('closing a selected split without applying preserves the original lane', async ({
  page,
}) => {
  const state = await openScenario(page, 0)
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('button', {
      name: 'Add Channel 65 zone NB-18 Right',
      exact: true,
    })
    .click()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  expect(state.writes).toHaveLength(0)
  await page.getByRole('button', { name: 'save approach', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0].detectors).toHaveLength(1)
  expect(state.writes[0].detectors[0]).toMatchObject({
    detectorChannel: 118,
    movementType: 4,
    dectectorIdentifier: 'NB-18',
    laneNumber: 1,
  })
  expect(state.unexpected).toEqual([])
})


for (const scenario of approachScenarios.filter(s => s.name.startsWith('Remove missing'))) {
  test(`regular page assignment removal: ${scenario.name}`, async ({ page }) => {
    const state = await openScenario(page, 0, false, scenario)
    await page.getByRole('button', { name: 'Select All', exact: true }).click()
    await page.getByRole('button', { name: 'Remove selected', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm removal', exact: true }).click()
    expect(state.writes).toHaveLength(0)
    await page.getByRole('button', { name: 'save approach', exact: true }).click()
    await expect.poll(() => state.writes.length).toBe(1)
    const saved = state.writes[0]
    const before = scenario.location.approaches[0]
    for (const role of ['protected', 'permissive', 'pedestrian'] as const) {
      const removed = scenario.expected.missingPhaseAssignments.some(a => a.role === role)
      const numberField = `${role}PhaseNumber`
      const overlapField = `is${role[0].toUpperCase()}${role.slice(1)}PhaseOverlap`
      expect(saved[numberField]).toBe(removed ? (role === 'protected' ? 0 : null) : (before as any)[numberField])
      expect(Boolean(saved[overlapField])).toBe(removed ? false : Boolean((before as any)[overlapField]))
    }
    expect(saved.detectors.map((d: any) => d.detectorChannel)).toEqual([118])
    expect(state.unexpected).toEqual([])
  })
}
