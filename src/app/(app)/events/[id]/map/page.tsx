'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isAdminRole } from '@/lib/roles'
import type { MapMarker, MapMarkerType, EventBoundary, BoundaryShape, BoundaryZoneType } from '@/types'
import type { UserLocationPin } from '@/components/EventMap'

const EventMap = dynamic(() => import('@/components/EventMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#161D26]">
      <p className="text-[#6B7280] text-sm">Loading map…</p>
    </div>
  ),
})

// -- Geocode via Nominatim ------------------------------------
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } })
    const data = await res.json()
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { /* ignore */ }
  return null
}

// -- Zone display config --------------------------------------
const ZONE_OPTIONS: { value: BoundaryZoneType; label: string; color: string }[] = [
  { value: 'perimeter',    label: 'Perimeter',    color: '#E5E7EB' },
  { value: 'hazard_zone',  label: 'Hazard Zone',  color: '#EF4444' },
  { value: 'staging_area', label: 'Staging Area', color: '#22C55E' },
  { value: 'search_area',  label: 'Search Area',  color: '#3B82F6' },
]

const MARKER_OPTS: { value: MapMarkerType; label: string; color: string }[] = [
  { value: 'incident', label: 'Incident', color: '#EF4444' },
  { value: 'resource', label: 'Resource', color: '#3B82F6' },
  { value: 'hazard',   label: 'Hazard',   color: '#F59E0B' },
]

const MARKER_COLORS: Record<MapMarkerType, string> = {
  incident: '#EF4444',
  resource: '#3B82F6',
  hazard:   '#F59E0B',
}

type DrawMode = 'none' | 'circle' | 'rectangle' | 'polygon'
type ActiveMode = 'marker' | DrawMode

// -- Page -----------------------------------------------------
export default function MapPage() {
  const params   = useParams()
  const router   = useRouter()
  const id       = params.id as string

  // -- Core state -------------------------------------------
  const [event, setEvent]             = useState<any>(null)
  const [profile, setProfile]         = useState<any>(null)
  const [markers, setMarkers]         = useState<MapMarker[]>([])
  const [boundaries, setBoundaries]   = useState<EventBoundary[]>([])
  const [userLocations, setUserLocations] = useState<UserLocationPin[]>([])
  const [eventCoords, setEventCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [userCoords, setUserCoords]   = useState<{ lat: number; lng: number } | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // -- Visibility toggles -----------------------------------
  const [showMarkers,    setShowMarkers]    = useState(true)
  const [showPeople,     setShowPeople]     = useState(true)
  const [showBoundaries, setShowBoundaries] = useState(true)

  // -- Location sharing -------------------------------------
  const [sharingLocation, setSharingLocation] = useState(false)
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // -- Follow-me mode ---------------------------------------
  // followModeRef drives callbacks (avoids stale closures in intervals)
  // followMode drives the UI (button highlight, banner)
  const [followMode, setFollowMode] = useState(false)
  const followModeRef = useRef(false)
  function setFollow(val: boolean) {
    followModeRef.current = val
    setFollowMode(val)
  }

  // -- Draw mode --------------------------------------------
  const [activeMode, setActiveMode]   = useState<ActiveMode>('marker')
  const [drawPoints, setDrawPoints]   = useState<[number, number][]>([])

  // -- Marker modal -----------------------------------------
  const [pendingMarkerCoords, setPendingMarkerCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [markerType,   setMarkerType]   = useState<MapMarkerType>('incident')
  const [markerTitle,  setMarkerTitle]  = useState('')
  const [markerDesc,   setMarkerDesc]   = useState('')
  const [markerSaving, setMarkerSaving] = useState(false)
  const [markerError,  setMarkerError]  = useState<string | null>(null)

  // -- Boundary modal ---------------------------------------
  const [pendingBoundary, setPendingBoundary] = useState<{
    shape: BoundaryShape
    center?: [number, number]
    points?: [number, number][]
  } | null>(null)
  const [bTitle,        setBTitle]        = useState('')
  const [bDesc,         setBDesc]         = useState('')
  const [bZoneType,     setBZoneType]     = useState<BoundaryZoneType>('perimeter')
  const [bRadiusMeters, setBRadiusMeters] = useState('200')
  const [bSaving,       setBSaving]       = useState(false)
  const [bError,        setBError]        = useState<string | null>(null)

  // -- Programmatic pan -------------------------------------
  const [centerTrigger, setCenterTrigger] = useState<{ lat: number; lng: number; zoom: number; seq: number } | null>(null)

  // -- Search -----------------------------------------------
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen,  setSearchOpen]  = useState(false)

  const isAdmin = isAdminRole(profile?.role)

  // -- Derived: search results ------------------------------
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    const results: Array<{ id: string; label: string; sublabel: string; lat: number; lng: number; color: string }> = []

    for (const u of userLocations) {
      if (u.name.toLowerCase().includes(q)) {
        results.push({ id: `u-${u.userId}`, label: u.name, sublabel: 'Person', lat: u.lat, lng: u.lng, color: '#3B82F6' })
      }
    }
    for (const m of markers) {
      if (m.title.toLowerCase().includes(q) || m.type.includes(q)) {
        results.push({ id: `m-${m.id}`, label: m.title, sublabel: m.type, lat: m.lat, lng: m.lng, color: MARKER_COLORS[m.type] })
      }
    }
    return results.slice(0, 8)
  }, [searchQuery, userLocations, markers])

  // -- Load all data ----------------------------------------
  useEffect(() => {
    load()
    return () => { locationIntervalRef.current && clearInterval(locationIntervalRef.current) }
  }, [id])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCurrentUserId(user.id)

    const [{ data: p }, { data: e }, { data: mData }, { data: bData }, { data: locData }] =
      await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('events').select('*').eq('id', id).single(),
        supabase.from('event_markers').select('*').eq('event_id', id).order('created_at'),
        supabase.from('event_boundaries').select('*').eq('event_id', id).order('created_at'),
        supabase.from('event_user_locations').select('*').eq('event_id', id),
      ])

    setProfile(p)
    setEvent(e)
    setMarkers(mData ?? [])
    setBoundaries(bData ?? [])

    // Geocode event location
    if (e?.location) {
      const coords = await geocode(e.location)
      if (coords) setEventCoords(coords)
    }

    // Build user pins from DB (other users currently sharing)
    if (locData && locData.length > 0) {
      const uids = locData.map((l: any) => l.user_id)
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', uids)
      const pMap = (profs ?? []).reduce((acc: any, pr: any) => { acc[pr.id] = pr.full_name; return acc }, {})
      setUserLocations(locData.map((l: any) => ({
        userId: l.user_id,
        lat: l.lat,
        lng: l.lng,
        name: pMap[l.user_id] ?? 'Unknown',
        isCurrentUser: l.user_id === user.id,
        lastUpdated: l.last_updated,
      })))
    }

    // Auto-start location sharing if the user previously granted it
    const pref = typeof window !== 'undefined' ? localStorage.getItem('ics214_loc_pref') : null
    if (pref === 'granted') {
      requestUserLocation(user.id, p?.full_name ?? 'Me')
    }
  }

  // -- Location sharing -------------------------------------
  // name is passed in explicitly to avoid stale state closures in callbacks
  function requestUserLocation(uid: string, name: string) {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setSharingLocation(true)
        setUserCoords({ lat, lng })
        setFollow(true)
        await upsertLocation(uid, lat, lng, name)
        setCenterTrigger({ lat, lng, zoom: 15, seq: Date.now() })

        // Refresh every 20 seconds
        locationIntervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            async (p) => {
              const { latitude: la, longitude: lo } = p.coords
              setUserCoords({ lat: la, lng: lo })
              await upsertLocation(uid, la, lo, name)
              // Pan only if still in follow mode
              if (followModeRef.current) {
                setCenterTrigger({ lat: la, lng: lo, zoom: 15, seq: Date.now() })
              }
            },
            () => { /* silently ignore mid-session failures */ }
          )
        }, 20_000)
      },
      () => { /* permission denied — continue gracefully */ }
    )
  }

  async function upsertLocation(uid: string, lat: number, lng: number, name: string) {
    const supabase = createClient()
    await supabase.from('event_user_locations').upsert(
      { event_id: id, user_id: uid, lat, lng, last_updated: new Date().toISOString() },
      { onConflict: 'event_id,user_id' }
    )
    setUserLocations(prev => {
      const updated: UserLocationPin = { userId: uid, lat, lng, name, isCurrentUser: true, lastUpdated: new Date().toISOString() }
      const exists = prev.find(u => u.userId === uid)
      return exists ? prev.map(u => u.userId === uid ? updated : u) : [...prev, updated]
    })
  }

  function startSharing() {
    if (!currentUserId) return
    localStorage.setItem('ics214_loc_pref', 'granted')
    requestUserLocation(currentUserId, profile?.full_name ?? 'Me')
  }

  function stopSharing() {
    locationIntervalRef.current && clearInterval(locationIntervalRef.current)
    locationIntervalRef.current = null
    setSharingLocation(false)
    setFollow(false)
  }

  // -- Map click handler ------------------------------------
  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (activeMode === 'marker') {
      if (!isAdmin) return
      setPendingMarkerCoords({ lat, lng })
      setMarkerTitle(''); setMarkerDesc(''); setMarkerType('incident'); setMarkerError(null)
      return
    }
    if (activeMode === 'circle') {
      setPendingBoundary({ shape: 'circle', center: [lat, lng] })
      setBTitle(''); setBDesc(''); setBZoneType('perimeter'); setBRadiusMeters('200'); setBError(null)
      setDrawPoints([[lat, lng]])
      return
    }
    if (activeMode === 'rectangle') {
      setDrawPoints(prev => {
        const next = [...prev, [lat, lng] as [number, number]]
        if (next.length === 2) {
          setPendingBoundary({ shape: 'rectangle', points: next })
          setBTitle(''); setBDesc(''); setBZoneType('perimeter'); setBError(null)
        }
        return next
      })
      return
    }
    if (activeMode === 'polygon') {
      setDrawPoints(prev => [...prev, [lat, lng]])
    }
  }, [activeMode, isAdmin])

  // -- User interaction — disables follow mode --------------
  const handleUserInteraction = useCallback(() => {
    setFollow(false)
  }, [])

  function cancelDraw() {
    setActiveMode('marker')
    setDrawPoints([])
    setPendingBoundary(null)
  }

  function finishPolygon() {
    if (drawPoints.length < 3) return
    setPendingBoundary({ shape: 'polygon', points: drawPoints })
    setBTitle(''); setBDesc(''); setBZoneType('perimeter'); setBError(null)
  }

  // -- Save marker ------------------------------------------
  async function saveMarker(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingMarkerCoords || !markerTitle.trim()) return
    setMarkerSaving(true); setMarkerError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMarkerSaving(false); return }
    const { data, error } = await supabase.from('event_markers').insert({
      event_id: id,
      lat: pendingMarkerCoords.lat, lng: pendingMarkerCoords.lng,
      type: markerType, title: markerTitle.trim(),
      description: markerDesc.trim() || null,
      created_by: user.id,
    }).select().single()
    if (error) { setMarkerError(error.message); setMarkerSaving(false); return }
    setMarkers(prev => [...prev, data])
    setPendingMarkerCoords(null)
    setMarkerSaving(false)
  }

  // -- Delete marker ----------------------------------------
  const handleDeleteMarker = useCallback(async (mid: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('event_markers').delete().eq('id', mid)
    if (!error) setMarkers(prev => prev.filter(m => m.id !== mid))
  }, [])

  // -- Save boundary ----------------------------------------
  async function saveBoundary(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingBoundary || !bTitle.trim()) return
    setBSaving(true); setBError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBSaving(false); return }

    let geometry: Record<string, any> = {}
    if (pendingBoundary.shape === 'circle' && pendingBoundary.center) {
      geometry = { center: pendingBoundary.center, radiusMeters: Math.max(1, parseInt(bRadiusMeters, 10) || 200) }
    } else if (pendingBoundary.shape === 'rectangle' && pendingBoundary.points) {
      const [[lat1, lng1], [lat2, lng2]] = pendingBoundary.points
      geometry = { bounds: [[Math.min(lat1, lat2), Math.min(lng1, lng2)], [Math.max(lat1, lat2), Math.max(lng1, lng2)]] }
    } else if (pendingBoundary.shape === 'polygon' && pendingBoundary.points) {
      geometry = { points: pendingBoundary.points }
    }

    const { data, error } = await supabase.from('event_boundaries').insert({
      event_id: id,
      shape: pendingBoundary.shape,
      geometry,
      zone_type: bZoneType,
      title: bTitle.trim(),
      description: bDesc.trim() || null,
      created_by: user.id,
    }).select().single()

    if (error) { setBError(error.message); setBSaving(false); return }
    setBoundaries(prev => [...prev, data])
    setPendingBoundary(null)
    setDrawPoints([])
    setActiveMode('marker')
    setBSaving(false)
  }

  // -- Delete boundary --------------------------------------
  const handleDeleteBoundary = useCallback(async (bid: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('event_boundaries').delete().eq('id', bid)
    if (!error) setBoundaries(prev => prev.filter(b => b.id !== bid))
  }, [])

  // -- Center helpers ---------------------------------------
  function centerOnMe() {
    if (userCoords) {
      setFollow(true)
      setCenterTrigger({ lat: userCoords.lat, lng: userCoords.lng, zoom: 15, seq: Date.now() })
    } else if (navigator.geolocation) {
      // Request location now if we don't have it yet
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        setUserCoords({ lat, lng })
        setFollow(true)
        setCenterTrigger({ lat, lng, zoom: 15, seq: Date.now() })
      })
    }
  }

  function centerOnEvent() {
    if (eventCoords) {
      setFollow(false)
      setCenterTrigger({ lat: eventCoords.lat, lng: eventCoords.lng, zoom: 13, seq: Date.now() })
    }
  }

  // -- Computed ---------------------------------------------
  if (!event) return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
      <p className="text-[#6B7280] text-sm">Loading…</p>
    </div>
  )

  const displayedMarkers    = showMarkers    ? markers    : []
  const displayedPeople     = showPeople     ? userLocations : []
  const displayedBoundaries = showBoundaries ? boundaries : []

  const drawModeHint: Record<ActiveMode, string> = {
    marker:    'Tap map to place a marker',
    circle:    'Tap map to set circle center',
    rectangle: drawPoints.length === 0 ? 'Tap first corner of rectangle' : 'Tap second corner to complete',
    polygon:   `${drawPoints.length} point${drawPoints.length !== 1 ? 's' : ''} — tap to add, press Done when finished`,
    none:      '',
  }

  const isDrawing = activeMode !== 'marker' && activeMode !== 'none'

  return (
    <div className="h-screen bg-[#0B0F14] flex flex-col overflow-hidden">

      {/* -- HEADER --------------------------------------------- */}
      <header className="flex-shrink-0 bg-[#0B0F14]/95 backdrop-blur-sm border-b border-[#232B36]/70 z-10">
        <div className="px-3 py-2 flex items-center gap-2">
          <Link
            href={`/events/${id}`}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors py-1 pr-1"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            <span className="max-w-[90px] truncate">{event.name}</span>
          </Link>

          {/* -- Search bar -- */}
          <div className="flex-1 relative min-w-0">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4B5563] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Search people, markers…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                className="w-full bg-[#161D26] border border-[#232B36] rounded-lg pl-6 pr-2 py-1 text-xs text-[#E5E7EB] placeholder-[#4B5563] focus:outline-none focus:border-[#3a4555] transition-colors"
              />
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#161D26] border border-[#232B36] rounded-xl overflow-hidden shadow-2xl z-[2000]">
                {searchResults.map(r => (
                  <button
                    key={r.id}
                    onMouseDown={() => {
                      setCenterTrigger({ lat: r.lat, lng: r.lng, zoom: 16, seq: Date.now() })
                      setSearchQuery('')
                      setSearchOpen(false)
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#1a2235] transition-colors text-left"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="text-xs text-[#E5E7EB] flex-1 truncate">{r.label}</span>
                    <span className="text-xs text-[#6B7280] flex-shrink-0 capitalize">{r.sublabel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* -- Layer toggles -- */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <ToggleBtn active={showMarkers} onClick={() => setShowMarkers(v => !v)} title="Markers">
              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </ToggleBtn>
            <ToggleBtn active={showBoundaries} onClick={() => setShowBoundaries(v => !v)} title="Boundaries">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </ToggleBtn>
            <ToggleBtn active={showPeople} onClick={() => setShowPeople(v => !v)} title="People">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </ToggleBtn>
          </div>

          {/* -- Location sharing -- */}
          <button
            onClick={sharingLocation ? stopSharing : startSharing}
            className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
              sharingLocation
                ? 'bg-[#3B82F6]/15 text-[#3B82F6] ring-1 ring-inset ring-[#3B82F6]/25'
                : 'text-[#6B7280] hover:text-[#9CA3AF]'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sharingLocation ? 'bg-[#3B82F6] animate-pulse' : 'bg-[#6B7280]'}`} />
            {sharingLocation ? 'Live' : 'Share'}
          </button>
        </div>

        {/* -- Admin toolbar -- */}
        {isAdmin && (
          <div className="px-3 py-1.5 border-t border-[#232B36]/50 bg-[#161D26]/50 flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs text-[#6B7280] font-medium flex-shrink-0 mr-1">Draw:</span>

            <ModeBtn active={activeMode === 'marker'} onClick={() => { setActiveMode('marker'); setDrawPoints([]) }}>
              <circle cx="12" cy="10" r="3"/><path d="M12 21V13"/>
              Marker
            </ModeBtn>
            <ModeBtn active={activeMode === 'circle'} onClick={() => { setActiveMode('circle'); setDrawPoints([]) }}>
              <circle cx="12" cy="12" r="9"/>
              Circle
            </ModeBtn>
            <ModeBtn active={activeMode === 'rectangle'} onClick={() => { setActiveMode('rectangle'); setDrawPoints([]) }}>
              <rect x="3" y="3" width="18" height="18" rx="1"/>
              Rect
            </ModeBtn>
            <ModeBtn active={activeMode === 'polygon'} onClick={() => { setActiveMode('polygon'); setDrawPoints([]) }}>
              <polygon points="12,3 21,20 3,20"/>
              Polygon
            </ModeBtn>

            {activeMode === 'polygon' && drawPoints.length >= 3 && (
              <button
                onClick={finishPolygon}
                className="flex-shrink-0 px-2 py-1 rounded-lg bg-[#22C55E]/15 text-[#22C55E] ring-1 ring-inset ring-[#22C55E]/30 text-xs font-medium transition-colors"
              >
                Done
              </button>
            )}
            {isDrawing && (
              <button onClick={cancelDraw} className="flex-shrink-0 px-2 py-1 rounded-lg text-xs text-[#EF4444]/70 hover:text-[#EF4444] transition-colors">
                Cancel
              </button>
            )}

            {activeMode !== 'marker' && (
              <span className="text-xs text-[#6B7280] ml-auto flex-shrink-0 hidden sm:block">{drawModeHint[activeMode]}</span>
            )}
          </div>
        )}
      </header>

      {/* -- MAP ------------------------------------------------ */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <EventMap
          initialUserLat={userCoords?.lat ?? null}
          initialUserLng={userCoords?.lng ?? null}
          eventLat={eventCoords?.lat ?? null}
          eventLng={eventCoords?.lng ?? null}
          eventName={event.name}
          markers={displayedMarkers}
          userLocations={displayedPeople}
          boundaries={displayedBoundaries}
          drawMode={activeMode === 'marker' ? 'none' : activeMode}
          drawPoints={drawPoints}
          isAdmin={isAdmin}
          onMapClick={handleMapClick}
          onDeleteMarker={isAdmin ? handleDeleteMarker : undefined}
          onDeleteBoundary={isAdmin ? handleDeleteBoundary : undefined}
          centerTrigger={centerTrigger}
          onUserInteraction={handleUserInteraction}
        />

        {/* -- Floating action buttons (bottom-right, above Leaflet zoom) -- */}
        <div className="absolute bottom-16 right-3 z-[1000] flex flex-col gap-1.5">
          {/* Center-on-me — always shown; re-enables follow mode */}
          <MapFab onClick={centerOnMe} title={followMode ? 'Following you' : 'Center on me'} active={followMode}>
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
          </MapFab>
          {eventCoords && (
            <MapFab onClick={centerOnEvent} title="Center on event">
              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </MapFab>
          )}
        </div>

        {/* -- Follow paused banner -- */}
        {sharingLocation && !followMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-[#0B0F14]/90 backdrop-blur-sm border border-[#232B36]/70 rounded-full px-3 py-1.5 flex items-center gap-2 pointer-events-auto">
            <span className="text-xs text-[#6B7280]">Following paused</span>
            <button onClick={centerOnMe} className="text-xs font-semibold text-[#3B82F6] hover:text-[#60A5FA] transition-colors">
              Resume
            </button>
          </div>
        )}

        {/* -- Draw hint (mobile, non-admin mode) -- */}
        {isAdmin && activeMode !== 'marker' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-[#0B0F14]/90 border border-[#232B36]/60 rounded-full px-3 py-1.5 sm:hidden">
            <p className="text-xs text-[#9CA3AF]">{drawModeHint[activeMode]}</p>
          </div>
        )}

        {/* -- Legend -- */}
        <div className="absolute bottom-4 left-3 z-[1000] bg-[#0B0F14]/80 backdrop-blur-sm border border-[#232B36]/60 rounded-xl px-2.5 py-2 space-y-1">
          <LegendRow color="#EF4444" label="Incident" />
          <LegendRow color="#3B82F6" label="Resource" />
          <LegendRow color="#F59E0B" label="Hazard" />
          <div className="h-px bg-[#232B36]/60 my-0.5" />
          <LegendRow color="#E5E7EB" label="Perimeter" shape="rect" />
          <LegendRow color="#EF4444" label="Hazard zone" shape="rect" />
          <LegendRow color="#22C55E" label="Staging" shape="rect" />
          <LegendRow color="#3B82F6" label="Search" shape="rect" />
        </div>
      </div>

      {/* -- ADD MARKER MODAL ---------------------------------- */}
      {pendingMarkerCoords && (
        <BottomSheet onClose={() => setPendingMarkerCoords(null)} title="Add Marker">
          <form onSubmit={saveMarker} className="space-y-3">
            <div>
              <label className="field-label">Type</label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {MARKER_OPTS.map(opt => (
                  <TypeBtn key={opt.value} color={opt.color} label={opt.label}
                    active={markerType === opt.value} onClick={() => setMarkerType(opt.value)} />
                ))}
              </div>
            </div>
            <FormField label="Title *">
              <input className="input" placeholder="e.g. Downed power line" value={markerTitle}
                onChange={e => setMarkerTitle(e.target.value)} required autoFocus />
            </FormField>
            <FormField label="Notes">
              <textarea className="input resize-none" rows={2} placeholder="Optional details…"
                value={markerDesc} onChange={e => setMarkerDesc(e.target.value)} />
            </FormField>
            <CoordBadge lat={pendingMarkerCoords.lat} lng={pendingMarkerCoords.lng} />
            {markerError && <p className="text-xs text-[#EF4444]">{markerError}</p>}
            <ModalActions
              onCancel={() => setPendingMarkerCoords(null)}
              saving={markerSaving} disabled={!markerTitle.trim()}
              label="Add marker"
            />
          </form>
        </BottomSheet>
      )}

      {/* -- ADD BOUNDARY MODAL -------------------------------- */}
      {pendingBoundary && (
        <BottomSheet onClose={cancelDraw} title={`Draw ${pendingBoundary.shape.charAt(0).toUpperCase() + pendingBoundary.shape.slice(1)}`}>
          <form onSubmit={saveBoundary} className="space-y-3">
            <div>
              <label className="field-label">Zone type</label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {ZONE_OPTIONS.map(opt => (
                  <TypeBtn key={opt.value} color={opt.color} label={opt.label}
                    active={bZoneType === opt.value} onClick={() => setBZoneType(opt.value)} />
                ))}
              </div>
            </div>
            <FormField label="Title *">
              <input className="input" placeholder="e.g. Command post perimeter" value={bTitle}
                onChange={e => setBTitle(e.target.value)} required autoFocus />
            </FormField>
            {pendingBoundary.shape === 'circle' && (
              <FormField label="Radius (meters)">
                <input className="input" type="number" min="1" max="100000" value={bRadiusMeters}
                  onChange={e => setBRadiusMeters(e.target.value)} />
              </FormField>
            )}
            <FormField label="Notes">
              <textarea className="input resize-none" rows={2} placeholder="Optional details…"
                value={bDesc} onChange={e => setBDesc(e.target.value)} />
            </FormField>
            {pendingBoundary.shape === 'circle' && pendingBoundary.center && (
              <CoordBadge lat={pendingBoundary.center[0]} lng={pendingBoundary.center[1]} label="Center" />
            )}
            {pendingBoundary.shape !== 'circle' && pendingBoundary.points && (
              <p className="text-xs text-[#6B7280] font-mono">{pendingBoundary.points.length} points</p>
            )}
            {bError && <p className="text-xs text-[#EF4444]">{bError}</p>}
            <ModalActions onCancel={cancelDraw} saving={bSaving} disabled={!bTitle.trim()} label="Save boundary" />
          </form>
        </BottomSheet>
      )}
    </div>
  )
}

// -- Small reusable sub-components ----------------------------

function ToggleBtn({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg transition-colors ${active ? 'bg-[#232B36] text-[#E5E7EB]' : 'text-[#6B7280] hover:text-[#9CA3AF]'}`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {children}
      </svg>
    </button>
  )
}

function ModeBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  const parts = Array.isArray(children) ? children : [children]
  const svgParts = parts.slice(0, -1)
  const label = parts[parts.length - 1]
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
        active ? 'bg-[#FF5A1F]/15 text-[#FF5A1F] ring-1 ring-inset ring-[#FF5A1F]/30' : 'text-[#6B7280] hover:text-[#9CA3AF] hover:bg-[#1a2235]'
      }`}
    >
      <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {svgParts}
      </svg>
      {label}
    </button>
  )
}

function MapFab({ onClick, title, children, active = false }: {
  onClick: () => void; title: string; children: React.ReactNode; active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-9 h-9 backdrop-blur-sm border rounded-xl flex items-center justify-center transition-all shadow-lg ${
        active
          ? 'bg-[#3B82F6]/20 border-[#3B82F6]/50 text-[#3B82F6]'
          : 'bg-[#161D26]/90 border-[#232B36]/80 text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#1a2235]'
      }`}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {children}
      </svg>
    </button>
  )
}

function LegendRow({ color, label, shape = 'circle' }: { color: string; label: string; shape?: 'circle' | 'rect' }) {
  return (
    <div className="flex items-center gap-2">
      {shape === 'circle'
        ? <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        : <span className="w-3 h-2 rounded-sm flex-shrink-0 border" style={{ borderColor: color, backgroundColor: color + '22' }} />
      }
      <span className="text-xs text-[#6B7280]">{label}</span>
    </div>
  )
}

function BottomSheet({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[2000] px-4 pb-4 sm:pb-0">
      <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-[#E5E7EB]">{title}</p>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#E5E7EB] p-1 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[#6B7280] font-medium block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function TypeBtn({ color, label, active, onClick }: { color: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-all ${
        active ? '' : 'border-[#232B36] text-[#6B7280] bg-[#121821] hover:border-[#3a4555]'
      }`}
      style={active ? { backgroundColor: color + '22', borderColor: color + 'AA', color } : {}}
    >
      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
      {label}
    </button>
  )
}

function CoordBadge({ lat, lng, label = 'Location' }: { lat: number; lng: number; label?: string }) {
  return (
    <p className="text-xs text-[#6B7280] font-mono">
      {label}: {lat.toFixed(5)}, {lng.toFixed(5)}
    </p>
  )
}

function ModalActions({ onCancel, saving, disabled, label }: {
  onCancel: () => void; saving: boolean; disabled: boolean; label: string
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button type="submit" disabled={saving || disabled}
        className="flex-1 bg-[#FF5A1F] hover:bg-[#FF6A33] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
        {saving ? 'Saving…' : label}
      </button>
      <button type="button" onClick={onCancel}
        className="px-4 py-2.5 rounded-xl border border-[#232B36] text-[#9CA3AF] text-sm hover:bg-[#1a2235] transition-colors">
        Cancel
      </button>
    </div>
  )
}
