import { useGetMapLayer } from '@/api/config/aTSPMConfigurationApi'
import { MapLayer } from '@/api/config/aTSPMConfigurationApi.schemas'
import MapLayersLegends from '@/components/LocationMap/MapLayersLegends'
import MapLayersList from '@/components/LocationMap/MapLayersList'
import Markers from '@/components/LocationMap/Markers'
import MapFilters from '@/components/MapFilters'
import { Location } from '@/features/locations/types'
import { ServiceType } from '@/features/mapLayers/types'
import { getEnv } from '@/utils/getEnv'
import ClearIcon from '@mui/icons-material/Clear'
import {
  Button,
  ButtonGroup,
  ClickAwayListener,
  Popper,
  Skeleton,
  useTheme,
} from '@mui/material'
import { DynamicMapLayer, FeatureLayer } from 'esri-leaflet'
import 'esri-leaflet-renderers'
import L, { Layer as LeafletLayer, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

  const { data: mapLayersData } = useGetMapLayer()

  const mapLayers = useMemo(
    () => (mapLayersData?.value as MapLayer[]) || [],
    [mapLayersData]
  )

  const [activeLayers, setActiveLayers] = useState<number[]>([])
  const layerRefreshers = useRef<{ [key: number]: number | null }>({})
  const createdLayers = useRef<{ [key: number]: LeafletLayer | null }>({})

  const [mapInfo, setMapInfo] = useState<{
    tile_layer: string
    attribution: string
    initialLat: number
    initialLong: number
  } | null>(null)

  /* Activate default layers from payload */
  useEffect(() => {
    if (mapLayers.length) {
      setActiveLayers(
        mapLayers
          .filter((layer) => layer.showByDefault)
          .map((layer) => layer.id)
      )
    }
  }, [mapLayers])

  /* Clear all dynamic layers helper */
  const clearAllDynamicLayers = useCallback(() => {
    if (!mapRef) return
    // Remove any previously created layers we track
    Object.entries(createdLayers.current).forEach(([id, lyr]) => {
      if (lyr && mapRef.hasLayer(lyr)) mapRef.removeLayer(lyr)
      createdLayers.current[+id] = null
    })
    // Also clear any intervals
    Object.values(layerRefreshers.current).forEach((refreshId) => {
      if (refreshId !== null) clearInterval(refreshId)
    })
    layerRefreshers.current = {}
  }, [mapRef])

  /* Create one layer by definition */
  const createLayer = useCallback(
    async (layerDef): Promise<LeafletLayer | null> => {
      if (!mapRef) return null
      const { serviceType, mapLayerUrl, resourceId, style } = layerDef

      // ArcGIS MapServer (dynamic map)
      if (serviceType === ServiceType.MapServer) {
        const lyr = new DynamicMapLayer({ url: mapLayerUrl, opacity: 1 })
        lyr.addTo(mapRef)
        return lyr as unknown as LeafletLayer
      }

      // ArcGIS FeatureServer (feature layer)
      if (serviceType === ServiceType.FeatureServer) {
        const url = /\/FeatureServer\/\d+$/.test(mapLayerUrl)
          ? mapLayerUrl
          : mapLayerUrl.replace(/\/?$/, '/') + (resourceId ?? '0')
        const lyr = new FeatureLayer({ url })
        lyr.addTo(mapRef)
        return lyr as unknown as LeafletLayer
      }

      if (serviceType === ServiceType.WMS || serviceType === ServiceType.WFS) {
        const wms = L.tileLayer.wms(mapLayerUrl, {
          layers: resourceId,
          styles: style || '',
          format: 'image/png',
          transparent: true,
        })
        wms.addTo(mapRef)
        return wms
      }

      return null
    },
    [mapRef]
  )

  /* Rebuild active layers whenever toggled or data changes */
  useEffect(() => {
    if (!mapRef) return
    clearAllDynamicLayers()

    const defs = mapLayers ?? []
    defs.forEach(async (layer) => {
      if (!activeLayers.includes(layer.id)) return

      const lyr = await createLayer(layer)
      createdLayers.current[layer.id] = lyr

      // Set up refresh if configured
      if (layer.refreshIntervalSeconds && layer.refreshIntervalSeconds > 0) {
        const refreshId = window.setInterval(async () => {
          const existing = createdLayers.current[layer.id]
          if (existing && mapRef.hasLayer(existing)) {
            mapRef.removeLayer(existing)
          }
          const newOne = await createLayer(layer)
          createdLayers.current[layer.id] = newOne
        }, layer.refreshIntervalSeconds * 1000)
        layerRefreshers.current[layer.id] = refreshId
      }
    })

    return () => clearAllDynamicLayers()
  }, [mapRef, activeLayers, clearAllDynamicLayers, createLayer, mapLayers])

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
      if (!env) return
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

  useEffect(() => {
    if (!mapRef) return
    const mapContainer = mapRef.getContainer()
    const handleResize = () => mapRef.invalidateSize()
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(mapContainer)
    return () => resizeObserver.disconnect()
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
      if (bounds.isValid()) mapRef.fitBounds(bounds)
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

  const handleClosePopper = useCallback(() => setIsFiltersOpen(false), [])

  if (!mapInfo) {
    return <Skeleton variant="rectangular" height={mapHeight ?? 400} />
  }

  return (
    <MapContainer
      center={center || [mapInfo.initialLat, mapInfo.initialLong]}
      zoom={zoom || 11}
      scrollWheelZoom
      style={{
        height: mapHeight || 'calc(100% - 80px)',
        minHeight: mapHeight || '400px',
        width: '100%',
      }}
      ref={setMapRef}
    >
      <ClickAwayListener onClickAway={handleClosePopper}>
        <>
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
              disabled={!Object.values(filters).some((v) => v != null)}
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
        </>
      </ClickAwayListener>

      <MapLayersList
        mapLayers={mapLayers}
        activeLayers={activeLayers}
        handleLayerToggle={handleLayerToggle}
      />

      <MapLayersLegends
        activeMapLayers={mapLayers?.filter((layer) =>
          activeLayers.includes(layer.id)
        )}
      />

      <TileLayer attribution={mapInfo.attribution} url={mapInfo.tile_layer} />
      <Markers locations={filteredLocations} setLocation={setLocation} />
      {route && route.length > 0 && (
        <Polyline positions={route.map((c) => [c[0], c[1]])} weight={5} />
      )}
    </MapContainer>
  )
}

export default memo(LocationMap)
