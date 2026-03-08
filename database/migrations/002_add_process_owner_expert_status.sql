-- Migration: Add Process Owner, Expert, and Status fields
-- Date: 2026-03-07
-- Purpose: Surface process ownership and status information from Process Manager

-- Add process_expert column to store the process expert name/email
ALTER TABLE processes ADD COLUMN IF NOT EXISTS process_expert TEXT;

-- Add process_status column to store the process status (Draft, Published, Archived, etc.)
ALTER TABLE processes ADD COLUMN IF NOT EXISTS process_status TEXT;

-- Add process_owner_data JSONB column to store full owner object if needed
ALTER TABLE processes ADD COLUMN IF NOT EXISTS process_owner_data JSONB;

-- Add process_expert_data JSONB column to store full expert object if needed
ALTER TABLE processes ADD COLUMN IF NOT EXISTS process_expert_data JSONB;

-- Create index on process_expert for filtering and searching
CREATE INDEX IF NOT EXISTS idx_processes_expert ON processes(process_expert);

-- Create index on process_status for filtering
CREATE INDEX IF NOT EXISTS idx_processes_status ON processes(process_status);

-- Add comments explaining the columns
COMMENT ON COLUMN processes.process_expert IS 'Name or email of the process expert from Process Manager';
COMMENT ON COLUMN processes.process_status IS 'Status of the process (e.g., Draft, Published, Archived)';
COMMENT ON COLUMN processes.process_owner_data IS 'Full owner object from Process Manager stored as JSONB';
COMMENT ON COLUMN processes.process_expert_data IS 'Full expert object from Process Manager stored as JSONB';
