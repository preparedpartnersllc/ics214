-- ============================================================
-- Dual-hat system: track dual roles + configurable rule table
-- ============================================================

-- Mark assignments that are part of a dual-hat pair
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS dual_hatted boolean NOT NULL DEFAULT false;

-- Per-event rules controlling which role combinations may be dual-hatted
CREATE TABLE IF NOT EXISTS dual_hat_rules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role1       text        NOT NULL,
  role2       text        NOT NULL,
  label       text        NOT NULL,
  enabled     boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, role1, role2)
);

ALTER TABLE dual_hat_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dual_hat_rules_select"
  ON dual_hat_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "dual_hat_rules_insert"
  ON dual_hat_rules FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "dual_hat_rules_update"
  ON dual_hat_rules FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "dual_hat_rules_delete"
  ON dual_hat_rules FOR DELETE
  TO authenticated USING (true);
