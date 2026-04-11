-- ============================================================
-- Link ICS 214 activity_entries to the assignment model.
--
-- Problem: activity_entries.assignment_id references the assignments
-- row, but reassignTo() updates that row in place. If a person is
-- moved after logging, old entries silently reflect the new position
-- instead of where they were when they logged. The context is lost.
--
-- Fix: snapshot the assignment context directly on each entry row at
-- INSERT time. The assignment_id FK is kept for backwards compatibility
-- with all existing exports and queries, but accountability / section
-- queries should use these snapshot columns instead.
--
-- All changes are purely additive. No existing columns removed.
-- ============================================================

-- ── 1. Snapshot columns ───────────────────────────────────────
-- Copied from the active assignment at the moment of logging.
-- NULL-able: a person logging while in Staging has no assignment.

ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS snapped_section     text;

ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS snapped_position    text;

ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS snapped_team_id     uuid REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS snapped_group_id    uuid REFERENCES groups(id) ON DELETE SET NULL;

ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS snapped_division_id uuid REFERENCES divisions(id) ON DELETE SET NULL;

-- ── 2. Staging flag ───────────────────────────────────────────
-- TRUE when the entry was submitted while the user had no active
-- assignment for this operational period (i.e. they were in Staging).
-- Allows staging users to log without being blocked, and makes their
-- entries identifiable for accountability queries.

ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS is_staging boolean NOT NULL DEFAULT false;

-- ── 3. Backfill existing rows ─────────────────────────────────
-- Populate snapshot columns from the current assignment row.
-- For entries that already exist this is the best we can do —
-- we don't have historical position data. Going forward the
-- application writes these at INSERT time.

UPDATE activity_entries ae
SET
  snapped_section     = a.section,
  snapped_position    = a.ics_position,
  snapped_team_id     = a.team_id,
  snapped_group_id    = a.group_id,
  snapped_division_id = a.division_id,
  is_staging          = false
FROM assignments a
WHERE a.id = ae.assignment_id
  AND ae.snapped_section IS NULL;

-- Rows with no matching assignment were staging entries (or pre-model).
UPDATE activity_entries
SET is_staging = true
WHERE assignment_id IS NULL OR snapped_section IS NULL;

-- ── 4. Accountability index ───────────────────────────────────
-- Supports queries like "last entry per user per OP" used for
-- accountability/status displays on the roster and event page.

CREATE INDEX IF NOT EXISTS activity_entries_op_user_time
  ON activity_entries (operational_period_id, user_id, entry_time DESC);

-- Supports filtering log timeline by section.
CREATE INDEX IF NOT EXISTS activity_entries_op_section
  ON activity_entries (operational_period_id, snapped_section);
