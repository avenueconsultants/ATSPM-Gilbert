import { ServiceType } from '@/features/mapLayers/types'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Box, Collapse, IconButton, Typography } from '@mui/material'
import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'

type LegendEntry = { title?: string; imgUrl: string; label?: string }

function wmsLegendUrl(
  base: string,
  layerName: string,
  style?: string,
  version = '1.3.0'
) {
  // Many GeoServer installs also accept /ows for GetLegendGraphic
  // If your server insists on /{workspace}/wms, derive workspace from "workspace:layer"
  const u = new URL(base)
  u.searchParams.set('service', 'WMS')
  u.searchParams.set('version', version)
  u.searchParams.set('request', 'GetLegendGraphic')
  u.searchParams.set('format', 'image/png')
  u.searchParams.set('layer', layerName)
  if (style) u.searchParams.set('style', style)
  return u.toString()
}

// Optional: try to compute workspace-specific wms endpoint if you prefer that path
function guessWorkspaceWmsEndpoint(base: string, resourceId?: string) {
  if (!resourceId || !resourceId.includes(':')) return base
  const [workspace] = resourceId.split(':')
  try {
    const url = new URL(base)
    const parts = url.pathname.replace(/\/+$/, '').split('/')
    // replace trailing /ows with /{workspace}/wms
    parts[parts.length - 1] = `${workspace}/wms`
    url.pathname = parts.join('/')
    return url.toString()
  } catch {
    return base
  }
}

async function fetchArcgisLegend(serviceUrl: string): Promise<LegendEntry[]> {
  // Works for MapServer services and FeatureServer layer endpoints (…/FeatureServer/{id})
  const url = serviceUrl.replace(/\/+$/, '') + '/legend?f=pjson'
  const res = await fetch(url) // if CORS blocks, route via your proxy
  if (!res.ok) throw new Error(`Legend ${res.status}`)
  const j = await res.json()
  // ArcGIS returns: { layers: [ { layerName, layerId, legend: [ {label, imageData, contentType} ] } ] }
  const out: LegendEntry[] = []
  const layers = Array.isArray(j.layers) ? j.layers : []
  layers.forEach((ly: any) => {
    const layerTitle = ly.layerName
    ;(ly.legend || []).forEach((it: any) => {
      const mime = it.contentType || 'image/png'
      if (it.imageData) {
        out.push({
          title: layerTitle,
          label: it.label,
          imgUrl: `data:${mime};base64,${it.imageData}`,
        })
      }
    })
  })
  return out
}

export const MapLayersLegends = ({ activeMapLayers }) => {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!rootRef.current) return
    // Block clicks, dblclicks, contextmenu, etc.
    L.DomEvent.disableClickPropagation(rootRef.current)
    // Block wheel/trackpad scroll from zooming the map
    L.DomEvent.disableScrollPropagation(rootRef.current)
  }, [])

  const [legends, setLegends] = useState<Record<number, LegendEntry[]>>({})
  const [isMinimized, setIsMinimized] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function buildLegends() {
      const newLegends: Record<number, LegendEntry[]> = {}

      for (const layer of activeMapLayers) {
        if (
          layer.serviceType === ServiceType.MapServer ||
          layer.serviceType === ServiceType.FeatureServer
        ) {
          try {
            const entries = await fetchArcgisLegend(
              // For FeatureServer ensure it's a layer endpoint (…/FeatureServer/0).
              layer.serviceType === ServiceType.FeatureServer
                ? /\/FeatureServer\/\d+$/.test(layer.mapLayerUrl)
                  ? layer.mapLayerUrl
                  : layer.mapLayerUrl.replace(/\/?$/, '/') +
                    (layer.resourceId ?? '0')
                : layer.mapLayerUrl
            )
            if (!cancelled) newLegends[layer.id] = entries
          } catch {
            // ignore legend fetch errors
          }
        }

        if (layer.serviceType === 'WMS') {
          const base = guessWorkspaceWmsEndpoint(
            layer.mapLayerUrl,
            layer.resourceId
          )
          const url = wmsLegendUrl(base, layer.resourceId, layer.style)
          newLegends[layer.id] = [{ imgUrl: url }]
        }

        // If you ever want a WMS fallback for "WFS", you could also attach the WMS legend here
      }

      if (!cancelled) setLegends(newLegends)
    }
    buildLegends()
    return () => {
      cancelled = true
    }
  }, [activeMapLayers])

  if (Object.entries(activeMapLayers).length === 0) return null

  return (
    <Box
      ref={rootRef}
      sx={{
        position: 'absolute',
        right: 10,
        bottom: 20,
        zIndex: 1000,
        maxWidth: 320,
        bgcolor: 'background.paper',
        borderRadius: 1,
        boxShadow: 3,
        width: '200px',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 0.25,
          pl: 1,
        }}
      >
        <Typography variant="h6">Legend</Typography>
        <IconButton
          onClick={() => setIsMinimized((prev) => !prev)}
          size="small"
          aria-label="minimize"
        >
          {isMinimized ? (
            <ExpandMoreIcon fontSize="small" />
          ) : (
            <ExpandLessIcon fontSize="small" />
          )}
        </IconButton>
      </Box>
      <Collapse in={!isMinimized} timeout={'auto'} unmountOnExit>
        <Box sx={{ maxHeight: '200px', overflowY: 'auto', pl: 1 }}>
          {!isMinimized &&
            activeMapLayers.map((ly: any) => (
              <Box key={ly.id} sx={{ mb: 1.5 }}>
                <Box sx={{ fontWeight: 600, fontSize: 13, mb: 0.5 }}>
                  {ly.name}
                </Box>
                {(legends[ly.id] ?? []).map((e, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mb: 0.5,
                    }}
                  >
                    <img
                      src={e.imgUrl}
                      alt={e.label || e.title || 'legend'}
                      width={24}
                      height={24}
                    />
                    <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                      {e.label || e.title || ''}
                    </Box>
                  </Box>
                ))}
              </Box>
            ))}
        </Box>
      </Collapse>
    </Box>
  )
}

export default MapLayersLegends
