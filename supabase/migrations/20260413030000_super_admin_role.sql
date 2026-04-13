-- Add super_admin role and promote the founding account.
-- super_admin has all admin privileges and cannot be deleted by regular admins.

-- Widen the role CHECK constraint to allow super_admin
ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['super_admin','admin','supervisor','member']));

-- Promote the founding account
UPDATE public.profiles
  SET role = 'super_admin'
  WHERE email = 'wattsa0729@detroitmi.gov';
