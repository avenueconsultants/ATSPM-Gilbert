import type { Device } from '@/api/config'
import { configRequest } from '@/lib/axios'

type InventoryDevice = Pick<
  Device,
  'id' | 'ipaddress' | 'deviceIdentifier' | 'deviceConfiguration'
>

/** Source-specific inventory access stays outside the reconciliation UI and matching rules.
 * Add an adapter here when another report decoder supports independent zone evidence.
 */
export interface LaneDecoder {
  readZones(device: InventoryDevice): Promise<string[]>
  identity(device: InventoryDevice): string
}
const vision: LaneDecoder = {
  identity: (d) =>
    `${d.ipaddress}:${d.deviceConfiguration?.port}/${d.deviceIdentifier?.replace(/-bins$/, '')}`,
  readZones: async (d) => {
    const names = await configRequest<string[]>({
      url: '/Detector/retrieveDetectionData',
      method: 'POST',
      data: {
        IpAddress: d.ipaddress,
        port: String(d.deviceConfiguration?.port ?? ''),
        detectionType: 'FIRCamera',
        deviceId: d.deviceIdentifier?.replace(/-bins$/, ''),
      },
    })
    if (!Array.isArray(names) || names.some((name) => typeof name !== 'string'))
      throw new Error('Invalid zone inventory response')
    if (new Set(names).size !== names.length)
      throw new Error('Duplicate zone names on the device')
    return names
  },
}
export const laneDecoders: Record<string, LaneDecoder> = {
  VisionCameraAPI: vision,
}
