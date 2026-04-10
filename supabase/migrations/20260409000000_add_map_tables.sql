-- ============================================================
-- Map feature: event_markers + event_user_locations + event_boundaries
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Event markers (incidents, resources, hazards)
create table if not exists event_markers (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  type        text not null check (type in ('incident', 'resource', 'hazard')),
  title       text not null,
  description text,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table event_markers enable row level security;

create policy "Authenticated users can view markers"
  on event_markers for select using (auth.uid() is not null);

create policy "Authenticated users can insert markers"
  on event_markers for insert with check (auth.uid() is not null);

create policy "Creator can delete marker"
  on event_markers for delete using (auth.uid() = created_by);

-- ============================================================

-- 2. Live user locations (optional per-user sharing per event)
create table if not exists event_user_locations (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  lat          double precision not null,
  lng          double precision not null,
  last_updated timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table event_user_locations enable row level security;

create policy "Authenticated users can view user locations"
  on event_user_locations for select using (auth.uid() is not null);

create policy "User can insert own location"
  on event_user_locations for insert with check (auth.uid() = user_id);

create policy "User can update own location"
  on event_user_locations for update using (auth.uid() = user_id);

-- ============================================================

-- 3. Operational area boundaries (circles, rectangles, polygons)
--    Geometry stored as JSONB:
--      circle:    { "center": [lat, lng], "radiusMeters": 500 }
--      rectangle: { "bounds": [[swLat, swLng], [neLat, neLng]] }
--      polygon:   { "points": [[lat, lng], ...] }
create table if not exists event_boundaries (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  shape       text not null check (shape in ('circle', 'rectangle', 'polygon')),
  geometry    jsonb not null,
  zone_type   text not null check (zone_type in ('perimeter', 'hazard_zone', 'staging_area', 'search_area')),
  title       text not null,
  description text,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table event_boundaries enable row level security;

create policy "Authenticated users can view boundaries"
  on event_boundaries for select using (auth.uid() is not null);

create policy "Authenticated users can insert boundaries"
  on event_boundaries for insert with check (auth.uid() is not null);

create policy "Creator can delete boundary"
  on event_boundaries for delete using (auth.uid() = created_by);
