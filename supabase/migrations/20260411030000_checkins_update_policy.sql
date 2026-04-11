-- Allow authenticated users to update their own (or any) check-in record.
-- Required so that performCheckin's upsert (INSERT ... ON CONFLICT DO UPDATE)
-- can update an existing row — e.g. when a preassigned person is checked in
-- via the staff board Check In button or the check-in page.
CREATE POLICY "checkins_update" ON personnel_checkins
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
