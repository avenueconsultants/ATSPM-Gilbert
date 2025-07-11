import { usePutDeviceFromKey } from '@/api/config/aTSPMConfigurationApi'
import { useGetDeviceConfigurations } from '@/features/devices/api'
import { useCreateDevice } from '@/features/devices/api/devices'
import { DeviceConfiguration } from '@/features/devices/types'
import { useGetProducts } from '@/features/products/api'
import { ConfigEnum, useConfigEnums } from '@/hooks/useConfigEnums'
import { usePostRequest } from '@/hooks/usePostRequest'
import { configAxios } from '@/lib/axios'
import { useNotificationStore } from '@/stores/notifications'
import { zodResolver } from '@hookform/resolvers/zod'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  List,
  ListItem,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { AxiosHeaders } from 'axios'
import Cookies from 'js-cookie'
import { useEffect, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'

const knownDeviceKeys = new Set([
  'id',
  'loggingEnabled',
  'ipaddress',
  'deviceStatus',
  'deviceType',
  'notes',
  'locationId',
  'deviceConfigurationId',
  'deviceIdentifier',
  'location',
  'deviceConfiguration',
  'created',
  'modified',
  'createdBy',
  'modifiedBy',
])

const deviceSchema = z.object({
  id: z.coerce.number().nullable().optional(),
  deviceIdentifier: z.string().optional(),
  loggingEnabled: z.boolean().default(true),
  ipaddress: z.string().optional(),
  deviceStatus: z.string().nonempty(),
  notes: z.string().max(512).optional(),
  deviceType: z.string().nonempty(),
  deviceConfigurationId: z.coerce.number(),
  productId: z.coerce.number(),
  locationId: z.number(),
  deviceProperties: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .nullable(),
})

const token = Cookies.get('token')
const headers: AxiosHeaders = new AxiosHeaders({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
})

export function useGetCameras() {
  return usePostRequest({
    url: '/Device/retrieveDeviceData',
    configAxios,
    headers,
    notify: false,
  })
}

export interface NewDeviceModalProps {
  onClose: () => void
  device?: any | null
  locationId: string
  refetchDevices: () => void
}

const DeviceModal = ({
  onClose,
  device,
  locationId,
  refetchDevices,
}: NewDeviceModalProps) => {
  const { data: productsData } = useGetProducts()
  const { data: deviceConfigurationsData } = useGetDeviceConfigurations()
  const { mutate: updateDevice } = usePutDeviceFromKey()
  const { mutate: createDevice } = useCreateDevice()
  const { data: deviceTypes } = useConfigEnums(ConfigEnum.DeviceTypes)
  const { data: deviceStatus } = useConfigEnums(ConfigEnum.DeviceStatus)
  const [cameras, setCameras] = useState<number[]>([])
  const { addNotification } = useNotificationStore()
  const { mutateAsync: getCameras } = useGetCameras()
  const [showCameraList, setShowCameraList] = useState(false)

  const products = productsData?.value
  const deviceConfigurations = deviceConfigurationsData?.value

  const [filteredConfigurations, setFilteredConfigurations] = useState<
    DeviceConfiguration[]
  >([])

  const defaultDeviceProperties = device
    ? Object.entries(device)
        .filter(([key]) => !knownDeviceKeys.has(key))
        .map(([key, value]) => ({ key, value: String(value) }))
    : []

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(deviceSchema),
    defaultValues: {
      id: device?.id ?? null,
      deviceIdentifier: device?.deviceIdentifier ?? '',
      loggingEnabled: device?.loggingEnabled ?? true,
      ipaddress: device?.ipaddress ?? '',
      deviceStatus: device?.deviceStatus ?? 'Active',
      notes: device?.notes ?? '',
      deviceType: device?.deviceType ?? '',
      deviceConfigurationId: device?.deviceConfiguration?.id ?? '',
      productId: device?.deviceConfiguration?.product?.id ?? '',
      locationId: device?.locationId ?? Number(locationId),
      deviceProperties: device?.deviceProperties ?? defaultDeviceProperties,
    },
  })

  const {
    fields: devicePropertiesFields,
    append: appendDeviceProperty,
    remove: removeDeviceProperty,
  } = useFieldArray({
    control,
    name: 'deviceProperties',
  })

  const selectedProductId = watch('productId')

  useEffect(() => {
    if (selectedProductId && deviceConfigurations) {
      const filtered = deviceConfigurations.filter(
        (config) => config.productId === Number(selectedProductId)
      )
      setFilteredConfigurations(filtered)
      const currentConfigId = getValues('deviceConfigurationId')
      if (!filtered.some((config) => config.id === Number(currentConfigId))) {
        setValue('deviceConfigurationId', '')
      }
    } else {
      setFilteredConfigurations([])
      setValue('deviceConfigurationId', '')
    }
  }, [selectedProductId, deviceConfigurations, setValue, getValues])

  const onSubmit = (data: z.infer<typeof deviceSchema>) => {
    const flattenedProps =
      data.deviceProperties?.reduce(
        (acc, { key, value }) => {
          if (key) acc[key] = value
          return acc
        },
        {} as Record<string, any>
      ) || {}

    const { id, productId, deviceProperties, ...rest } = data
    const dto = { ...rest, ...flattenedProps }

    if (data.id) {
      updateDevice(
        { data: { id, ...dto }, key: data.id },
        {
          onSuccess: () => {
            addNotification({ title: 'Device Updated', type: 'success' })
            refetchDevices()
            onClose()
          },
          onError: () =>
            addNotification({ title: 'Device Update Failed', type: 'error' }),
        }
      )
    } else {
      createDevice(dto, {
        onSuccess: () => {
          refetchDevices()
          onClose()
        },
        onError: () =>
          addNotification({ title: 'Device Creation Failed', type: 'error' }),
      })
    }
  }

  const handleFindCamerasClick = async () => {
    const cams = await getCameras({
      detectionType: device?.deviceType,
      port: device?.deviceConfiguration?.port,
      IpAddress: device?.ipaddress || '',
    })
    setCameras(cams || [])
    setShowCameraList(true)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!products || !deviceTypes || !deviceConfigurations) return null

  return (
    <Dialog open onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>{device ? 'Edit Device' : 'Add New Device'}</DialogTitle>

      <DialogContent dividers sx={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 3,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              General
            </Typography>

            <Controller
              name="productId"
              control={control}
              render={({ field }) => (
                <FormControl
                  fullWidth
                  sx={{ mb: 2 }}
                  error={!!errors.productId}
                >
                  <InputLabel>Product</InputLabel>
                  <Select {...field} label="Product">
                    {products.map((product) => (
                      <MenuItem key={product.id} value={product.id}>
                        {product.manufacturer} - {product.model}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />

            <Controller
              name="deviceConfigurationId"
              control={control}
              render={({ field }) => (
                <FormControl
                  fullWidth
                  sx={{ mb: 2 }}
                  error={!!errors.deviceConfigurationId}
                >
                  <InputLabel>
                    {selectedProductId
                      ? 'Configurations'
                      : 'Please select a product'}
                  </InputLabel>
                  <Select
                    {...field}
                    label="Configurations"
                    disabled={!selectedProductId}
                  >
                    {filteredConfigurations.map((config) => (
                      <MenuItem key={config.id} value={config.id}>
                        {config.description}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />

            <Controller
              name="deviceType"
              control={control}
              render={({ field }) => (
                <FormControl
                  fullWidth
                  sx={{ mb: 2 }}
                  error={!!errors.deviceType}
                >
                  <InputLabel>Device Type</InputLabel>
                  <Select {...field} label="Device Type">
                    {deviceTypes.map((type) => (
                      <MenuItem key={type.name} value={type.name}>
                        {type.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />

            <Controller
              name="deviceStatus"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Status</InputLabel>
                  <Select {...field} label="Status">
                    {deviceStatus?.map((status) => (
                      <MenuItem key={status.name} value={status.name}>
                        {status.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel htmlFor="ip-input">IP Address</InputLabel>
              <OutlinedInput
                id="ip-input"
                label="IP Address"
                {...register('ipaddress')}
              />
            </FormControl>

            {device?.deviceType === 'FIRCamera' && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ mb: 2 }}
                  onClick={handleFindCamerasClick}
                >
                  Find Cameras
                </Button>

                <Collapse in={showCameraList} sx={{ mb: 2 }}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Typography variant="subtitle2">Found Cameras</Typography>
                      <IconButton
                        size="small"
                        onClick={() => setShowCameraList((p) => !p)}
                      >
                        {showCameraList ? (
                          <ExpandLessIcon />
                        ) : (
                          <ExpandMoreIcon />
                        )}
                      </IconButton>
                    </Box>
                    <List dense disablePadding>
                      {Object.entries(cameras).map(([name, id]) => (
                        <ListItem
                          key={id}
                          sx={{ py: 0.5, display: 'flex', gap: 1 }}
                        >
                          <Typography
                            variant="subtitle2"
                            sx={{ fontWeight: 600 }}
                          >
                            {name}
                          </Typography>
                          <Typography
                            variant="subtitle2"
                            color="text.secondary"
                          >
                            ID: {id}
                          </Typography>
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                </Collapse>
              </>
            )}

            <TextField
              fullWidth
              multiline
              label="Device Identifier"
              sx={{ mb: 2 }}
              maxRows={6}
              {...register('deviceIdentifier')}
            />

            <TextField
              fullWidth
              multiline
              label="Notes"
              sx={{ mb: 2 }}
              maxRows={6}
              {...register('notes')}
            />

            <Controller
              name="loggingEnabled"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value} />}
                  label="Enable Logging"
                />
              )}
            />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Device Properties
            </Typography>

            {devicePropertiesFields.map((field, index) => (
              <Box
                key={field.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
              >
                <TextField
                  {...register(`deviceProperties.${index}.key`)}
                  margin="dense"
                  label={`Key ${index + 1}`}
                  fullWidth
                />
                <TextField
                  {...register(`deviceProperties.${index}.value`)}
                  margin="dense"
                  label={`Value ${index + 1}`}
                  fullWidth
                />
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => removeDeviceProperty(index)}
                  sx={{ mt: 1 }}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}

            <Button
              variant="outlined"
              size="small"
              onClick={() => appendDeviceProperty({ key: '', value: '' })}
            >
              + Device Property
            </Button>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit(onSubmit)}>
          {device ? 'Update Device' : 'Add Device'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default DeviceModal
