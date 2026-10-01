import { dataRequest } from '@/lib/axios'
import { useQuery } from 'react-query'

export function useDeviceTestDownloadEnabled() {
  const flag = useQuery(
    ['device-test-download-enabled'],
    () =>
      dataRequest<boolean>({
        url: '/api/v1/Logging/testDownloadEnabled',
        method: 'GET',
      }),
    { staleTime: 60000 }
  )
  // Keep the action hidden while loading, on errors, or when talking to an older API.
  return flag.data === true && !flag.isError
}
