-- Fix handle_new_user trigger so that invited users (who have no full_name in
-- raw_user_meta_data) can be created without violating the NOT NULL constraint
-- on profiles.full_name.  We also give the column an empty-string default so
-- direct inserts outside the trigger are similarly safe.

ALTER TABLE public.profiles
  ALTER COLUMN full_name SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
