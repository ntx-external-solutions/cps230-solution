-- CPS230 Critical Operations Ecosystem Database Schema
-- Adapted for Azure PostgreSQL with Azure AD B2C authentication
-- This schema supports the management of processes, systems, critical operations, and controls
-- for APRA CPS230 compliance visualization and management

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles
CREATE TYPE user_role AS ENUM ('user', 'business_analyst', 'promaster');

-- =====================================================
-- User Profiles Table
-- Stores application user data mapped from Azure AD B2C
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    azure_ad_object_id TEXT NOT NULL UNIQUE, -- Azure AD B2C object ID
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =====================================================
-- Processes Table
-- Stores processes synced from Nintex Process Manager
-- =====================================================
CREATE TABLE IF NOT EXISTS public.processes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    process_name TEXT NOT NULL,
    process_unique_id TEXT NOT NULL UNIQUE, -- From Nintex Process Manager
    owner_username TEXT,
    process_expert TEXT, -- Process expert name/email
    process_status TEXT, -- Process status (Draft, Published, Archived, etc.)
    process_owner_data JSONB, -- Full owner object from PM
    process_expert_data JSONB, -- Full expert object from PM
    input_processes TEXT[], -- Array of process IDs that feed into this process
    output_processes TEXT[], -- Array of process IDs that this process feeds into
    canvas_position JSONB, -- Stores x, y coordinates for BPMN canvas
    metadata JSONB, -- Additional metadata from Nintex
    regions TEXT[], -- Array of region identifiers (e.g., ['AU', 'UK', 'US'])
    is_cps230_tagged BOOLEAN DEFAULT FALSE, -- Flag for #CPS230 tagged processes
    tags TEXT[], -- Array of all tags from Process Manager
    inputs JSONB, -- Array of input objects with FromProcess, FromProcessUniqueId, Resource, HowUsed
    outputs JSONB, -- Array of output objects with ToProcess, ToProcessUniqueId, Output, HowUsed
    triggers JSONB, -- Array of trigger objects with Trigger, Frequency, Volume
    targets JSONB, -- Array of target objects with Measure, Target
    modified_by TEXT NOT NULL,
    modified_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =====================================================
-- Systems Table
-- Stores systems/applications used in processes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_name TEXT NOT NULL,
    system_id TEXT NOT NULL UNIQUE, -- From Nintex Process Manager
    description TEXT,
    metadata JSONB, -- Additional metadata
    modified_by TEXT NOT NULL,
    modified_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =====================================================
-- Process-System Mapping Table
-- Many-to-many relationship between processes and systems
-- =====================================================
CREATE TABLE IF NOT EXISTS public.process_systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    system_id UUID NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
    process_step TEXT, -- Which step in the process uses this system
    activity_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(process_id, system_id, process_step)
);

-- =====================================================
-- Critical Operations Table
-- Defines critical operations for CPS230 compliance
-- =====================================================
CREATE TABLE IF NOT EXISTS public.critical_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_name TEXT NOT NULL UNIQUE,
    description TEXT,
    system_id UUID REFERENCES public.systems(id) ON DELETE SET NULL,
    process_id UUID REFERENCES public.processes(id) ON DELETE SET NULL,
    color_code TEXT, -- For visual identification in the ecosystem
    modified_by TEXT NOT NULL,
    modified_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =====================================================
-- Critical Operation Processes Junction Table
-- Many-to-many relationship between critical operations and processes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.critical_operation_processes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    critical_operation_id UUID NOT NULL REFERENCES public.critical_operations(id) ON DELETE CASCADE,
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(critical_operation_id, process_id)
);

-- =====================================================
-- Critical Operation Systems Junction Table
-- Many-to-many relationship between critical operations and systems
-- =====================================================
CREATE TABLE IF NOT EXISTS public.critical_operation_systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    critical_operation_id UUID NOT NULL REFERENCES public.critical_operations(id) ON DELETE CASCADE,
    system_id UUID NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(critical_operation_id, system_id)
);

-- =====================================================
-- Controls Table
-- Defines controls that manage/govern critical operations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.controls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    control_name TEXT NOT NULL,
    description TEXT,
    critical_operation_id UUID REFERENCES public.critical_operations(id) ON DELETE SET NULL,
    process_id UUID REFERENCES public.processes(id) ON DELETE SET NULL,
    system_id UUID REFERENCES public.systems(id) ON DELETE SET NULL,
    regions TEXT[], -- Multi-select: ['AU', 'UK', 'US', etc.]
    control_type TEXT, -- Type of control
    color_code TEXT, -- For visual identification in the ecosystem
    pm_control_id TEXT, -- Process Manager control ID for sync
    modified_by TEXT NOT NULL,
    modified_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =====================================================
-- Process Controls Junction Table
-- Maps processes to controls (many-to-many)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.process_controls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    control_id UUID NOT NULL REFERENCES public.controls(id) ON DELETE CASCADE,
    process_step TEXT, -- Which step in the process uses this control
    activity_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(process_id, control_id, process_step)
);

-- =====================================================
-- Settings Table
-- Application-wide settings (Nintex API credentials, etc.)
-- Note: Sensitive values should be stored in Azure Key Vault
-- =====================================================
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    is_sensitive BOOLEAN DEFAULT false, -- Flag for Key Vault storage
    modified_by TEXT NOT NULL,
    modified_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =====================================================
-- Sync History Table
-- Tracks synchronization events with Nintex Process Manager
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sync_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type TEXT NOT NULL, -- 'full', 'incremental', 'processes', 'systems'
    status TEXT NOT NULL, -- 'success', 'failed', 'in_progress'
    records_synced INTEGER DEFAULT 0,
    error_message TEXT,
    initiated_by TEXT NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- Row Level Security (RLS) Policies
-- Note: Azure PostgreSQL supports RLS natively
-- Authentication will be handled by application logic with Azure AD B2C tokens
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;

-- Create a function to get current user's role from session variable
-- This will be set by the application after validating Azure AD B2C token
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
BEGIN
    RETURN COALESCE(
        current_setting('app.current_user_role', true)::user_role,
        'user'::user_role
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Create a function to get current user's Azure AD object ID
CREATE OR REPLACE FUNCTION public.current_user_azure_id()
RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('app.current_user_azure_id', true);
END;
$$ LANGUAGE plpgsql STABLE;

-- User Profiles Policies
CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (azure_ad_object_id = current_user_azure_id());

CREATE POLICY "Promasters can view all profiles"
    ON public.user_profiles FOR SELECT
    USING (current_user_role() = 'promaster');

CREATE POLICY "Promasters can update all profiles"
    ON public.user_profiles FOR UPDATE
    USING (current_user_role() = 'promaster');

CREATE POLICY "Promasters can insert profiles"
    ON public.user_profiles FOR INSERT
    WITH CHECK (current_user_role() = 'promaster');

-- Processes Policies (All authenticated users can view)
CREATE POLICY "Authenticated users can view processes"
    ON public.processes FOR SELECT
    USING (current_user_azure_id() IS NOT NULL);

CREATE POLICY "Business Analysts and Promasters can modify processes"
    ON public.processes FOR ALL
    USING (current_user_role() IN ('business_analyst', 'promaster'));

-- Systems Policies
CREATE POLICY "Authenticated users can view systems"
    ON public.systems FOR SELECT
    USING (current_user_azure_id() IS NOT NULL);

CREATE POLICY "Promasters can modify systems"
    ON public.systems FOR ALL
    USING (current_user_role() = 'promaster');

-- Process-Systems Policies
CREATE POLICY "Authenticated users can view process-systems"
    ON public.process_systems FOR SELECT
    USING (current_user_azure_id() IS NOT NULL);

CREATE POLICY "Promasters can modify process-systems"
    ON public.process_systems FOR ALL
    USING (current_user_role() = 'promaster');

-- Critical Operations Policies
CREATE POLICY "Authenticated users can view critical operations"
    ON public.critical_operations FOR SELECT
    USING (current_user_azure_id() IS NOT NULL);

CREATE POLICY "Promasters can modify critical operations"
    ON public.critical_operations FOR ALL
    USING (current_user_role() = 'promaster');

-- Controls Policies
CREATE POLICY "Authenticated users can view controls"
    ON public.controls FOR SELECT
    USING (current_user_azure_id() IS NOT NULL);

CREATE POLICY "Promasters can modify controls"
    ON public.controls FOR ALL
    USING (current_user_role() = 'promaster');

-- Process Controls Policies
CREATE POLICY "Authenticated users can view process controls"
    ON public.process_controls FOR SELECT
    USING (current_user_azure_id() IS NOT NULL);

CREATE POLICY "Promasters can modify process controls"
    ON public.process_controls FOR ALL
    USING (current_user_role() = 'promaster');

-- Settings Policies
CREATE POLICY "Promasters can view all settings"
    ON public.settings FOR SELECT
    USING (current_user_role() = 'promaster');

CREATE POLICY "Users can view non-sensitive settings"
    ON public.settings FOR SELECT
    USING (
        current_user_azure_id() IS NOT NULL AND
        (is_sensitive = false OR key IN ('regions', 'bpmn_diagram', 'sync_frequency', 'last_sync_timestamp', 'nintex_api_url'))
    );

CREATE POLICY "Promasters can modify settings"
    ON public.settings FOR ALL
    USING (current_user_role() = 'promaster');

-- Sync History Policies
CREATE POLICY "Authenticated users can view sync history"
    ON public.sync_history FOR SELECT
    USING (current_user_azure_id() IS NOT NULL);

CREATE POLICY "Promasters can insert sync history"
    ON public.sync_history FOR INSERT
    WITH CHECK (current_user_role() = 'promaster');

-- =====================================================
-- Functions and Triggers
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_profiles updated_at
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- Indexes for Performance
-- =====================================================

CREATE INDEX idx_user_profiles_azure_id ON public.user_profiles(azure_ad_object_id);
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX idx_processes_unique_id ON public.processes(process_unique_id);
CREATE INDEX idx_processes_owner ON public.processes(owner_username);
CREATE INDEX idx_processes_expert ON public.processes(process_expert);
CREATE INDEX idx_processes_status ON public.processes(process_status);
CREATE INDEX idx_processes_cps230_tagged ON public.processes(is_cps230_tagged);
CREATE INDEX idx_processes_tags ON public.processes USING GIN(tags);
CREATE INDEX idx_processes_inputs ON public.processes USING GIN(inputs);
CREATE INDEX idx_processes_outputs ON public.processes USING GIN(outputs);
CREATE INDEX idx_processes_triggers ON public.processes USING GIN(triggers);
CREATE INDEX idx_processes_targets ON public.processes USING GIN(targets);
CREATE INDEX idx_systems_system_id ON public.systems(system_id);
CREATE INDEX idx_critical_operations_name ON public.critical_operations(operation_name);
CREATE INDEX idx_process_systems_process ON public.process_systems(process_id);
CREATE INDEX idx_process_systems_system ON public.process_systems(system_id);
CREATE INDEX idx_process_controls_process ON public.process_controls(process_id);
CREATE INDEX idx_process_controls_control ON public.process_controls(control_id);
CREATE INDEX idx_controls_critical_operation ON public.controls(critical_operation_id);
CREATE INDEX idx_sync_history_status ON public.sync_history(status);
CREATE INDEX idx_settings_key ON public.settings(key);

-- =====================================================
-- Initial Data / Seed
-- =====================================================

-- Insert default settings
INSERT INTO public.settings (key, value, description, is_sensitive, modified_by) VALUES
    ('nintex_api_url', '""', 'Nintex Process Manager API base URL', false, 'system'),
    ('nintex_api_credentials', '{"username": "", "password": ""}', 'Nintex Process Manager API credentials (store in Key Vault)', true, 'system'),
    ('regions', '[{"name": "AU", "label": "Australia"}, {"name": "UK", "label": "United Kingdom"}, {"name": "US", "label": "United States"}, {"name": "NZ", "label": "New Zealand"}, {"name": "SG", "label": "Singapore"}]', 'Available regions for assignment to processes and controls', false, 'system'),
    ('sync_frequency', '"manual"', 'How often to sync with Nintex (manual, daily, weekly)', false, 'system'),
    ('last_sync_timestamp', 'null', 'Timestamp of last successful sync', false, 'system')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- Grant permissions to the application role
-- This should be run after creating the application database user
-- =====================================================
-- GRANT USAGE ON SCHEMA public TO cps230_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cps230_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cps230_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO cps230_app;
