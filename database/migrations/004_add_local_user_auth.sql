-- Migration: Add support for local user authentication
-- This allows users to have either Azure AD SSO or local username/password auth

-- Add password_hash column for local users
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Make azure_ad_object_id nullable (local users won't have Azure AD IDs)
ALTER TABLE public.user_profiles
ALTER COLUMN azure_ad_object_id DROP NOT NULL;

-- Add auth_type column to differentiate between SSO and local users
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'azure_sso' CHECK (auth_type IN ('azure_sso', 'local'));

-- Add constraint: either azure_ad_object_id OR password_hash must be present
ALTER TABLE public.user_profiles
ADD CONSTRAINT check_auth_method CHECK (
  (azure_ad_object_id IS NOT NULL AND password_hash IS NULL) OR
  (azure_ad_object_id IS NULL AND password_hash IS NOT NULL)
);

-- Update unique constraint on azure_ad_object_id to allow NULLs
-- Drop old constraint
ALTER TABLE public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_azure_ad_object_id_key;

-- Add new constraint that only applies when not null
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_azure_ad_object_id_unique_idx
ON public.user_profiles(azure_ad_object_id)
WHERE azure_ad_object_id IS NOT NULL;

-- Update RLS policies to work with local users
-- Drop old policy that relies on azure_ad_object_id
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Authenticated users can view processes" ON public.processes;
DROP POLICY IF EXISTS "Authenticated users can view systems" ON public.systems;
DROP POLICY IF EXISTS "Authenticated users can view process-systems" ON public.process_systems;
DROP POLICY IF EXISTS "Authenticated users can view critical operations" ON public.critical_operations;
DROP POLICY IF EXISTS "Authenticated users can view controls" ON public.controls;
DROP POLICY IF EXISTS "Authenticated users can view process controls" ON public.process_controls;
DROP POLICY IF EXISTS "Users can view non-sensitive settings" ON public.settings;
DROP POLICY IF EXISTS "Authenticated users can view sync history" ON public.sync_history;

-- Update the current_user_azure_id function to work with local users too
-- We'll use user ID instead of Azure ID for session context
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('app.current_user_id', true);
END;
$$ LANGUAGE plpgsql STABLE;

-- Re-create policies using user ID instead of Azure AD ID
CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (
      id::TEXT = current_user_id() OR
      azure_ad_object_id = current_user_azure_id()
    );

CREATE POLICY "Authenticated users can view processes"
    ON public.processes FOR SELECT
    USING (
      current_user_id() IS NOT NULL OR
      current_user_azure_id() IS NOT NULL
    );

CREATE POLICY "Authenticated users can view systems"
    ON public.systems FOR SELECT
    USING (
      current_user_id() IS NOT NULL OR
      current_user_azure_id() IS NOT NULL
    );

CREATE POLICY "Authenticated users can view process-systems"
    ON public.process_systems FOR SELECT
    USING (
      current_user_id() IS NOT NULL OR
      current_user_azure_id() IS NOT NULL
    );

CREATE POLICY "Authenticated users can view critical operations"
    ON public.critical_operations FOR SELECT
    USING (
      current_user_id() IS NOT NULL OR
      current_user_azure_id() IS NOT NULL
    );

CREATE POLICY "Authenticated users can view controls"
    ON public.controls FOR SELECT
    USING (
      current_user_id() IS NOT NULL OR
      current_user_azure_id() IS NOT NULL
    );

CREATE POLICY "Authenticated users can view process controls"
    ON public.process_controls FOR SELECT
    USING (
      current_user_id() IS NOT NULL OR
      current_user_azure_id() IS NOT NULL
    );

CREATE POLICY "Users can view non-sensitive settings"
    ON public.settings FOR SELECT
    USING (
        (current_user_id() IS NOT NULL OR current_user_azure_id() IS NOT NULL) AND
        (is_sensitive = false OR key IN ('regions', 'bpmn_diagram', 'sync_frequency', 'last_sync_timestamp', 'nintex_api_url'))
    );

CREATE POLICY "Authenticated users can view sync history"
    ON public.sync_history FOR SELECT
    USING (
      current_user_id() IS NOT NULL OR
      current_user_azure_id() IS NOT NULL
    );

-- Add index on email for faster local user lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email_auth_type
ON public.user_profiles(email, auth_type);

COMMENT ON COLUMN public.user_profiles.password_hash IS 'Bcrypt password hash for local auth users (null for Azure AD SSO users)';
COMMENT ON COLUMN public.user_profiles.auth_type IS 'Authentication type: azure_sso (federated) or local (username/password)';
COMMENT ON CONSTRAINT check_auth_method ON public.user_profiles IS 'Ensures user has either Azure AD ID or password hash, but not both';
