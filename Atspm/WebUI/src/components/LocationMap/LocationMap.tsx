import { useGetMapLayer } from '@/api/config/aTSPMConfigurationApi'
import Markers from '@/components/LocationMap/Markers'
import MapFilters from '@/components/MapFilters'
import { Location } from '@/features/locations/types'
import { ServiceType } from '@/features/mapLayers/types'
import { getEnv } from '@/utils/getEnv'
import ClearIcon from '@mui/icons-material/Clear'
import LayersIcon from '@mui/icons-material/Layers'
import {
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  ClickAwayListener,
  FormControlLabel,
  Popper,
  Skeleton,
  useTheme,
} from '@mui/material'
import { DynamicMapLayer, FeatureLayer } from 'esri-leaflet'
import 'esri-leaflet-renderers'
import L, { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, Polyline, TileLayer } from 'react-leaflet'

interface Filters {
  areaId?: number | null
  regionId?: number | null
  locationTypeId?: number | null
  jurisdictionId?: number | null
  measureTypeId?: number | null
}

interface LocationMapProps {
  location: Location | null
  setLocation: (location: Location) => void
  locations: Location[]
  filteredLocations: Location[]
  route?: number[][]
  center?: [number, number]
  zoom?: number
  mapHeight?: number | string
  filters: Filters
  updateFilters: (filters: Partial<Filters>) => void
}

const LocationMap = ({
  location,
  setLocation,
  locations,
  filteredLocations,
  route,
  center,
  zoom,
  mapHeight,
  filters,
  updateFilters,
}: LocationMapProps) => {
  const theme = useTheme()
  const [mapRef, setMapRef] = useState<LeafletMap | null>(null)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [hasFocusedRoute, setHasFocusedRoute] = useState(false)
  const filtersButtonRef = useRef(null)

  const [isLayersPopperOpen, setIsLayersPopperOpen] = useState(false)
  const layersButtonRef = useRef(null)

  const { data: mapLayersData } = useGetMapLayer()
  const [activeLayers, setActiveLayers] = useState<number[]>([])
  const layerRefreshers = useRef<{ [key: number]: number | null }>({})

  const [mapInfo, setMapInfo] = useState<{
    tile_layer: string
    attribution: string
    initialLat: number
    initialLong: number
  } | null>(null)

  useEffect(() => {
    if (mapLayersData?.value) {
      setActiveLayers(
        mapLayersData.value
          .filter((layer) => layer.showByDefault)
          .map((layer) => layer.id)
      )
    }
  }, [mapLayersData])

  useEffect(() => {
    if (!mapRef) return

    mapRef.eachLayer((layer) => {
      if (layer instanceof FeatureLayer || layer instanceof DynamicMapLayer) {
        // detach Leaflet's internal error handler so it never fires on a removed layer
        ;(layer as any).off('error', (layer as any)._overlayError)
        mapRef.removeLayer(layer)
      }
    })
    Object.values(layerRefreshers.current).forEach(
      (refreshId) => refreshId !== null && clearInterval(refreshId)
    )
    layerRefreshers.current = {}

    mapLayersData?.value?.forEach((layer) => {
      if (activeLayers.includes(layer.id)) {
        let newLayer
        if (layer.serviceType === ServiceType.MapServer) {
          newLayer = new DynamicMapLayer({
            url: layer.mapLayerUrl,
            opacity: 1,
          })
        } else {
          newLayer = new FeatureLayer({
            url: layer.mapLayerUrl,
            useCors: false,
          })
        }
        if (!newLayer) return

        newLayer?.addTo(mapRef)

        if (layer.refreshIntervalSeconds) {
          const refreshId = setInterval(() => {
            if (newLayer instanceof FeatureLayer && newLayer.refresh) {
              newLayer?.refresh()
            } else if (newLayer instanceof DynamicMapLayer && newLayer.redraw) {
              newLayer?.redraw()
            } else {
              setTimeout(() => {
                mapRef?.removeLayer(newLayer)
                newLayer?.addTo(mapRef)
              }, 50)
            }
          }, layer.refreshIntervalSeconds * 1000)

          layerRefreshers.current[layer.id] = refreshId
        }
      }
    })
  }, [mapRef, activeLayers, mapLayersData])

  const handleLayerToggle = (layerId: number) => {
    setActiveLayers((prev) =>
      prev.includes(layerId)
        ? prev.filter((id) => id !== layerId)
        : [...prev, layerId]
    )
  }

  const locationsEnabledLength = locations.filter((l) => l.chartEnabled).length

  useEffect(() => {
    const fetchEnv = async () => {
      const env = await getEnv()
      setMapInfo({
        tile_layer: env.MAP_TILE_LAYER,
        attribution: env.MAP_TILE_ATTRIBUTION,
        initialLat: parseFloat(env.MAP_DEFAULT_LATITUDE),
        initialLong: parseFloat(env.MAP_DEFAULT_LONGITUDE),
      })
    }
    fetchEnv()
  }, [])

  useEffect(() => {
    if (location && mapRef) {
      const markerLocation = locations.find((loc) => loc.id === location.id)
      if (markerLocation) {
        const { latitude, longitude } = markerLocation
        mapRef.setView([latitude, longitude], 16)
      }
    }
  }, [location, mapRef, locations])

  useEffect(() => {
    if (location && mapRef) {
      const markerLocation = locations.find((loc) => loc.id === location.id)
      if (markerLocation) {
        const { latitude, longitude } = markerLocation
        mapRef.setView([latitude, longitude], 16)
      }
    } else if (route && mapRef && !hasFocusedRoute) {
      const bounds = L.latLngBounds(route.map((coord) => [coord[0], coord[1]]))

      if (bounds.isValid()) {
        mapRef.fitBounds(bounds)
        setHasFocusedRoute(true)
      }
    }
  }, [location, mapRef, locations, route, hasFocusedRoute])

  // Resize the map when the container resizes
  useEffect(() => {
    if (!mapRef) return

    const mapContainer = mapRef.getContainer()

    const handleResize = () => {
      mapRef.invalidateSize()
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(mapContainer)

    return () => {
      resizeObserver.disconnect()
    }
  }, [mapRef])

  useEffect(() => {
    if (
      mapRef &&
      filteredLocations.length > 0 &&
      filteredLocations.length < locationsEnabledLength
    ) {
      const bounds = L.latLngBounds(
        filteredLocations
          .filter(
            (loc) =>
              loc.latitude >= -90 &&
              loc.latitude <= 90 &&
              loc.longitude >= -180 &&
              loc.longitude <= 180
          )
          .map((loc) => [loc.latitude, loc.longitude])
      )

      if (bounds.isValid()) {
        mapRef.fitBounds(bounds)
      }
    }
  }, [mapRef, filteredLocations, locations, locationsEnabledLength])

  const handleFiltersClick = useCallback(() => {
    setIsFiltersOpen((prev) => !prev)
  }, [])

  const handleFiltersClearClick = useCallback(() => {
    updateFilters({
      areaId: null,
      regionId: null,
      locationTypeId: null,
      jurisdictionId: null,
      measureTypeId: null,
    })
    if (mapInfo?.initialLat && mapInfo?.initialLong) {
      mapRef?.setView([mapInfo.initialLat, mapInfo.initialLong], 6)
    }
  }, [updateFilters, mapInfo, mapRef])

  const handleClosePopper = useCallback(() => {
    setIsFiltersOpen(false)
  }, [])

  if (!mapInfo) {
    return <Skeleton variant="rectangular" height={mapHeight ?? 400} />
  }

  return (
    <MapContainer
      center={center || [mapInfo.initialLat, mapInfo.initialLong]}
      zoom={zoom || 6}
      scrollWheelZoom={true}
      style={{
        height: mapHeight || 'calc(100% - 80px)',
        minHeight: mapHeight || '400px',
        width: '100%',
      }}
      ref={setMapRef}
    >
      <ClickAwayListener onClickAway={handleClosePopper}>
        <Box>
          <ButtonGroup
            variant="contained"
            size="small"
            disableElevation
            sx={{
              position: 'absolute',
              right: '10px',
              top: '10px',
              zIndex: 1000,
            }}
          >
            <Button variant="contained" onClick={handleFiltersClick}>
              Filters
            </Button>
            <Button
              ref={filtersButtonRef}
              variant="contained"
              size="small"
              aria-label="Clear filters"
              onClick={handleFiltersClearClick}
              disabled={!Object.values(filters).some((value) => value != null)}
              sx={{
                '&:disabled': { backgroundColor: theme.palette.grey[300] },
              }}
            >
              <ClearIcon fontSize="small" sx={{ p: 0 }} />
            </Button>
          </ButtonGroup>
          <Popper
            open={isFiltersOpen}
            anchorEl={filtersButtonRef.current}
            placement="bottom-end"
            style={{ zIndex: 1000 }}
          >
            <MapFilters
              filters={filters}
              onFilterChange={updateFilters}
              locationsTotal={locationsEnabledLength}
              locationsFiltered={filteredLocations.length}
            />
          </Popper>
        </Box>
      </ClickAwayListener>

      <ButtonGroup
        variant="contained"
        size="small"
        disableElevation
        sx={{
          position: 'absolute',
          left: '10px',
          bottom: '20px',
          zIndex: 1000,
        }}
      >
        <Button
          ref={layersButtonRef}
          variant="contained"
          onClick={() => setIsLayersPopperOpen(!isLayersPopperOpen)}
        >
          <LayersIcon fontSize="small" />
        </Button>
      </ButtonGroup>

      <Popper
        open={isLayersPopperOpen}
        anchorEl={layersButtonRef.current}
        placement="top-start"
        style={{ zIndex: 1000 }}
      >
        <ClickAwayListener onClickAway={() => setIsLayersPopperOpen(false)}>
          <Box
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 1,
              boxShadow: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {mapLayersData?.value?.map((layer) => (
              <FormControlLabel
                key={layer.id}
                control={
                  <Checkbox
                    checked={activeLayers.includes(layer.id)}
                    onChange={() => handleLayerToggle(layer.id)}
                    size="small"
                  />
                }
                label={layer.name}
              />
            ))}
          </Box>
        </ClickAwayListener>
      </Popper>

      <TileLayer attribution={mapInfo.attribution} url={mapInfo.tile_layer} />
      <Markers locations={filteredLocations} setLocation={setLocation} />
      {route && route.length > 0 && (
        <Polyline
          positions={route.map((coord) => [coord[0], coord[1]])}
          weight={5}
        />
      )}
    </MapContainer>
  )
}

export default memo(LocationMap)
