import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ReconcileMockPage from './ReconcileMockPage'

jest.mock('@/stores/notifications', () => ({
  useNotificationStore: () => ({ addNotification: jest.fn() }),
}))

beforeAll(() => {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value))
})
it('splits TR into separate movements on the same zone and physical lane', () => {
  render(<ReconcileMockPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Compare mock lanes' }))
  expect(
    screen.getByText(
      'When applied, Channel 118 zone NB-18 will change from Through/Right to Through.'
    )
  ).toBeVisible()
  expect(
    within(
      screen.getByRole('table', { name: 'Mock lane configuration' })
    ).getByText('TR')
  ).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Add Channel 65 zone NB-18 Right' })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Apply selected to mock configuration' })
  )
  const table = within(
    screen.getByRole('table', { name: 'Mock lane configuration' })
  )
  expect(table.getAllByRole('row')).toHaveLength(3)
  expect(table.getByText('Through')).toBeVisible()
  expect(table.getByText('Right')).toBeVisible()
  expect(table.getAllByText('NB-18')).toHaveLength(2)
  expect(table.getAllByText('1')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Compare mock lanes' }))
  expect(screen.getByText('No changes recommended.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Reset scenario' }))
  expect(table.getByText('TR')).toBeVisible()
})
it('allows changing counts and explicitly removing a movement', () => {
  render(<ReconcileMockPage />)
  fireEvent.change(screen.getByLabelText('right'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Compare mock lanes' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove Channel 118 zone NB-18 Right' })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Apply selected to mock configuration' })
  )
  const table = within(
    screen.getByRole('table', { name: 'Mock lane configuration' })
  )
  expect(table.getAllByRole('row')).toHaveLength(2)
  expect(table.getByText('Through')).toBeVisible()
})
it('keeps Through lanes on distinct camera zones separate without warnings', () => {
  render(<ReconcileMockPage />)
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Scenario/ }))
  fireEvent.click(
    screen.getByRole('option', {
      name: 'Multiple Through lanes, different zones',
    })
  )
  expect(screen.getByLabelText('NB-18 through')).toHaveValue(120)
  expect(screen.getByLabelText('NB-19 through')).toHaveValue(85)
  // Editing one camera zone must not alter the other zone's evidence.
  fireEvent.change(screen.getByLabelText('NB-19 through'), {
    target: { value: '90' },
  })
  expect(screen.getByLabelText('NB-18 through')).toHaveValue(120)
  fireEvent.click(screen.getByRole('button', { name: 'Compare mock lanes' }))
  expect(screen.getByText('No warnings.')).toBeVisible()
  expect(screen.getByText('No changes recommended.')).toBeVisible()
  const rows = within(
    screen.getByRole('table', { name: 'Mock lane configuration' })
  ).getAllByRole('row')
  expect(rows).toHaveLength(3)
  expect(rows[1]).toHaveTextContent('118NB-181Through')
  expect(rows[2]).toHaveTextContent('119NB-192Through')
})

it('warns when separate configured Through/Right zones correspond to one camera zone', () => {
  render(<ReconcileMockPage />)
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Scenario/ }))
  fireEvent.click(screen.getByRole('option', { name: 'Separate Through/Right zones, shared camera zone' }))
  expect(screen.getByLabelText('through')).toHaveValue(120)
  expect(screen.getByLabelText('right')).toHaveValue(30)
  fireEvent.click(screen.getByRole('button', { name: 'Compare mock lanes' }))
  expect(screen.getByText(/Channel 119, zone NB-19: not returned by the devices/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Change Channel 119 zone NB-19 to NB-18' })).toBeVisible()
  const rows = within(screen.getByRole('table', { name: 'Mock lane configuration' })).getAllByRole('row')
  expect(rows[1]).toHaveTextContent('118NB-181Through')
  expect(rows[2]).toHaveTextContent('119NB-191Right')
})
