-- ============================================================
-- Refactor assignment model: explicit section, agency rep flag,
-- structural FKs, and DB-level one-active-per-OP constraint.
--
-- All changes are purely additive (ADD COLUMN IF NOT EXISTS,
-- CREATE UNIQUE INDEX IF NOT EXISTS). No columns removed, no
-- existing rows deleted. All consumers of the assignments table
-- continue to work without modification.
-- ============================================================

-- ── 1. section ───────────────────────────────────────────────
-- Replaces the implicit convention of reading team.name to derive
-- which ICS section a person is in. Stored directly on the row so
-- ICS 203 exports can GROUP BY section without joining teams.
-- Values: 'command' | 'planning' | 'logistics' | 'finance' | 'operations'
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS section text;

-- Backfill from the system team naming convention already in use.
-- __command__ / __planning__ / __logistics__ / __finance__ → named sections.
-- Everything else (regular ops teams, __gr_*__, __br_*__, __dv_*__) → operations.
UPDATE assignments a
SET section = CASE
  WHEN t.name = '__command__'   THEN 'command'
  WHEN t.name = '__planning__'  THEN 'planning'
  WHEN t.name = '__logistics__' THEN 'logistics'
  WHEN t.name = '__finance__'   THEN 'finance'
  ELSE 'operations'
END
FROM teams t
WHERE t.id = a.team_id;


-- ── 2. is_agency_rep ─────────────────────────────────────────
-- Agency Representatives must not be treated as a fixed Command Staff
-- role. This flag distinguishes them without requiring callers to
-- inspect ics_position strings.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS is_agency_rep boolean NOT NULL DEFAULT false;

-- Backfill: any existing row with position 'agency_representative' is a rep.
UPDATE assignments
SET is_agency_rep = true
WHERE ics_position = 'agency_representative';


-- ── 3. group_id / division_id ─────────────────────────────────
-- Denormalized structural context. Lets ICS 203 export join directly
-- to the org structure without traversing teams → group → division.
-- Nullable: command/planning/logistics/finance assignments have no
-- group or division.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE SET NULL;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES divisions(id) ON DELETE SET NULL;

-- Backfill from the team's own group_id / division_id columns.
UPDATE assignments a
SET
  group_id    = t.group_id,
  division_id = t.division_id
FROM teams t
WHERE t.id = a.team_id;


-- ── 4. One-active-assignment-per-OP constraint ────────────────
-- Enforces the rule that each person has at most one active
-- assignment per operational period at the database level,
-- backing up the application-layer guard in createAssignment().
--
-- Partial index conditions:
--   operational_period_id IS NOT NULL  →  excludes legacy event-level rows
--                                         created by the old /assign page
--   NOT dual_hatted                    →  leaves room for dual-hat pairs
--                                         when that feature is enabled
CREATE UNIQUE INDEX IF NOT EXISTS assignments_one_active_per_op
  ON assignments (user_id, operational_period_id)
  WHERE operational_period_id IS NOT NULL AND NOT dual_hatted;


-- ── RLS: new columns inherit existing policies ────────────────
-- No policy changes needed — existing SELECT/INSERT/UPDATE/DELETE
-- policies on assignments cover all rows and columns.
