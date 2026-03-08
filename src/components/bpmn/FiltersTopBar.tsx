import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronUp, X, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FilterState } from './utils/highlightCalculator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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
}: FiltersTopBarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSystemToggle = (systemId: string) => {
    const newSystems = selectedFilters.systems.includes(systemId)
      ? selectedFilters.systems.filter((id) => id !== systemId)
      : [...selectedFilters.systems, systemId];

    onFilterChange({ ...selectedFilters, systems: newSystems });
  };

  const handleRegionToggle = (region: string) => {
    const newRegions = selectedFilters.regions.includes(region)
      ? selectedFilters.regions.filter((r) => r !== region)
      : [...selectedFilters.regions, region];

    onFilterChange({ ...selectedFilters, regions: newRegions });
  };

  const handleControlToggle = (controlId: string) => {
    const newControls = selectedFilters.controls.includes(controlId)
      ? selectedFilters.controls.filter((id) => id !== controlId)
      : [...selectedFilters.controls, controlId];

    onFilterChange({ ...selectedFilters, controls: newControls });
  };

  const handleCriticalOpToggle = (opId: string) => {
    const newOps = selectedFilters.criticalOperations.includes(opId)
      ? selectedFilters.criticalOperations.filter((id) => id !== opId)
      : [...selectedFilters.criticalOperations, opId];

    onFilterChange({ ...selectedFilters, criticalOperations: newOps });
  };

  const handleOwnerToggle = (owner: string) => {
    const newOwners = selectedFilters.owners.includes(owner)
      ? selectedFilters.owners.filter((o) => o !== owner)
      : [...selectedFilters.owners, owner];

    onFilterChange({ ...selectedFilters, owners: newOwners });
  };

  const handleExpertToggle = (expert: string) => {
    const newExperts = selectedFilters.experts.includes(expert)
      ? selectedFilters.experts.filter((e) => e !== expert)
      : [...selectedFilters.experts, expert];

    onFilterChange({ ...selectedFilters, experts: newExperts });
  };

  const clearAllFilters = () => {
    onFilterChange({
      systems: [],
      regions: [],
      controls: [],
      criticalOperations: [],
      owners: [],
      experts: [],
    });
    setSearchQuery('');
  };

  const totalSelectedCount =
    selectedFilters.systems.length +
    selectedFilters.regions.length +
    selectedFilters.controls.length +
    selectedFilters.criticalOperations.length +
    selectedFilters.owners.length +
    selectedFilters.experts.length;

  // Filter items based on search
  const filteredSystems = systems.filter((s) =>
    s.system_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredRegions = regions.filter((r) =>
    r.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredControls = controls.filter(
    (c) =>
      (c.control_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (c.control_id?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );
  const filteredCriticalOps = criticalOperations.filter((co) =>
    co.operation_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredOwners = owners.filter((o) =>
    o.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredExperts = experts.filter((e) =>
    e.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="border-b bg-background">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 ml-2" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-2" />
            )}
          </Button>

          {totalSelectedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalSelectedCount} selected
            </Badge>
          )}

          {!isExpanded && totalSelectedCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {selectedFilters.criticalOperations.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {selectedFilters.criticalOperations.length} Critical Ops
                </Badge>
              )}
              {selectedFilters.controls.length > 0 && (
                <Badge variant="default" className="text-xs bg-blue-600">
                  {selectedFilters.controls.length} Controls
                </Badge>
              )}
              {selectedFilters.systems.length > 0 && (
                <Badge variant="default" className="text-xs bg-green-600">
                  {selectedFilters.systems.length} Systems
                </Badge>
              )}
              {selectedFilters.regions.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedFilters.regions.length} Regions
                </Badge>
              )}
              {selectedFilters.owners.length > 0 && (
                <Badge variant="default" className="text-xs bg-purple-600">
                  {selectedFilters.owners.length} Owners
                </Badge>
              )}
              {selectedFilters.experts.length > 0 && (
                <Badge variant="default" className="text-xs bg-orange-600">
                  {selectedFilters.experts.length} Experts
                </Badge>
              )}
            </div>
          )}
        </div>

        {totalSelectedCount > 0 && (
          <Button variant="outline" size="sm" onClick={clearAllFilters} className="h-8">
            <X className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        )}
      </div>

      {/* Expandable Filter Content */}
      <Collapsible open={isExpanded}>
        <CollapsibleContent>
          <div className="p-4 space-y-4">
            {/* Search Bar */}
            <div className="max-w-md">
              <Input
                placeholder="Search filters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Filter Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Critical Operations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Critical Operations</h4>
                  {selectedFilters.criticalOperations.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {selectedFilters.criticalOperations.length}
                    </Badge>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-3 bg-background">
                  {filteredCriticalOps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No critical operations found</p>
                  ) : (
                    filteredCriticalOps.map((op) => (
                      <div key={op.id} className="flex items-start space-x-2">
                        <Checkbox
                          id={`criticalop-${op.id}`}
                          checked={selectedFilters.criticalOperations.includes(op.id)}
                          onCheckedChange={() => handleCriticalOpToggle(op.id)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`criticalop-${op.id}`}
                          className="text-sm font-normal cursor-pointer flex-1 break-words leading-tight"
                        >
                          {op.operation_name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Controls</h4>
                  {selectedFilters.controls.length > 0 && (
                    <Badge variant="default" className="text-xs bg-blue-600">
                      {selectedFilters.controls.length}
                    </Badge>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-3 bg-background">
                  {filteredControls.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No controls found</p>
                  ) : (
                    filteredControls.map((control) => (
                      <div key={control.id} className="flex items-start space-x-2">
                        <Checkbox
                          id={`control-${control.id}`}
                          checked={selectedFilters.controls.includes(control.id)}
                          onCheckedChange={() => handleControlToggle(control.id)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`control-${control.id}`}
                          className="text-sm font-normal cursor-pointer flex-1 break-words leading-tight"
                        >
                          {control.control_name || control.control_id || 'Unnamed Control'}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Systems */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Systems</h4>
                  {selectedFilters.systems.length > 0 && (
                    <Badge variant="default" className="text-xs bg-green-600">
                      {selectedFilters.systems.length}
                    </Badge>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-3 bg-background">
                  {filteredSystems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No systems found</p>
                  ) : (
                    filteredSystems.map((system) => (
                      <div key={system.id} className="flex items-start space-x-2">
                        <Checkbox
                          id={`system-${system.id}`}
                          checked={selectedFilters.systems.includes(system.id)}
                          onCheckedChange={() => handleSystemToggle(system.id)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`system-${system.id}`}
                          className="text-sm font-normal cursor-pointer flex-1 break-words leading-tight"
                        >
                          {system.system_name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Regions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Regions</h4>
                  {selectedFilters.regions.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedFilters.regions.length}
                    </Badge>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-3 bg-background">
                  {filteredRegions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No regions found</p>
                  ) : (
                    filteredRegions.map((region) => (
                      <div key={region} className="flex items-start space-x-2">
                        <Checkbox
                          id={`region-${region}`}
                          checked={selectedFilters.regions.includes(region)}
                          onCheckedChange={() => handleRegionToggle(region)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`region-${region}`}
                          className="text-sm font-normal cursor-pointer flex-1 break-words leading-tight"
                        >
                          {region}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Process Owners */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Process Owners</h4>
                  {selectedFilters.owners.length > 0 && (
                    <Badge variant="default" className="text-xs bg-purple-600">
                      {selectedFilters.owners.length}
                    </Badge>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-3 bg-background">
                  {filteredOwners.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No owners found</p>
                  ) : (
                    filteredOwners.map((owner) => (
                      <div key={owner} className="flex items-start space-x-2">
                        <Checkbox
                          id={`owner-${owner}`}
                          checked={selectedFilters.owners.includes(owner)}
                          onCheckedChange={() => handleOwnerToggle(owner)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`owner-${owner}`}
                          className="text-sm font-normal cursor-pointer flex-1 break-words leading-tight"
                        >
                          {owner}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Process Experts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Process Experts</h4>
                  {selectedFilters.experts.length > 0 && (
                    <Badge variant="default" className="text-xs bg-orange-600">
                      {selectedFilters.experts.length}
                    </Badge>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-3 bg-background">
                  {filteredExperts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No experts found</p>
                  ) : (
                    filteredExperts.map((expert) => (
                      <div key={expert} className="flex items-start space-x-2">
                        <Checkbox
                          id={`expert-${expert}`}
                          checked={selectedFilters.experts.includes(expert)}
                          onCheckedChange={() => handleExpertToggle(expert)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`expert-${expert}`}
                          className="text-sm font-normal cursor-pointer flex-1 break-words leading-tight"
                        >
                          {expert}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
