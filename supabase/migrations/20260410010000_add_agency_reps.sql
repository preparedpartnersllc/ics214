-- ============================================================
-- Agency Representatives: flexible per-OP list for external
-- liaisons who may not have system accounts.
-- ============================================================

CREATE TABLE IF NOT EXISTS agency_reps (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_period_id uuid        NOT NULL REFERENCES operational_periods(id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  agency                text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agency_reps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_reps_select"
  ON agency_reps FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "agency_reps_insert"
  ON agency_reps FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "agency_reps_delete"
  ON agency_reps FOR DELETE
  TO authenticated USING (true);
