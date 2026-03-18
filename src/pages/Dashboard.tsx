import { AppLayout } from '@/components/AppLayout';
import { BpmnCanvas } from '@/components/bpmn/BpmnCanvas';
import { FiltersTopBar } from '@/components/bpmn/FiltersTopBar';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FilterState } from '@/components/bpmn/utils/highlightCalculator';
import { useAuth } from '@/contexts/AuthContext';
import { systemsApi, processesApi, controlsApi, criticalOperationsApi, regionsApi } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';

interface Process {
  id: string;
  process_name: string;
  process_unique_id: string;
  pm_process_id: number;
  owner_username: string | null;
  input_processes: string[] | null;
  output_processes: string[] | null;
  canvas_position: { x: number; y: number } | null;
  regions: string[] | null;
}

interface System {
  id: string;
  system_name: string;
  pm_tag_id: string;
}

interface Control {
  id: string;
  control_id: string | null;
  control_name: string | null;
}

interface CriticalOperation {
  id: string;
  operation_name: string;
}

interface Region {
  name: string;
  label: string;
  icon?: string;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [filters, setFilters] = useState<FilterState>({
    systems: [],
    regions: [],
    controls: [],
    criticalOperations: [],
    owners: [],
    experts: []
  });

  // Fetch settings
  const { data: settings = [] } = useSettings(['regions', 'dashboard_filters_expanded']);

  // Extract values from settings
  const dashboardFiltersExpanded = settings.find(s => s.key === 'dashboard_filters_expanded')?.value as boolean ?? true;

  // Fetch all systems
  const { data: systems, isLoading: systemsLoading } = useQuery({
    queryKey: ['systems'],
    queryFn: () => systemsApi.getAll(),
  });

  // Fetch all processes with related data
  const { data: processes, isLoading: processesLoading } = useQuery({
    queryKey: ['processes-with-relations'],
    queryFn: () => processesApi.getAll(),
  });

  // Fetch all controls
  const { data: controls, isLoading: controlsLoading } = useQuery({
    queryKey: ['controls'],
    queryFn: () => controlsApi.getAll(),
  });

  // Fetch all critical operations
  const { data: criticalOperations, isLoading: criticalOpsLoading } = useQuery({
    queryKey: ['critical-operations'],
    queryFn: () => criticalOperationsApi.getAll(),
  });

  // Fetch all regions
  const { data: regionsData, isLoading: regionsLoading } = useQuery({
    queryKey: ['regions'],
    queryFn: () => regionsApi.getAll(),
  });

  // Extract region codes from regions data
  const regions = (regionsData || []).map((r: any) => r.region_code);

  // Extract unique owners and experts from processes
  const owners = Array.from(
    new Set(
      (processes || [])
        .map(p => p.owner_username)
        .filter((owner): owner is string => owner !== null && owner !== undefined && owner.trim() !== '')
    )
  ).sort();

  const experts = Array.from(
    new Set(
      (processes || [])
        .map(p => (p as any).process_expert)
        .filter((expert): expert is string => expert !== null && expert !== undefined && expert.trim() !== '')
    )
  ).sort();

  const isLoading = systemsLoading || processesLoading || controlsLoading || criticalOpsLoading || regionsLoading;

  const userRole = profile?.role || 'user';

  return (
    <AppLayout>
      <div className="-m-6 h-[calc(100vh-4rem)]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Filters Top Bar */}
            <FiltersTopBar
              systems={systems || []}
              regions={regions}
              controls={controls || []}
              criticalOperations={criticalOperations || []}
              owners={owners}
              experts={experts}
              selectedFilters={filters}
              onFilterChange={setFilters}
              defaultExpanded={dashboardFiltersExpanded}
            />

            {/* BPMN Canvas */}
            <div className="flex-1 overflow-hidden">
              {processes && processes.length > 0 ? (
                <BpmnCanvas
                  processes={processes}
                  userRole={userRole as 'promaster' | 'business_analyst' | 'user'}
                  filters={filters}
                />
              ) : (
                <div className="flex h-full items-center justify-center border-2 border-dashed border-muted-foreground/25 bg-muted/10">
                  <div className="text-center space-y-2">
                    <p className="text-lg font-medium text-muted-foreground">
                      No processes found
                    </p>
                    <p className="text-sm text-muted-foreground/75">
                      Sync processes from Nintex Process Manager in Settings
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
