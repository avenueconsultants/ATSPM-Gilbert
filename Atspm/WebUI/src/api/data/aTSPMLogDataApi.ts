import { useMutation, UseMutationOptions, UseMutationResult } from 'react-query'

export interface LoggingSyncDeviceEvent {
  deviceId: number
  changeInEventCount?: number
  ipModified?: boolean
}

interface SyncDeviceEventsRequest {
  deviceIds?: number[] | null
}

export function usePostLoggingSyncDeviceEvents(
  options?: {
    mutation?: UseMutationOptions<
      LoggingSyncDeviceEvent[],
      unknown,
      { data: SyncDeviceEventsRequest }
    >
  }
): UseMutationResult<
  LoggingSyncDeviceEvent[],
  unknown,
  { data: SyncDeviceEventsRequest }
> {
  const { mutation: mutationOptions } = options ?? {}

  return useMutation<LoggingSyncDeviceEvent[], unknown, { data: SyncDeviceEventsRequest }>({
    mutationKey: ['Logging', 'SyncDeviceEvents'],
    mutationFn: async () => [],
    ...mutationOptions,
  })
}
