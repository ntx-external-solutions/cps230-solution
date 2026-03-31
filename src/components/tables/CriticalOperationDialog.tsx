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
import { MultiSelect } from '@/components/ui/multi-select';
import type { CriticalOperation } from '@/types/database';
import { useCreateCriticalOperation, useUpdateCriticalOperation } from '@/hooks/useCriticalOperations';
import { useSystems } from '@/hooks/useSystems';
import { useProcesses } from '@/hooks/useProcesses';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import azureApi from '@/lib/azureApi';

interface CriticalOperationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation?: CriticalOperation | null;
}

interface CriticalOperationFormData {
  operation_name: string;
  description: string;
  color_code: string;
}

export function CriticalOperationDialog({
  open,
  onOpenChange,
  operation,
}: CriticalOperationDialogProps) {
  const createOperation = useCreateCriticalOperation();
  const updateOperation = useUpdateCriticalOperation();
  const queryClient = useQueryClient();
  const { data: systems = [] } = useSystems();
  const { data: processes = [] } = useProcesses();

  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([]);
  const [selectedSystemIds, setSelectedSystemIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CriticalOperationFormData>({
    defaultValues: {
      operation_name: '',
      description: '',
      color_code: '',
    },
  });

  const colorCode = watch('color_code');

  useEffect(() => {
    const loadOperationData = async () => {
      if (open && operation) {
        // Reset basic form fields
        reset({
          operation_name: operation.operation_name,
          description: operation.description || '',
          color_code: operation.color_code || '',
        });

        // Load related processes and systems from junction tables
        try {
          const critOpResponse = await azureApi.criticalOperations.get(operation.id);
          if (critOpResponse.data) {
            const processIds = (critOpResponse.data as any).processes?.map((p: any) => p.id) || [];
            const systemIds = (critOpResponse.data as any).systems?.map((s: any) => s.id) || [];
            setSelectedProcessIds(processIds);
            setSelectedSystemIds(systemIds);
          }
        } catch (error) {
          console.error('Error loading critical operation relationships:', error);
        }
      } else if (open) {
        reset({
          operation_name: '',
          description: '',
          color_code: '',
        });
        setSelectedProcessIds([]);
        setSelectedSystemIds([]);
      }
    };

    loadOperationData();
  }, [open, operation, reset]);

  const onSubmit = async (data: CriticalOperationFormData) => {
    try {
      let criticalOpId: string;

      if (operation) {
        // Update existing operation
        const response = await updateOperation.mutateAsync({
          id: operation.id,
          operation_name: data.operation_name,
          description: data.description || null,
          color_code: data.color_code || null,
        });
        criticalOpId = operation.id;

        // Delete existing junction entries
        const existingProcesses = await azureApi.criticalOperationProcesses.list(criticalOpId);
        const existingSystems = await azureApi.criticalOperationSystems.list(criticalOpId);

        for (const proc of (existingProcesses.data || [])) {
          await azureApi.criticalOperationProcesses.delete((proc as any).id);
        }

        for (const sys of (existingSystems.data || [])) {
          await azureApi.criticalOperationSystems.delete((sys as any).id);
        }
      } else {
        // Create new operation
        const response = await createOperation.mutateAsync({
          operation_name: data.operation_name,
          description: data.description || null,
          color_code: data.color_code || null,
        });
        criticalOpId = (response as any).id;
      }

      // Create new junction entries for processes
      for (const processId of selectedProcessIds) {
        await azureApi.criticalOperationProcesses.create({
          critical_operation_id: criticalOpId,
          process_id: processId,
        });
      }

      // Create new junction entries for systems
      for (const systemId of selectedSystemIds) {
        await azureApi.criticalOperationSystems.create({
          critical_operation_id: criticalOpId,
          system_id: systemId,
        });
      }

      // Invalidate after all junction entries are created so the table shows complete data
      await queryClient.invalidateQueries({ queryKey: ['critical_operations'] });

      toast.success(operation ? 'Critical operation updated successfully' : 'Critical operation created successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error(operation ? 'Failed to update operation' : 'Failed to create operation');
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>
            {operation ? 'Edit Critical Operation' : 'Add New Critical Operation'}
          </DialogTitle>
          <DialogDescription>
            {operation
              ? 'Update the critical operation information below.'
              : 'Add a new critical operation for CPS230 compliance.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="operation_name">
                Operation Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="operation_name"
                {...register('operation_name', {
                  required: 'Operation name is required',
                })}
                placeholder="Enter operation name"
              />
              {errors.operation_name && (
                <p className="text-sm text-destructive">{errors.operation_name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder="Enter operation description (optional)"
                rows={3}
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : operation ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
