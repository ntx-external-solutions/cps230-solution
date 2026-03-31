import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { MultiSelect } from '@/components/ui/multi-select';
import type { Control } from '@/types/database';
import { useCreateControl, useUpdateControl } from '@/hooks/useControls';
import { useCriticalOperations } from '@/hooks/useCriticalOperations';
import { useSystems } from '@/hooks/useSystems';
import { useProcesses } from '@/hooks/useProcesses';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { regionsApi } from '@/lib/api';
import { toast } from 'sonner';
import azureApi from '@/lib/azureApi';

interface ControlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  control?: Control | null;
}

interface ControlFormData {
  control_name: string;
  description: string;
  control_type: string;
  regions: string[];
  color_code: string;
}

export function ControlDialog({ open, onOpenChange, control }: ControlDialogProps) {
  const createControl = useCreateControl();
  const updateControl = useUpdateControl();
  const queryClient = useQueryClient();
  const { data: criticalOperations = [] } = useCriticalOperations();
  const { data: systems = [] } = useSystems();
  const { data: processes = [] } = useProcesses();
  const { data: regions = [], isLoading: regionsLoading } = useQuery({
    queryKey: ['regions'],
    queryFn: () => regionsApi.getAll(),
  });

  const [selectedCriticalOpIds, setSelectedCriticalOpIds] = useState<string[]>([]);
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([]);
  const [selectedSystemIds, setSelectedSystemIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ControlFormData>({
    defaultValues: {
      control_name: '',
      description: '',
      control_type: '',
      regions: [],
      color_code: '',
    },
  });

  const colorCode = watch('color_code');

  useEffect(() => {
    const loadControlData = async () => {
      if (open && control) {
        // Reset basic form fields
        reset({
          control_name: control.control_name,
          description: control.description || '',
          control_type: control.control_type || '',
          regions: control.regions || [],
          color_code: (control as any).color_code || '',
        });

        // Load related critical operations, processes, and systems from junction tables
        try {
          const controlResponse = await azureApi.controls.get(control.id);
          if (controlResponse.data) {
            const criticalOpIds = (controlResponse.data as any).critical_operations?.map((co: any) => co.id) || [];
            const processIds = (controlResponse.data as any).processes?.map((p: any) => p.id) || [];
            const systemIds = (controlResponse.data as any).systems?.map((s: any) => s.id) || [];
            setSelectedCriticalOpIds(criticalOpIds);
            setSelectedProcessIds(processIds);
            setSelectedSystemIds(systemIds);
          }
        } catch (error) {
          console.error('Error loading control relationships:', error);
        }
      } else if (open) {
        reset({
          control_name: '',
          description: '',
          control_type: '',
          regions: [],
          color_code: '',
        });
        setSelectedCriticalOpIds([]);
        setSelectedProcessIds([]);
        setSelectedSystemIds([]);
      }
    };

    loadControlData();
  }, [open, control, reset]);

  const onSubmit = async (data: ControlFormData) => {
    try {
      let controlId: string;

      if (control) {
        // Update existing control
        const response = await updateControl.mutateAsync({
          id: control.id,
          control_name: data.control_name,
          description: data.description || null,
          control_type: data.control_type || null,
          regions: data.regions.length > 0 ? data.regions : null,
          color_code: data.color_code || null,
        });
        controlId = control.id;

        // Delete existing junction entries
        const existingCriticalOps = await azureApi.controlCriticalOperations.list(controlId);
        const existingProcesses = await azureApi.controlProcesses.list(controlId);
        const existingSystems = await azureApi.controlSystems.list(controlId);

        for (const co of (existingCriticalOps.data || [])) {
          await azureApi.controlCriticalOperations.delete((co as any).id);
        }

        for (const proc of (existingProcesses.data || [])) {
          await azureApi.controlProcesses.delete((proc as any).id);
        }

        for (const sys of (existingSystems.data || [])) {
          await azureApi.controlSystems.delete((sys as any).id);
        }
      } else {
        // Create new control
        const response = await createControl.mutateAsync({
          control_name: data.control_name,
          description: data.description || null,
          control_type: data.control_type || null,
          regions: data.regions.length > 0 ? data.regions : null,
          color_code: data.color_code || null,
        });
        controlId = (response as any).id;
      }

      // Create new junction entries for critical operations
      for (const criticalOpId of selectedCriticalOpIds) {
        await azureApi.controlCriticalOperations.create({
          control_id: controlId,
          critical_operation_id: criticalOpId,
        });
      }

      // Create new junction entries for processes
      for (const processId of selectedProcessIds) {
        await azureApi.controlProcesses.create({
          control_id: controlId,
          process_id: processId,
        });
      }

      // Create new junction entries for systems
      for (const systemId of selectedSystemIds) {
        await azureApi.controlSystems.create({
          control_id: controlId,
          system_id: systemId,
        });
      }

      // Invalidate after all junction entries are created so the table shows complete data
      await queryClient.invalidateQueries({ queryKey: ['controls'] });

      toast.success(control ? 'Control updated successfully' : 'Control created successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error(control ? 'Failed to update control' : 'Failed to create control');
      console.error(error);
    }
  };

  const currentRegions = watch('regions');

  const toggleRegion = (region: string) => {
    const newRegions = currentRegions.includes(region)
      ? currentRegions.filter((r) => r !== region)
      : [...currentRegions, region];
    setValue('regions', newRegions);
  };

  // Get available regions from database
  const availableRegions = regions.map((r: any) => ({
    code: r.region_code,
    name: r.region_name || r.region_code,
    icon: r.icon,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{control ? 'Edit Control' : 'Add New Control'}</DialogTitle>
          <DialogDescription>
            {control
              ? 'Update the control information below.'
              : 'Add a new control to govern critical operations.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="control_name">
                Control Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="control_name"
                {...register('control_name', {
                  required: 'Control name is required',
                })}
                placeholder="Enter control name"
              />
              {errors.control_name && (
                <p className="text-sm text-destructive">{errors.control_name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder="Enter control description (optional)"
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="control_type">Control Type</Label>
              <Input
                id="control_type"
                {...register('control_type')}
                placeholder="e.g., Preventive, Detective, Corrective"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="color_code">Color Code</Label>
              <div className="flex gap-2">
                <Input
                  id="color_code"
                  type="color"
                  value={colorCode || '#000000'}
                  onChange={(e) => setValue('color_code', e.target.value)}
                  className="w-20 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={colorCode || ''}
                  onChange={(e) => setValue('color_code', e.target.value)}
                  placeholder="#FF6633"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="critical_operation_ids">Associated Critical Operations</Label>
              <MultiSelect
                options={criticalOperations.map((op) => ({
                  value: op.id,
                  label: op.operation_name,
                }))}
                selected={selectedCriticalOpIds}
                onChange={setSelectedCriticalOpIds}
                placeholder="Select critical operations (optional)"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="process_ids">Associated Processes</Label>
              <MultiSelect
                options={processes.map((process) => ({
                  value: process.id,
                  label: process.process_name,
                }))}
                selected={selectedProcessIds}
                onChange={setSelectedProcessIds}
                placeholder="Select processes (optional)"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="system_ids">Associated Systems</Label>
              <MultiSelect
                options={systems.map((system) => ({
                  value: system.id,
                  label: system.system_name,
                }))}
                selected={selectedSystemIds}
                onChange={setSelectedSystemIds}
                placeholder="Select systems (optional)"
              />
            </div>

            <div className="grid gap-2">
              <Label>Regions</Label>
              {availableRegions.length > 0 ? (
                <div className="flex flex-wrap gap-4">
                  {availableRegions.map((region) => (
                    <div key={region.code} className="flex items-center space-x-2">
                      <Checkbox
                        id={`region-${region.code}`}
                        checked={currentRegions.includes(region.code)}
                        onCheckedChange={() => toggleRegion(region.code)}
                      />
                      <Label
                        htmlFor={`region-${region.code}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {region.icon && <span className="mr-1">{region.icon}</span>}
                        {region.name}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No regions configured. Add regions in Settings to assign them to controls.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : control ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
