-- Fix handle_new_user trigger: catch ALL unique constraint violations (id OR email),
-- not just id conflicts. This prevents "Database error saving new user" when
-- re-inviting a previously deleted user whose profile row may still exist.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Never let a profile-insert failure block auth user creation
  RETURN NEW;
END;
$$;
