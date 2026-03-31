-- Migration 010: Add progress tracking columns to sync_history
-- Required for batched sync support (all_processes sync scope)

ALTER TABLE public.sync_history ADD COLUMN IF NOT EXISTS total_processes INTEGER DEFAULT 0;
ALTER TABLE public.sync_history ADD COLUMN IF NOT EXISTS processed_count INTEGER DEFAULT 0;
ALTER TABLE public.sync_history ADD COLUMN IF NOT EXISTS current_batch INTEGER DEFAULT 0;
ALTER TABLE public.sync_history ADD COLUMN IF NOT EXISTS total_batches INTEGER DEFAULT 0;
ALTER TABLE public.sync_history ADD COLUMN IF NOT EXISTS batch_size INTEGER DEFAULT 0;
ALTER TABLE public.sync_history ADD COLUMN IF NOT EXISTS last_processed_index INTEGER DEFAULT 0;
ALTER TABLE public.sync_history ADD COLUMN IF NOT EXISTS processed_pm_ids INTEGER[] DEFAULT '{}';
ALTER TABLE public.sync_history ADD COLUMN IF NOT EXISTS examined_pm_ids INTEGER[] DEFAULT '{}';

-- Allow promasters to update sync history (for progress tracking)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'sync_history' AND policyname = 'Promasters can update sync history'
    ) THEN
        CREATE POLICY "Promasters can update sync history"
            ON public.sync_history FOR UPDATE
            USING (current_user_role() = 'promaster');
    END IF;
END $$;
