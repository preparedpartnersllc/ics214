-- RSVP / acknowledgement table
-- One row per (meeting, user). Upsert on status change.
CREATE TABLE IF NOT EXISTS meeting_rsvps (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid        NOT NULL REFERENCES event_meetings(id)  ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES profiles(id)         ON DELETE CASCADE,
  status     text        NOT NULL CHECK (status IN ('accepted', 'maybe', 'declined')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

ALTER TABLE meeting_rsvps ENABLE ROW LEVEL SECURITY;

-- Users manage their own RSVP
CREATE POLICY "Users can manage their own RSVPs"
  ON meeting_rsvps
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all RSVPs (for command visibility)
CREATE POLICY "Admins can view all RSVPs"
  ON meeting_rsvps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
