-- =====================================================
-- Migration 008: Add color_code to Controls Table
-- =====================================================

-- Add color_code column to controls table
ALTER TABLE public.controls
ADD COLUMN IF NOT EXISTS color_code TEXT;

-- Add comment
COMMENT ON COLUMN public.controls.color_code IS 'Color code for visual identification in the ecosystem';
