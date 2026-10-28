-- Optional per-tenant login background. The value may be a hosted URL or an optimized data URL.
ALTER TABLE government_branding
  ADD COLUMN IF NOT EXISTS login_background_url TEXT;
