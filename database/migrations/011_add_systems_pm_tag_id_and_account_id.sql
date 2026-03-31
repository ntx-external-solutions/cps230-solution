-- Migration 011: Add pm_tag_id and account_id to systems table,
-- and account_id to processes table, modified_by to process_systems
-- Required for sync-process-manager system tag linking

-- Systems table: add pm_tag_id for linking to Nintex PM tag IDs
ALTER TABLE public.systems ADD COLUMN IF NOT EXISTS pm_tag_id TEXT;
ALTER TABLE public.systems ADD COLUMN IF NOT EXISTS account_id UUID;

-- Add unique constraint on (system_id, account_id) if not exists
-- First drop the old unique constraint on system_id alone if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'systems_system_id_key' AND conrelid = 'public.systems'::regclass
    ) THEN
        ALTER TABLE public.systems DROP CONSTRAINT systems_system_id_key;
    END IF;
END $$;

-- Create composite unique constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'systems_system_id_account_id_key' AND conrelid = 'public.systems'::regclass
    ) THEN
        ALTER TABLE public.systems ADD CONSTRAINT systems_system_id_account_id_key UNIQUE (system_id, account_id);
    END IF;
END $$;

-- Processes table: add account_id if not exists
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS account_id UUID;

-- Process_systems table: add modified_by if not exists
ALTER TABLE public.process_systems ADD COLUMN IF NOT EXISTS modified_by TEXT;

-- Update the unique constraint on process_systems to just (process_id, system_id)
-- since the sync code uses ON CONFLICT (process_id, system_id)
DO $$
BEGIN
    -- Drop old constraint that includes process_step
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'process_systems_process_id_system_id_process_step_key'
        AND conrelid = 'public.process_systems'::regclass
    ) THEN
        ALTER TABLE public.process_systems DROP CONSTRAINT process_systems_process_id_system_id_process_step_key;
    END IF;

    -- Add simpler constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'process_systems_process_id_system_id_key'
        AND conrelid = 'public.process_systems'::regclass
    ) THEN
        ALTER TABLE public.process_systems ADD CONSTRAINT process_systems_process_id_system_id_key UNIQUE (process_id, system_id);
    END IF;
END $$;

-- Index for pm_tag_id lookups
CREATE INDEX IF NOT EXISTS idx_systems_pm_tag_id ON public.systems(pm_tag_id);
