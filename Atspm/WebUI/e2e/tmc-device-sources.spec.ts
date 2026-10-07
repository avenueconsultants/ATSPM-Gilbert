import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// Opt-in hardware smoke: requires a running deployment with the feature enabled
// and a configured Vision source. Uses the complete UI -> API -> camera path.
test('select camera source, generate TMC, and export source-labelled CSV', async ({
  page,
}) => {
  test.skip(
    !process.env.TMC_E2E_LOCATION,
    'Set TMC_E2E_LOCATION to a configured test location identifier'
  )
  const params = new URLSearchParams({
    location: process.env.TMC_E2E_LOCATION!,
    chartType: 'TurningMovementCounts',
    start: process.env.TMC_E2E_START ?? '2026-09-25T17:00:00',
    end: process.env.TMC_E2E_END ?? '2026-09-25T18:00:00',
  })
  await page.goto(`/performance-measures?${params}`)
  await expect(
    page.getByRole('radio', { name: 'Indiana Events (ATSPM)', exact: true })
  ).toBeChecked({ timeout: 30000 })
  await page.getByRole('radio', { name: /Vision Camera API/ }).check()
  const responsePromise = page.waitForResponse(
    (r) =>
      /TurningMovementCounts\/getReportData/i.test(r.url()) &&
      r.request().method() === 'POST'
  )
  await page.getByRole('button', { name: /Generate Chart/i }).click()
  const response = await responsePromise
  expect(response.status(), await response.text()).toBe(200)
  const payload = response.request().postDataJSON()
  expect(payload.source).toBe('devices')
  expect(payload.deviceIds.length).toBeGreaterThan(0)
  const result = await response.json()
  expect(result.charts.length).toBeGreaterThan(0)
  expect(
    result.charts.reduce(
      (total: number, chart: { totalVolume: number }) =>
        total + chart.totalVolume,
      0
    )
  ).toBeGreaterThan(0)
  await expect(
    page.getByText(`Source: ${result.source}`, { exact: true })
  ).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click()
  const download = await downloadPromise
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv.split('\n')[0]).toMatch(/^Source,/)
  expect(csv).toContain(result.source)
})

// Regression: loading measure defaults must preserve the source in a saved URL.
test('saved database source survives a cold page load', async ({ page }) => {
  test.skip(!process.env.TMC_E2E_LOCATION || !process.env.TMC_E2E_STORED_DEVICE_IDS,
    'Set location and stored device IDs for this deployment')
  const params = new URLSearchParams({
    location: process.env.TMC_E2E_LOCATION!, chartType: 'TurningMovementCounts',
    start: process.env.TMC_E2E_START ?? '2026-09-25T00:00:00',
    end: process.env.TMC_E2E_END ?? '2026-09-26T00:00:00',
    source: 'devices', deviceIds: process.env.TMC_E2E_STORED_DEVICE_IDS!,
  })
  await page.goto(`/performance-measures?${params}`)
  await expect(page.getByRole('radio', { name: /Vision Bin Statistics Stored/ }))
    .toBeChecked({ timeout: 30000 })
  const responsePromise = page.waitForResponse(r =>
    /TurningMovementCounts\/getReportData/i.test(r.url()) && r.request().method() === 'POST')
  await page.getByRole('button', { name: /Generate Chart/i }).click()
  const response = await responsePromise
  expect(response.status(), await response.text()).toBe(200)
  expect(response.request().postDataJSON().deviceIds)
    .toEqual(process.env.TMC_E2E_STORED_DEVICE_IDS!.split(',').map(Number))
  expect((await response.json()).source).toContain('Vision Bin Statistics Stored')
})
