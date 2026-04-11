-- ============================================================
-- Personnel lifecycle: check-in, demob requests, approvals,
-- and per-event approver role configuration.
-- ============================================================

-- ── 1. Personnel check-ins ────────────────────────────────────
-- Records that a person has physically arrived and is present
-- for this operational period. One record per person per OP.
-- Created explicitly by admins (check-in page) or automatically
-- when a person is assigned (so legacy flows still work).
CREATE TABLE IF NOT EXISTS personnel_checkins (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_period_id uuid        NOT NULL REFERENCES operational_periods(id) ON DELETE CASCADE,
  event_id              uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id               uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  checked_in_at         timestamptz NOT NULL DEFAULT now(),
  checked_in_by         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  notes                 text,
  UNIQUE(operational_period_id, user_id)
);

ALTER TABLE personnel_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkins_select" ON personnel_checkins FOR SELECT TO authenticated USING (true);
CREATE POLICY "checkins_insert" ON personnel_checkins FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "checkins_delete" ON personnel_checkins FOR DELETE TO authenticated USING (true);

-- ── 2. Demobilization requests ────────────────────────────────
-- One active (pending) request per person per OP at a time.
-- status: 'pending' | 'approved' | 'cancelled'
CREATE TABLE IF NOT EXISTS demob_requests (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_period_id uuid        NOT NULL REFERENCES operational_periods(id) ON DELETE CASCADE,
  event_id              uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id               uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignment_id         uuid        REFERENCES assignments(id) ON DELETE SET NULL,
  requested_at          timestamptz NOT NULL DEFAULT now(),
  requested_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  reason                text,
  status                text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'cancelled')),
  completed_at          timestamptz
);

-- Prevent duplicate pending requests
CREATE UNIQUE INDEX IF NOT EXISTS demob_requests_one_pending
  ON demob_requests(operational_period_id, user_id)
  WHERE status = 'pending';

ALTER TABLE demob_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demob_requests_select" ON demob_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "demob_requests_insert" ON demob_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "demob_requests_update" ON demob_requests FOR UPDATE TO authenticated USING (true);

-- ── 3. Demob approval tracking ────────────────────────────────
-- One row per required approver role per demob request.
-- approved_at NULL = pending; non-null = approved.
CREATE TABLE IF NOT EXISTS demob_approvals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  demob_request_id  uuid        NOT NULL REFERENCES demob_requests(id) ON DELETE CASCADE,
  approver_position text        NOT NULL,
  approver_user_id  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  notes             text,
  UNIQUE(demob_request_id, approver_position)
);

ALTER TABLE demob_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demob_approvals_select" ON demob_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "demob_approvals_insert" ON demob_approvals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "demob_approvals_update" ON demob_approvals FOR UPDATE TO authenticated USING (true);

-- ── 4. Per-event demob approver role configuration ────────────
-- Which ICS positions must sign off on demob for this event.
-- Empty = no configured approvers = immediate auto-approve.
CREATE TABLE IF NOT EXISTS event_demob_approver_roles (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid  NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ics_position text  NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(event_id, ics_position)
);

ALTER TABLE event_demob_approver_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demob_approver_roles_select" ON event_demob_approver_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "demob_approver_roles_insert" ON event_demob_approver_roles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "demob_approver_roles_delete" ON event_demob_approver_roles FOR DELETE TO authenticated USING (true);

-- ── 5. Link demob requests from notifications ─────────────────
ALTER TABLE in_app_notifications
  ADD COLUMN IF NOT EXISTS demob_request_id uuid
    REFERENCES demob_requests(id) ON DELETE CASCADE;

-- ── 6. Performance indexes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS personnel_checkins_op_idx  ON personnel_checkins(operational_period_id);
CREATE INDEX IF NOT EXISTS demob_requests_op_idx      ON demob_requests(operational_period_id);
CREATE INDEX IF NOT EXISTS demob_requests_event_idx   ON demob_requests(event_id);
CREATE INDEX IF NOT EXISTS demob_approvals_request_idx ON demob_approvals(demob_request_id);
CREATE INDEX IF NOT EXISTS demob_approvals_approver_idx ON demob_approvals(approver_user_id) WHERE approved_at IS NULL;
