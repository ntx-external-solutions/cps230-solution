-- =====================================================
-- Migration 007: Add Many-to-Many Relationships for Critical Operations
-- Creates junction tables for critical_operations <-> processes and critical_operations <-> systems
-- =====================================================

-- Create junction table for critical operations and processes
CREATE TABLE IF NOT EXISTS public.critical_operation_processes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    critical_operation_id UUID NOT NULL REFERENCES public.critical_operations(id) ON DELETE CASCADE,
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(critical_operation_id, process_id)
);

-- Create junction table for critical operations and systems
CREATE TABLE IF NOT EXISTS public.critical_operation_systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    critical_operation_id UUID NOT NULL REFERENCES public.critical_operations(id) ON DELETE CASCADE,
    system_id UUID NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(critical_operation_id, system_id)
);

-- Migrate existing data from single foreign keys to junction tables
-- Only migrate if there are existing relationships
INSERT INTO public.critical_operation_processes (critical_operation_id, process_id)
SELECT id, process_id
FROM public.critical_operations
WHERE process_id IS NOT NULL
ON CONFLICT (critical_operation_id, process_id) DO NOTHING;

INSERT INTO public.critical_operation_systems (critical_operation_id, system_id)
SELECT id, system_id
FROM public.critical_operations
WHERE system_id IS NOT NULL
ON CONFLICT (critical_operation_id, system_id) DO NOTHING;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_critical_operation_processes_critical_operation_id
    ON public.critical_operation_processes(critical_operation_id);
CREATE INDEX IF NOT EXISTS idx_critical_operation_processes_process_id
    ON public.critical_operation_processes(process_id);

CREATE INDEX IF NOT EXISTS idx_critical_operation_systems_critical_operation_id
    ON public.critical_operation_systems(critical_operation_id);
CREATE INDEX IF NOT EXISTS idx_critical_operation_systems_system_id
    ON public.critical_operation_systems(system_id);

-- Enable RLS on junction tables
ALTER TABLE public.critical_operation_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_operation_systems ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for critical_operation_processes
-- Users can view all critical operation processes
CREATE POLICY critical_operation_processes_select_policy ON public.critical_operation_processes
    FOR SELECT
    USING (true);

-- Only promasters can insert/update/delete
CREATE POLICY critical_operation_processes_insert_policy ON public.critical_operation_processes
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = current_setting('app.user_id')::uuid
            AND role = 'promaster'
        )
    );

CREATE POLICY critical_operation_processes_delete_policy ON public.critical_operation_processes
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = current_setting('app.user_id')::uuid
            AND role = 'promaster'
        )
    );

-- Create RLS policies for critical_operation_systems
-- Users can view all critical operation systems
CREATE POLICY critical_operation_systems_select_policy ON public.critical_operation_systems
    FOR SELECT
    USING (true);

-- Only promasters can insert/update/delete
CREATE POLICY critical_operation_systems_insert_policy ON public.critical_operation_systems
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = current_setting('app.user_id')::uuid
            AND role = 'promaster'
        )
    );

CREATE POLICY critical_operation_systems_delete_policy ON public.critical_operation_systems
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = current_setting('app.user_id')::uuid
            AND role = 'promaster'
        )
    );

-- Add comments for documentation
COMMENT ON TABLE public.critical_operation_processes IS 'Junction table for many-to-many relationship between critical operations and processes';
COMMENT ON TABLE public.critical_operation_systems IS 'Junction table for many-to-many relationship between critical operations and systems';

-- Note: We're keeping the original process_id and system_id columns in critical_operations
-- for backwards compatibility. They can be removed in a future migration if needed.
