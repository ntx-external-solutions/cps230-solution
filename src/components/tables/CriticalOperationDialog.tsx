import { useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CriticalOperation } from '@/types/database';
import { useCreateCriticalOperation, useUpdateCriticalOperation } from '@/hooks/useCriticalOperations';
import { useSystems } from '@/hooks/useSystems';
import { useProcesses } from '@/hooks/useProcesses';
import { toast } from 'sonner';

interface CriticalOperationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation?: CriticalOperation | null;
}

interface CriticalOperationFormData {
  operation_name: string;
  description: string;
  system_id: string;
  process_id: string;
  color_code: string;
}

export function CriticalOperationDialog({
  open,
  onOpenChange,
  operation,
}: CriticalOperationDialogProps) {
  const createOperation = useCreateCriticalOperation();
  const updateOperation = useUpdateCriticalOperation();
  const { data: systems = [] } = useSystems();
  const { data: processes = [] } = useProcesses();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CriticalOperationFormData>({
    defaultValues: {
      operation_name: '',
      description: '',
      system_id: '',
      process_id: '',
      color_code: '',
    },
  });

  useEffect(() => {
    if (open && operation) {
      reset({
        operation_name: operation.operation_name,
        description: operation.description || '',
        system_id: operation.system_id || '',
        process_id: operation.process_id || '',
        color_code: operation.color_code || '',
      });
    } else if (open) {
      reset({
        operation_name: '',
        description: '',
        system_id: '',
        process_id: '',
        color_code: '',
      });
    }
  }, [open, operation, reset]);

  const onSubmit = async (data: CriticalOperationFormData) => {
    try {
      if (operation) {
        await updateOperation.mutateAsync({
          id: operation.id,
          operation_name: data.operation_name,
          description: data.description || null,
          system_id: data.system_id || null,
          process_id: data.process_id || null,
          color_code: data.color_code || null,
        });
        toast.success('Critical operation updated successfully');
      } else {
        await createOperation.mutateAsync({
          operation_name: data.operation_name,
          description: data.description || null,
          system_id: data.system_id || null,
          process_id: data.process_id || null,
          color_code: data.color_code || null,
        });
        toast.success('Critical operation created successfully');
      }
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
              <Label htmlFor="color_code">Color Code</Label>
              <div className="flex gap-2">
                <Input
                  id="color_code"
                  type="color"
                  {...register('color_code')}
                  className="w-20 h-10 p-1"
                />
                <Input
                  {...register('color_code')}
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
