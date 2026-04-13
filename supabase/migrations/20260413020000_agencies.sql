-- Agencies table — each agency is a customer/organization.
-- Users select their agency at registration; admins control which agencies exist.

CREATE TABLE public.agencies (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text        NOT NULL UNIQUE,
  is_active boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read active agencies (needed for the signup dropdown)
CREATE POLICY "authenticated users can view active agencies"
  ON public.agencies FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins can do everything
CREATE POLICY "admins can manage agencies"
  ON public.agencies FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed the initial agencies
INSERT INTO public.agencies (name) VALUES
  ('Detroit Fire Department'),
  ('Detroit Police Department');
