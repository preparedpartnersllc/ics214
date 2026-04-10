-- ── Event Meetings ───────────────────────────────────────────
CREATE TABLE event_meetings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  operational_period_id uuid        REFERENCES operational_periods(id) ON DELETE SET NULL,
  title                 text        NOT NULL,
  description           text,
  start_time            timestamptz NOT NULL,
  end_time              timestamptz NOT NULL,
  location              text,
  created_by            uuid        NOT NULL REFERENCES profiles(id),
  created_at            timestamptz DEFAULT now(),
  is_cancelled          boolean     NOT NULL DEFAULT false
);

ALTER TABLE event_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_select" ON event_meetings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "meetings_insert" ON event_meetings
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "meetings_update" ON event_meetings
  FOR UPDATE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "meetings_delete" ON event_meetings
  FOR DELETE TO authenticated USING (created_by = auth.uid());

-- ── Meeting Invitees ─────────────────────────────────────────
CREATE TABLE meeting_invitees (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid        NOT NULL REFERENCES event_meetings(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_at timestamptz DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

ALTER TABLE meeting_invitees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitees_select" ON meeting_invitees
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "invitees_insert" ON meeting_invitees
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "invitees_delete" ON meeting_invitees
  FOR DELETE TO authenticated USING (true);

-- ── In-App Notifications ─────────────────────────────────────
CREATE TABLE in_app_notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id   uuid        REFERENCES events(id) ON DELETE CASCADE,
  meeting_id uuid        REFERENCES event_meetings(id) ON DELETE CASCADE,
  title      text        NOT NULL,
  body       text,
  is_read    boolean     NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifs_select" ON in_app_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notifs_insert" ON in_app_notifications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "notifs_update" ON in_app_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ── Phone normalized column on profiles ──────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_normalized text;
