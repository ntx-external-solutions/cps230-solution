import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Filter, ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FilterState } from './utils/highlightCalculator';
import { MultiSelect } from '@/components/ui/multi-select';

interface System {
  id: string;
  system_name: string;
}

interface Control {
  id: string;
  control_id?: string | null;
  control_name?: string | null;
}

interface CriticalOperation {
  id: string;
  operation_name: string;
}

interface FiltersTopBarProps {
  systems: System[];
  regions: string[];
  controls: Control[];
  criticalOperations: CriticalOperation[];
  owners: string[];
  experts: string[];
  selectedFilters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  defaultExpanded?: boolean;
}

export function FiltersTopBar({
  systems,
  regions,
  controls,
  criticalOperations,
  owners,
  experts,
  selectedFilters,
  onFilterChange,
  defaultExpanded = true,
}: FiltersTopBarProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const clearAllFilters = () => {
    onFilterChange({
      systems: [],
      regions: [],
      controls: [],
      criticalOperations: [],
      owners: [],
      experts: [],
    });
  };

  const totalSelectedCount =
    selectedFilters.systems.length +
    selectedFilters.regions.length +
    selectedFilters.controls.length +
    selectedFilters.criticalOperations.length +
    selectedFilters.owners.length +
    selectedFilters.experts.length;

  // Prepare options for multi-selects
  const systemOptions = systems.map(s => ({ value: s.id, label: s.system_name }));
  const regionOptions = regions.map(r => ({ value: r, label: r }));
  const controlOptions = controls.map(c => ({
    value: c.id,
    label: c.control_name || c.control_id || 'Unnamed Control'
  }));
  const criticalOpOptions = criticalOperations.map(co => ({
    value: co.id,
    label: co.operation_name
  }));
  const ownerOptions = owners.map(o => ({ value: o, label: o }));
  const expertOptions = experts.map(e => ({ value: e, label: e }));

  return (
    <div className="border-b bg-background px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter Icon, Label and Collapse Toggle */}
        <button
          className="flex items-center gap-2 hover:text-foreground text-muted-foreground transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Filter className="h-4 w-4" />
          <span className="text-sm font-medium text-foreground">Filters:</span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {!isExpanded && totalSelectedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalSelectedCount} active
            </Badge>
          )}
        </button>

        {isExpanded && (
          <>
            {/* Critical Operations */}
            <div className="min-w-[200px]">
              <MultiSelect
                options={criticalOpOptions}
                selected={selectedFilters.criticalOperations}
                onChange={(values) => onFilterChange({ ...selectedFilters, criticalOperations: values })}
                placeholder="Critical Operations"
              />
            </div>

            {/* Controls */}
            <div className="min-w-[200px]">
              <MultiSelect
                options={controlOptions}
                selected={selectedFilters.controls}
                onChange={(values) => onFilterChange({ ...selectedFilters, controls: values })}
                placeholder="Controls"
              />
            </div>

            {/* Systems */}
            <div className="min-w-[200px]">
              <MultiSelect
                options={systemOptions}
                selected={selectedFilters.systems}
                onChange={(values) => onFilterChange({ ...selectedFilters, systems: values })}
                placeholder="Systems"
              />
            </div>

            {/* Regions */}
            <div className="min-w-[200px]">
              <MultiSelect
                options={regionOptions}
                selected={selectedFilters.regions}
                onChange={(values) => onFilterChange({ ...selectedFilters, regions: values })}
                placeholder="Regions"
              />
            </div>

            {/* Process Owners */}
            <div className="min-w-[200px]">
              <MultiSelect
                options={ownerOptions}
                selected={selectedFilters.owners}
                onChange={(values) => onFilterChange({ ...selectedFilters, owners: values })}
                placeholder="Process Owners"
              />
            </div>

            {/* Process Experts */}
            <div className="min-w-[200px]">
              <MultiSelect
                options={expertOptions}
                selected={selectedFilters.experts}
                onChange={(values) => onFilterChange({ ...selectedFilters, experts: values })}
                placeholder="Process Experts"
              />
            </div>

            {/* Clear All Button */}
            {totalSelectedCount > 0 && (
              <>
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {totalSelectedCount} selected
                  </Badge>
                  <Button variant="outline" size="sm" onClick={clearAllFilters} className="h-8">
                    <X className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
