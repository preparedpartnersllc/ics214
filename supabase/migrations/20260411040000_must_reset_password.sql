-- Track whether a user must set a new password before accessing the app.
-- Set to true when an admin creates/resets a temporary password.
-- Cleared to false by the resetPassword server action after the user completes the reset.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT false;
