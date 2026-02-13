import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Control } from '@/types/database';
import { useCreateControl, useUpdateControl } from '@/hooks/useControls';
import { useCriticalOperations } from '@/hooks/useCriticalOperations';
import { useSystems } from '@/hooks/useSystems';
import { useProcesses } from '@/hooks/useProcesses';
import { toast } from 'sonner';

interface ControlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  control?: Control | null;
}

interface ControlFormData {
  control_name: string;
  description: string;
  control_type: string;
  critical_operation_id: string;
  process_id: string;
  system_id: string;
  regions: string[];
}

const AVAILABLE_REGIONS = ['AU', 'UK', 'US', 'NZ', 'SG'];

export function ControlDialog({ open, onOpenChange, control }: ControlDialogProps) {
  const createControl = useCreateControl();
  const updateControl = useUpdateControl();
  const { data: criticalOperations = [] } = useCriticalOperations();
  const { data: systems = [] } = useSystems();
  const { data: processes = [] } = useProcesses();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control: formControl,
    formState: { errors, isSubmitting },
  } = useForm<ControlFormData>({
    defaultValues: {
      control_name: '',
      description: '',
      control_type: '',
      critical_operation_id: '',
      process_id: '',
      system_id: '',
      regions: [],
    },
  });

  useEffect(() => {
    if (open && control) {
      reset({
        control_name: control.control_name,
        description: control.description || '',
        control_type: control.control_type || '',
        critical_operation_id: control.critical_operation_id || '',
        process_id: control.process_id || '',
        system_id: control.system_id || '',
        regions: control.regions || [],
      });
    } else if (open) {
      reset({
        control_name: '',
        description: '',
        control_type: '',
        critical_operation_id: '',
        process_id: '',
        system_id: '',
        regions: [],
      });
    }
  }, [open, control, reset]);

  const onSubmit = async (data: ControlFormData) => {
    try {
      if (control) {
        await updateControl.mutateAsync({
          id: control.id,
          control_name: data.control_name,
          description: data.description || null,
          control_type: data.control_type || null,
          critical_operation_id: data.critical_operation_id || null,
          process_id: data.process_id || null,
          system_id: data.system_id || null,
          regions: data.regions.length > 0 ? data.regions : null,
        });
        toast.success('Control updated successfully');
      } else {
        await createControl.mutateAsync({
          control_name: data.control_name,
          description: data.description || null,
          control_type: data.control_type || null,
          critical_operation_id: data.critical_operation_id || null,
          process_id: data.process_id || null,
          system_id: data.system_id || null,
          regions: data.regions.length > 0 ? data.regions : null,
        });
        toast.success('Control created successfully');
      }
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
              <Label htmlFor="critical_operation_id">Critical Operation</Label>
              <Select
                value={watch('critical_operation_id') || undefined}
                onValueChange={(value) => setValue('critical_operation_id', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a critical operation (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {criticalOperations.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.operation_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="process_id">Associated Process</Label>
              <Select
                value={watch('process_id') || undefined}
                onValueChange={(value) => setValue('process_id', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a process (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {processes.map((process) => (
                    <SelectItem key={process.id} value={process.id}>
                      {process.process_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="system_id">Associated System</Label>
              <Select
                value={watch('system_id') || undefined}
                onValueChange={(value) => setValue('system_id', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a system (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {systems.map((system) => (
                    <SelectItem key={system.id} value={system.id}>
                      {system.system_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Regions</Label>
              <div className="flex flex-wrap gap-4">
                {AVAILABLE_REGIONS.map((region) => (
                  <div key={region} className="flex items-center space-x-2">
                    <Checkbox
                      id={`region-${region}`}
                      checked={currentRegions.includes(region)}
                      onCheckedChange={() => toggleRegion(region)}
                    />
                    <Label
                      htmlFor={`region-${region}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {region}
                    </Label>
                  </div>
                ))}
              </div>
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
