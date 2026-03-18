-- Migration: Add many-to-many relationships for controls
-- This migration creates junction tables for controls to support multiple
-- critical operations, processes, and systems per control

-- =====================================================
-- 1. Create junction table: control_critical_operations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.control_critical_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    control_id UUID NOT NULL REFERENCES public.controls(id) ON DELETE CASCADE,
    critical_operation_id UUID NOT NULL REFERENCES public.critical_operations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    modified_by VARCHAR(255),
    UNIQUE(control_id, critical_operation_id)
);

-- =====================================================
-- 2. Create junction table: control_processes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.control_processes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    control_id UUID NOT NULL REFERENCES public.controls(id) ON DELETE CASCADE,
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    modified_by VARCHAR(255),
    UNIQUE(control_id, process_id)
);

-- =====================================================
-- 3. Create junction table: control_systems
-- =====================================================
CREATE TABLE IF NOT EXISTS public.control_systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    control_id UUID NOT NULL REFERENCES public.controls(id) ON DELETE CASCADE,
    system_id UUID NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    modified_by VARCHAR(255),
    UNIQUE(control_id, system_id)
);

-- =====================================================
-- 4. Migrate existing data from single foreign keys
-- =====================================================

-- Migrate critical_operation_id to junction table
INSERT INTO public.control_critical_operations (control_id, critical_operation_id, modified_by)
SELECT id, critical_operation_id, modified_by
FROM public.controls
WHERE critical_operation_id IS NOT NULL
ON CONFLICT (control_id, critical_operation_id) DO NOTHING;

-- Migrate process_id to junction table
INSERT INTO public.control_processes (control_id, process_id, modified_by)
SELECT id, process_id, modified_by
FROM public.controls
WHERE process_id IS NOT NULL
ON CONFLICT (control_id, process_id) DO NOTHING;

-- Migrate system_id to junction table
INSERT INTO public.control_systems (control_id, system_id, modified_by)
SELECT id, system_id, modified_by
FROM public.controls
WHERE system_id IS NOT NULL
ON CONFLICT (control_id, system_id) DO NOTHING;

-- =====================================================
-- 5. Create indexes for performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_control_critical_operations_control ON public.control_critical_operations(control_id);
CREATE INDEX IF NOT EXISTS idx_control_critical_operations_critical_operation ON public.control_critical_operations(critical_operation_id);

CREATE INDEX IF NOT EXISTS idx_control_processes_control ON public.control_processes(control_id);
CREATE INDEX IF NOT EXISTS idx_control_processes_process ON public.control_processes(process_id);

CREATE INDEX IF NOT EXISTS idx_control_systems_control ON public.control_systems(control_id);
CREATE INDEX IF NOT EXISTS idx_control_systems_system ON public.control_systems(system_id);

-- =====================================================
-- 6. Enable Row-Level Security
-- =====================================================
ALTER TABLE public.control_critical_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_systems ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. Create RLS Policies for control_critical_operations
-- =====================================================
CREATE POLICY "Authenticated users can view control-critical operations"
    ON public.control_critical_operations FOR SELECT
    USING (TRUE);

CREATE POLICY "Promasters and analysts can manage control-critical operations"
    ON public.control_critical_operations FOR ALL
    USING (current_setting('app.user_role', TRUE) IN ('promaster', 'business_analyst'));

-- =====================================================
-- 8. Create RLS Policies for control_processes
-- =====================================================
CREATE POLICY "Authenticated users can view control-processes"
    ON public.control_processes FOR SELECT
    USING (TRUE);

CREATE POLICY "Promasters and analysts can manage control-processes"
    ON public.control_processes FOR ALL
    USING (current_setting('app.user_role', TRUE) IN ('promaster', 'business_analyst'));

-- =====================================================
-- 9. Create RLS Policies for control_systems
-- =====================================================
CREATE POLICY "Authenticated users can view control-systems"
    ON public.control_systems FOR SELECT
    USING (TRUE);

CREATE POLICY "Promasters and analysts can manage control-systems"
    ON public.control_systems FOR ALL
    USING (current_setting('app.user_role', TRUE) IN ('promaster', 'business_analyst'));

-- =====================================================
-- 10. Add comments for documentation
-- =====================================================
COMMENT ON TABLE public.control_critical_operations IS 'Junction table linking controls to critical operations (many-to-many)';
COMMENT ON TABLE public.control_processes IS 'Junction table linking controls to processes (many-to-many)';
COMMENT ON TABLE public.control_systems IS 'Junction table linking controls to systems (many-to-many)';

-- Note: We keep the original foreign key columns (critical_operation_id, process_id, system_id)
-- in the controls table for backward compatibility, but they should be considered deprecated.
-- New code should use the junction tables instead.
