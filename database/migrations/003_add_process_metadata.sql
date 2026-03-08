-- Migration: Add process metadata fields (inputs, outputs, triggers, targets)
-- Description: Adds JSONB columns to store process inputs, outputs, triggers, and targets from Process Manager
-- Created: 2026-03-08

-- Add columns for process metadata
ALTER TABLE processes ADD COLUMN IF NOT EXISTS inputs JSONB;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS outputs JSONB;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS triggers JSONB;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS targets JSONB;

-- Add comments for documentation
COMMENT ON COLUMN processes.inputs IS 'Array of input objects with FromProcess, FromProcessUniqueId, Resource, and HowUsed fields';
COMMENT ON COLUMN processes.outputs IS 'Array of output objects with ToProcess, ToProcessUniqueId, Output, and HowUsed fields';
COMMENT ON COLUMN processes.triggers IS 'Array of trigger objects with Trigger, Frequency, and Volume fields';
COMMENT ON COLUMN processes.targets IS 'Array of target objects with Measure and Target fields';

-- Create indexes for JSONB querying
CREATE INDEX IF NOT EXISTS idx_processes_inputs ON processes USING GIN(inputs);
CREATE INDEX IF NOT EXISTS idx_processes_outputs ON processes USING GIN(outputs);
CREATE INDEX IF NOT EXISTS idx_processes_triggers ON processes USING GIN(triggers);
CREATE INDEX IF NOT EXISTS idx_processes_targets ON processes USING GIN(targets);
