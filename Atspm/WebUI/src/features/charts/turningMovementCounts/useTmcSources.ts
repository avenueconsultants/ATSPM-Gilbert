import type { Device, Location } from '@/api/config'
import { getDeviceActiveDevicesByLocationFromLocationId } from '@/api/config/device/device'
import { reportsRequest } from '@/lib/axios'
import { useQuery } from 'react-query'

type TmcDevice = Omit<Device, 'deviceStatus'> & {
  deviceStatus?: number | string
  deviceProperties?: Record<string, unknown>
  TmcDecoder?: string
}
export function normalizeTmcDevices(
  data?: TmcDevice[] | { value?: TmcDevice[] } | null
): TmcDevice[] {
  return Array.isArray(data) ? data : (data?.value ?? [])
}
export interface TmcSource {
  key: string
  name: string
  deviceIds: number[]
  decoder?: string
}
export const ATSPM_SOURCE: TmcSource = {
  key: 'atspm',
  name: 'Indiana Events (ATSPM)',
  deviceIds: [],
}

export function formatDecoderLabel(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

export function groupTmcSources(devices: TmcDevice[]): TmcSource[] {
  const groups = new Map<string, TmcDevice[]>()
  for (const device of devices) {
    const decoder = device.deviceProperties?.TmcDecoder ?? device.TmcDecoder
    if (
      (device.deviceStatus !== 'Active' && device.deviceStatus !== 3) ||
      typeof decoder !== 'string' ||
      !decoder
    )
      continue
    for (const name of new Set(decoder.split(',').map((name) => name.trim()).filter(Boolean))) {
      groups.set(name, [...(groups.get(name) ?? []), device])
    }
  }
  return [
    ATSPM_SOURCE,
    ...Array.from(groups, ([decoder, cameras]) => {
      const deviceIds = cameras.map((d) => d.id!).sort((a, b) => a - b)
      const count = new Set(
        cameras.map(
          (d) =>
            `${d.ipaddress}:${d.deviceConfiguration?.port}/${d.deviceIdentifier?.replace(/-bins$/, '')}`
        )
      ).size
      return {
        key: `devices:${decoder}:${deviceIds.join(',')}`,
        deviceIds,
        decoder,
        name: `${formatDecoderLabel(decoder)} (${count} camera${count === 1 ? '' : 's'})`,
      }
    }),
  ]
}

export const TMC_DEVICE_SOURCES_FLAG_KEY = ['tmc-device-sources-enabled']
export const TMC_DEVICE_SOURCES_FLAG_STALE_TIME = 60000

export const getTmcDeviceSourcesEnabled = () =>
  reportsRequest<boolean>({
    url: '/api/v1/TurningMovementCounts/deviceSourcesEnabled',
    method: 'GET',
  })

export function useTmcSources(location?: Location | null, enabled = true) {
  const flag = useQuery(
    TMC_DEVICE_SOURCES_FLAG_KEY,
    getTmcDeviceSourcesEnabled,
    { enabled, staleTime: TMC_DEVICE_SOURCES_FLAG_STALE_TIME }
  )
  const loaded =
    Array.isArray(location?.devices) &&
    location.devices.every(
      (d) =>
        (d as TmcDevice).deviceProperties !== undefined ||
        (d as TmcDevice).TmcDecoder !== undefined
    )
  const devices = useQuery(
    ['tmc-devices', location?.id],
    () => getDeviceActiveDevicesByLocationFromLocationId(location!.id!),
    {
      enabled: enabled && flag.data === true && !!location?.id && !loaded,
      staleTime: 30000,
    }
  )
  const sources =
    enabled && flag.data === true
      ? groupTmcSources(
          normalizeTmcDevices(loaded ? location?.devices : devices.data)
        )
      : [ATSPM_SOURCE]
  return {
    sources,
    loading:
      flag.isLoading ||
      (!loaded && !!location?.id && flag.data === true && devices.isLoading),
  }
}
