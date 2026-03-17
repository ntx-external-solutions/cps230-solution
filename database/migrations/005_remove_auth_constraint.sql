-- Migration: Remove check_auth_method constraint to support unified authentication
-- This allows users to have both Azure AD SSO and local password authentication
-- The auth_type field tracks which method is currently being used

-- Drop the constraint if it exists (idempotent)
ALTER TABLE public.user_profiles
DROP CONSTRAINT IF EXISTS check_auth_method;

-- Update column comments to reflect new behavior
COMMENT ON COLUMN public.user_profiles.password_hash IS 'Bcrypt password hash for local auth users (can coexist with Azure AD SSO for unified authentication)';
COMMENT ON COLUMN public.user_profiles.auth_type IS 'Authentication type: azure_sso (federated) or local (username/password) - users can have both methods available';
