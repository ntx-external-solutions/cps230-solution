-- Migration: Add regions table
-- Regions are extracted from role names during Process Manager sync
-- Similar to systems, but extracted from roles like "Team - UK", "Team Name - AU", etc.

CREATE TABLE IF NOT EXISTS public.regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code VARCHAR(10) NOT NULL UNIQUE,
  region_name VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  modified_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  modified_by VARCHAR(255)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_regions_code ON public.regions(region_code);

-- Enable RLS
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view regions"
  ON public.regions FOR SELECT
  USING (
    current_user_id() IS NOT NULL OR
    current_user_azure_id() IS NOT NULL
  );

CREATE POLICY "Promasters can insert regions"
  ON public.regions FOR INSERT
  WITH CHECK (
    current_user_role() = 'promaster'
  );

CREATE POLICY "Promasters can update regions"
  ON public.regions FOR UPDATE
  USING (
    current_user_role() = 'promaster'
  );

CREATE POLICY "Promasters can delete regions"
  ON public.regions FOR DELETE
  USING (
    current_user_role() = 'promaster'
  );

COMMENT ON TABLE public.regions IS 'Geographic regions extracted from Process Manager role names and manually managed';
COMMENT ON COLUMN public.regions.region_code IS 'Short region code (e.g., UK, AU, US) extracted from role names like "Team - UK"';
COMMENT ON COLUMN public.regions.region_name IS 'Full region name (optional, user-defined)';
