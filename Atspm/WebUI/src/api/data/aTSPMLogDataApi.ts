import { useQuery, UseQueryOptions, UseQueryResult } from 'react-query'

export interface LoggingSyncNewLocationEvent {
  deviceId: number
  changeInEventCount?: number
  ipModified?: boolean
}

interface GetLoggingSyncNewLocationEventsParams {
  deviceIds?: string
}

export function useGetLoggingSyncNewLocationEvents<
  TData = LoggingSyncNewLocationEvent[],
>(
  params?: GetLoggingSyncNewLocationEventsParams,
  options?: {
    query?: UseQueryOptions<LoggingSyncNewLocationEvent[], unknown, TData>
  }
): UseQueryResult<TData, unknown> {
  const { query: queryOptions } = options ?? {}

  return useQuery<LoggingSyncNewLocationEvent[], unknown, TData>({
    queryKey: ['logging-sync-new-location-events', params?.deviceIds ?? ''],
    queryFn: async () => [],
    ...queryOptions,
  })
}
