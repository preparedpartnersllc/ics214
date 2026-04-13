'use client'

import { useEffect, useRef } from 'react'
import type { MapMarker, MapMarkerType, EventBoundary, BoundaryZoneType } from '@/types'

// -- Types ----------------------------------------------------
export interface UserLocationPin {
  userId: string
  lat: number
  lng: number
  name: string
  isCurrentUser: boolean
  lastUpdated: string
}

export interface EventMapProps {
  // Initial centering priority: user → event → US fallback
  initialUserLat: number | null
  initialUserLng: number | null
  eventLat: number | null
  eventLng: number | null
  eventName: string

  // Data layers (pre-filtered by parent toggles)
  markers: MapMarker[]
  userLocations: UserLocationPin[]
  boundaries: EventBoundary[]

  // Draw state (controlled by parent)
  drawMode: 'none' | 'circle' | 'rectangle' | 'polygon'
  drawPoints: [number, number][]   // in-progress polygon/rectangle points

  // Auth
  isAdmin: boolean

  // Callbacks
  onMapClick?: (lat: number, lng: number) => void
  onDeleteMarker?: (id: string) => void
  onDeleteBoundary?: (id: string) => void
  onUserInteraction?: () => void   // fired when user manually drags or zooms

  // Programmatic pan — increment seq to trigger
  centerTrigger?: { lat: number; lng: number; zoom: number; seq: number } | null
}

// -- Icon helpers ---------------------------------------------
function svgDataUrl(svg: string) {
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

function circleIcon(fill: string, size = 28) {
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="${fill}" stroke="white" stroke-width="2.5" opacity="0.95"/></svg>`)
}

function eventPinIcon() {
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24s16-14 16-24C32 7.163 24.837 0 16 0z" fill="#FF5A1F" stroke="white" stroke-width="1.5"/><circle cx="16" cy="16" r="6" fill="white"/></svg>`)
}

function userDotIcon(isCurrentUser: boolean, isStale: boolean) {
  const fill = isStale ? '#6B7280' : isCurrentUser ? '#3B82F6' : '#9CA3AF'
  const ring = isCurrentUser && !isStale ? 'white' : '#3a4555'
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="${fill}" stroke="${ring}" stroke-width="2.5"/><circle cx="10" cy="10" r="3.5" fill="white" opacity="0.9"/></svg>`)
}

function crosshairIcon() {
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#6B7280" stroke-width="1.5" stroke-dasharray="3,2"/><circle cx="8" cy="8" r="2" fill="#6B7280"/></svg>`)
}

// -- Boundary colors by zone type -----------------------------
const ZONE_COLORS: Record<BoundaryZoneType, { stroke: string; fill: string; label: string }> = {
  perimeter:    { stroke: '#E5E7EB', fill: '#E5E7EB', label: 'Perimeter' },
  hazard_zone:  { stroke: '#EF4444', fill: '#EF4444', label: 'Hazard Zone' },
  staging_area: { stroke: '#22C55E', fill: '#22C55E', label: 'Staging Area' },
  search_area:  { stroke: '#3B82F6', fill: '#3B82F6', label: 'Search Area' },
}

const MARKER_COLORS: Record<MapMarkerType, string> = {
  incident: '#EF4444',
  resource: '#3B82F6',
  hazard:   '#F59E0B',
}

const MARKER_LABELS: Record<MapMarkerType, string> = {
  incident: 'Incident',
  resource: 'Resource',
  hazard:   'Hazard',
}

// -- Stale threshold: 10 minutes ------------------------------
function isStaleLocation(lastUpdated: string): boolean {
  return Date.now() - new Date(lastUpdated).getTime() > 10 * 60 * 1000
}

// -- Component ------------------------------------------------
export default function EventMap({
  initialUserLat,
  initialUserLng,
  eventLat,
  eventLng,
  eventName,
  markers,
  userLocations,
  boundaries,
  drawMode,
  drawPoints,
  isAdmin,
  onMapClick,
  onDeleteMarker,
  onDeleteBoundary,
  onUserInteraction,
  centerTrigger,
}: EventMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<any>(null)
  const markerLayerRef   = useRef<any>(null)
  // Keep refs to latest callbacks so map listeners never go stale
  const onMapClickRef = useRef(onMapClick)
  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  const onUserInteractionRef = useRef(onUserInteraction)
  useEffect(() => { onUserInteractionRef.current = onUserInteraction }, [onUserInteraction])
  const userLayerRef     = useRef<any>(null)
  const boundaryLayerRef = useRef<any>(null)
  const drawPreviewRef   = useRef<any>(null)

  // -- Init map once -----------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let map: any
    let dead = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (dead || !containerRef.current) return

      // Priority: user location → event location → US center
      const center: [number, number] =
        initialUserLat != null && initialUserLng != null ? [initialUserLat, initialUserLng] :
        eventLat != null && eventLng != null             ? [eventLat, eventLng] :
                                                           [39.5, -98.35]
      const zoom = initialUserLat != null ? 15 : eventLat != null ? 13 : 4

      map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: false,
      })

      // Zoom control — bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map)

      // Tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // Event pin
      if (eventLat != null && eventLng != null) {
        const icon = L.icon({ iconUrl: eventPinIcon(), iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -44] })
        L.marker([eventLat, eventLng], { icon })
          .addTo(map)
          .bindPopup(`<div style="font-weight:600;color:#FF5A1F;margin-bottom:2px">Event Location</div><div style="color:#E5E7EB">${eventName}</div>`)
      }

      // Named layers
      markerLayerRef.current   = L.layerGroup().addTo(map)
      userLayerRef.current     = L.layerGroup().addTo(map)
      boundaryLayerRef.current = L.layerGroup().addTo(map)
      drawPreviewRef.current   = L.layerGroup().addTo(map)

      // Map click — always calls the latest callbacks via refs (avoids stale closures)
      map.on('click', (e: any) => onMapClickRef.current?.(e.latlng.lat, e.latlng.lng))
      map.on('dragstart', () => onUserInteractionRef.current?.())
      map.on('zoomstart', () => onUserInteractionRef.current?.())

      mapRef.current = map
    })()

    return () => {
      dead = true
      if (map) { map.remove(); mapRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -- Update cursor for draw mode ---------------------------
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.style.cursor = drawMode !== 'none' ? 'crosshair' : ''
  }, [drawMode])

  // -- Incident/resource/hazard markers ---------------------
  useEffect(() => {
    if (!markerLayerRef.current) return
    ;(async () => {
      const L = (await import('leaflet')).default
      markerLayerRef.current.clearLayers()
      for (const m of markers) {
        const color = MARKER_COLORS[m.type]
        const icon  = L.icon({ iconUrl: circleIcon(color), iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16] })
        const del   = isAdmin && onDeleteMarker
          ? `<button onclick="window.__mapDel('${m.id}')" style="margin-top:8px;font-size:11px;color:#EF4444;background:none;border:none;cursor:pointer;padding:0">Remove</button>`
          : ''
        const popup = `<div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${color};margin-bottom:2px">${MARKER_LABELS[m.type]}</div>
          <div style="font-weight:600;font-size:13px;color:#E5E7EB">${m.title}</div>
          ${m.description ? `<div style="margin-top:4px;color:#9CA3AF;font-size:12px">${m.description}</div>` : ''}
          ${del}
        </div>`
        L.marker([m.lat, m.lng], { icon }).addTo(markerLayerRef.current).bindPopup(popup)
      }
    })()
  }, [markers, isAdmin, onDeleteMarker])

  // -- User location dots ------------------------------------
  useEffect(() => {
    if (!userLayerRef.current) return
    ;(async () => {
      const L = (await import('leaflet')).default
      userLayerRef.current.clearLayers()
      for (const u of userLocations) {
        const stale = isStaleLocation(u.lastUpdated)
        const icon  = L.icon({ iconUrl: userDotIcon(u.isCurrentUser, stale), iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12] })
        const label = u.isCurrentUser ? '<strong style="color:#3B82F6">You</strong>' : `<span style="color:#E5E7EB">${u.name}</span>`
        const staleNote = stale ? `<div style="font-size:10px;color:#6B7280;margin-top:2px">Location may be outdated</div>` : ''
        L.marker([u.lat, u.lng], { icon }).addTo(userLayerRef.current).bindPopup(`<div>${label}${staleNote}</div>`)
      }
    })()
  }, [userLocations])

  // -- Boundary shapes ---------------------------------------
  useEffect(() => {
    if (!boundaryLayerRef.current) return
    ;(async () => {
      const L = (await import('leaflet')).default
      boundaryLayerRef.current.clearLayers()

      for (const b of boundaries) {
        const zc   = ZONE_COLORS[b.zone_type] ?? ZONE_COLORS.perimeter
        const opts = { color: zc.stroke, fillColor: zc.fill, fillOpacity: 0.1, weight: 2, opacity: 0.85 }
        const del  = isAdmin && onDeleteBoundary
          ? `<button onclick="window.__mapDelBoundary('${b.id}')" style="margin-top:8px;font-size:11px;color:#EF4444;background:none;border:none;cursor:pointer;padding:0">Remove</button>`
          : ''
        const popup = `<div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${zc.stroke};margin-bottom:2px">${zc.label}</div>
          <div style="font-weight:600;font-size:13px;color:#E5E7EB">${b.title}</div>
          ${b.description ? `<div style="margin-top:4px;color:#9CA3AF;font-size:12px">${b.description}</div>` : ''}
          ${del}
        </div>`

        let shape: any = null
        if (b.shape === 'circle') {
          const g = b.geometry as { center: [number, number]; radiusMeters: number }
          shape = L.circle(g.center, { ...opts, radius: g.radiusMeters })
        } else if (b.shape === 'rectangle') {
          const g = b.geometry as { bounds: [[number, number], [number, number]] }
          shape = L.rectangle(g.bounds, opts)
        } else if (b.shape === 'polygon') {
          const g = b.geometry as { points: [number, number][] }
          shape = L.polygon(g.points, opts)
        }
        if (shape) shape.addTo(boundaryLayerRef.current).bindPopup(popup)
      }
    })()
  }, [boundaries, isAdmin, onDeleteBoundary])

  // -- Draw preview (polygon dots / rectangle first corner) --
  useEffect(() => {
    if (!drawPreviewRef.current) return
    ;(async () => {
      const L = (await import('leaflet')).default
      drawPreviewRef.current.clearLayers()
      if (drawPoints.length === 0) return

      const icon = L.icon({ iconUrl: crosshairIcon(), iconSize: [16, 16], iconAnchor: [8, 8] })

      if (drawMode === 'polygon' && drawPoints.length >= 2) {
        // Draw connecting lines + dots
        L.polyline(drawPoints, { color: '#9CA3AF', weight: 1.5, dashArray: '4,4', opacity: 0.7 }).addTo(drawPreviewRef.current)
      }
      for (const pt of drawPoints) {
        L.marker(pt, { icon, interactive: false }).addTo(drawPreviewRef.current)
      }
    })()
  }, [drawPoints, drawMode])

  // -- Global delete callbacks for popup buttons -------------
  useEffect(() => {
    ;(window as any).__mapDel = (id: string) => { onDeleteMarker?.(id); mapRef.current?.closePopup() }
    ;(window as any).__mapDelBoundary = (id: string) => { onDeleteBoundary?.(id); mapRef.current?.closePopup() }
    return () => { delete (window as any).__mapDel; delete (window as any).__mapDelBoundary }
  }, [onDeleteMarker, onDeleteBoundary])

  // -- Programmatic pan --------------------------------------
  useEffect(() => {
    if (centerTrigger && mapRef.current) {
      mapRef.current.setView([centerTrigger.lat, centerTrigger.lng], centerTrigger.zoom, { animate: true })
    }
  }, [centerTrigger])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
