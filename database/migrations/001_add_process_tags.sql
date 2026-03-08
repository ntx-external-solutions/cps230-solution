-- Migration: Add tag tracking to processes table
-- Date: 2026-03-07
-- Purpose: Support syncing all processes and flagging #CPS230 tagged ones

-- Add is_cps230_tagged column to track processes with #CPS230 tag
ALTER TABLE processes ADD COLUMN IF NOT EXISTS is_cps230_tagged BOOLEAN DEFAULT FALSE;

-- Add tags array column to store all tags from Process Manager
ALTER TABLE processes ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Create index on is_cps230_tagged for filtering
CREATE INDEX IF NOT EXISTS idx_processes_cps230_tagged ON processes(is_cps230_tagged);

-- Create index on tags for searching
CREATE INDEX IF NOT EXISTS idx_processes_tags ON processes USING GIN(tags);

-- Update existing processes to set is_cps230_tagged = TRUE
-- (assumes all existing processes were synced with #CPS230 tag)
UPDATE processes SET is_cps230_tagged = TRUE WHERE is_cps230_tagged IS NULL OR is_cps230_tagged = FALSE;

-- Add comment explaining the columns
COMMENT ON COLUMN processes.is_cps230_tagged IS 'Flag indicating if this process has the #CPS230 tag in Process Manager';
COMMENT ON COLUMN processes.tags IS 'Array of all tags associated with this process from Process Manager';
