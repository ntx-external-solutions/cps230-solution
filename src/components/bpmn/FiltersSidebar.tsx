import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight, X, Filter, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FilterState } from './utils/highlightCalculator';

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

interface FiltersSidebarProps {
  systems: System[];
  regions: string[];
  controls: Control[];
  criticalOperations: CriticalOperation[];
  selectedFilters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

export function FiltersSidebar({
  systems,
  regions,
  controls,
  criticalOperations,
  selectedFilters,
  onFilterChange,
  onSave,
  isSaving
}: FiltersSidebarProps) {
  const [expandedSections, setExpandedSections] = useState({
    criticalOps: true,
    controls: false,
    systems: false,
    regions: false
  });
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSystemToggle = (systemId: string) => {
    const newSystems = selectedFilters.systems.includes(systemId)
      ? selectedFilters.systems.filter(id => id !== systemId)
      : [...selectedFilters.systems, systemId];

    onFilterChange({ ...selectedFilters, systems: newSystems });
  };

  const handleRegionToggle = (region: string) => {
    const newRegions = selectedFilters.regions.includes(region)
      ? selectedFilters.regions.filter(r => r !== region)
      : [...selectedFilters.regions, region];

    onFilterChange({ ...selectedFilters, regions: newRegions });
  };

  const handleControlToggle = (controlId: string) => {
    const newControls = selectedFilters.controls.includes(controlId)
      ? selectedFilters.controls.filter(id => id !== controlId)
      : [...selectedFilters.controls, controlId];

    onFilterChange({ ...selectedFilters, controls: newControls });
  };

  const handleCriticalOpToggle = (opId: string) => {
    const newOps = selectedFilters.criticalOperations.includes(opId)
      ? selectedFilters.criticalOperations.filter(id => id !== opId)
      : [...selectedFilters.criticalOperations, opId];

    onFilterChange({ ...selectedFilters, criticalOperations: newOps });
  };

  const clearAllFilters = () => {
    onFilterChange({
      systems: [],
      regions: [],
      controls: [],
      criticalOperations: []
    });
    setSearchQuery('');
  };

  const totalSelectedCount =
    selectedFilters.systems.length +
    selectedFilters.regions.length +
    selectedFilters.controls.length +
    selectedFilters.criticalOperations.length;

  // Filter items based on search
  const filteredSystems = systems.filter(s =>
    s.system_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredRegions = regions.filter(r =>
    r.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredControls = controls.filter(c =>
    (c.control_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (c.control_id?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );
  const filteredCriticalOps = criticalOperations.filter(co =>
    co.operation_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-64 border-r bg-background flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <h3 className="font-semibold">Filters</h3>
          </div>
          {totalSelectedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalSelectedCount}
            </Badge>
          )}
        </div>

        <Input
          placeholder="Search filters..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="text-sm"
        />
      </div>

      {/* Filter Sections */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Critical Operations Filter */}
        <Card>
          <CardHeader className="p-3 cursor-pointer" onClick={() => toggleSection('criticalOps')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {expandedSections.criticalOps ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <CardTitle className="text-sm">Critical Operations</CardTitle>
              </div>
              {selectedFilters.criticalOperations.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {selectedFilters.criticalOperations.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          {expandedSections.criticalOps && (
            <CardContent className="p-3 pt-0 space-y-2">
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
            </CardContent>
          )}
        </Card>

        {/* Controls Filter */}
        <Card>
          <CardHeader className="p-3 cursor-pointer" onClick={() => toggleSection('controls')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {expandedSections.controls ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <CardTitle className="text-sm">Controls</CardTitle>
              </div>
              {selectedFilters.controls.length > 0 && (
                <Badge variant="default" className="text-xs bg-blue-600">
                  {selectedFilters.controls.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          {expandedSections.controls && (
            <CardContent className="p-3 pt-0 space-y-2">
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
            </CardContent>
          )}
        </Card>

        {/* Systems Filter */}
        <Card>
          <CardHeader className="p-3 cursor-pointer" onClick={() => toggleSection('systems')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {expandedSections.systems ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <CardTitle className="text-sm">Systems</CardTitle>
              </div>
              {selectedFilters.systems.length > 0 && (
                <Badge variant="default" className="text-xs bg-green-600">
                  {selectedFilters.systems.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          {expandedSections.systems && (
            <CardContent className="p-3 pt-0 space-y-2">
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
            </CardContent>
          )}
        </Card>

        {/* Regions Filter */}
        <Card>
          <CardHeader className="p-3 cursor-pointer" onClick={() => toggleSection('regions')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {expandedSections.regions ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <CardTitle className="text-sm">Regions</CardTitle>
              </div>
              {selectedFilters.regions.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedFilters.regions.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          {expandedSections.regions && (
            <CardContent className="p-3 pt-0 space-y-2">
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
            </CardContent>
          )}
        </Card>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t space-y-2">
        {totalSelectedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={clearAllFilters}
          >
            <X className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        )}

        {onSave && (
          <Button
            size="sm"
            className="w-full"
            onClick={onSave}
            disabled={isSaving}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Diagram'}
          </Button>
        )}
      </div>
    </div>
  );
}
