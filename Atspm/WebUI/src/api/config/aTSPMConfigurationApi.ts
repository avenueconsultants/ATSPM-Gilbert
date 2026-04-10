import { configRequest } from '@/lib/axios'
import {
  UseMutationOptions,
  UseMutationResult,
  useMutation,
} from 'react-query'

export interface SyncLocationFromKeyResponse {
  removedApproachIds?: number[]
  removedDetectors?: number[]
  loggedButUnusedProtectedOrPermissivePhases?: number[]
  loggedButUnusedOverlapPhases?: number[]
  loggedButUnusedDetectorChannels?: number[]
}

export * from './index'

export function useGetLocationSyncLocationFromKey<
  TError = unknown,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      SyncLocationFromKeyResponse,
      TError,
      { key: number },
      TContext
    >
  }
): UseMutationResult<
  SyncLocationFromKeyResponse,
  TError,
  { key: number },
  TContext
> {
  const mutationOptions = options?.mutation

  return useMutation<
    SyncLocationFromKeyResponse,
    TError,
    { key: number },
    TContext
  >({
    mutationKey: ['getLocationSyncLocationFromKey'],
    mutationFn: async ({ key }) =>
      configRequest<SyncLocationFromKeyResponse>({
        url: `/Location/${key}/SyncLocation`,
        method: 'POST',
      }),
    ...mutationOptions,
  })
}
