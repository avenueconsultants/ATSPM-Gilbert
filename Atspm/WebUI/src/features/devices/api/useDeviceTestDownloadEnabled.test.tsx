import { dataRequest } from '@/lib/axios'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { useDeviceTestDownloadEnabled } from './useDeviceTestDownloadEnabled'

jest.mock('@/lib/axios', () => ({ dataRequest: jest.fn() }))

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return {
    client,
    ...renderHook(() => useDeviceTestDownloadEnabled(), { wrapper }),
  }
}

beforeEach(() => jest.clearAllMocks())

test.each([true, false, undefined])(
  'only explicit true enables the action: %s',
  async (value) => {
    ;(dataRequest as jest.Mock).mockResolvedValue(value)
    const { result, client } = show()
    expect(result.current).toBe(false)
    await waitFor(() => expect(client.isFetching()).toBe(0))
    expect(result.current).toBe(value === true)
    expect(dataRequest).toHaveBeenCalledWith({
      url: '/api/v1/Logging/testDownloadEnabled',
      method: 'GET',
    })
  }
)

test('API failure or older API keeps the action hidden', async () => {
  ;(dataRequest as jest.Mock).mockRejectedValue(new Error('Not found'))
  const { result, client } = show()
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect(result.current).toBe(false)
})
