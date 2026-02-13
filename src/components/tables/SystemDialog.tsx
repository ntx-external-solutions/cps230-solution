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
import type { System } from '@/types/database';
import { useCreateSystem, useUpdateSystem } from '@/hooks/useSystems';
import { toast } from 'sonner';

interface SystemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  system?: System | null;
}

interface SystemFormData {
  system_name: string;
  system_id: string;
  description: string;
}

export function SystemDialog({ open, onOpenChange, system }: SystemDialogProps) {
  const createSystem = useCreateSystem();
  const updateSystem = useUpdateSystem();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SystemFormData>({
    defaultValues: {
      system_name: '',
      system_id: '',
      description: '',
    },
  });

  useEffect(() => {
    if (open && system) {
      reset({
        system_name: system.system_name,
        system_id: system.system_id,
        description: system.description || '',
      });
    } else if (open) {
      reset({
        system_name: '',
        system_id: '',
        description: '',
      });
    }
  }, [open, system, reset]);

  const onSubmit = async (data: SystemFormData) => {
    try {
      if (system) {
        await updateSystem.mutateAsync({
          id: system.id,
          ...data,
          description: data.description || null,
        });
        toast.success('System updated successfully');
      } else {
        await createSystem.mutateAsync({
          ...data,
          description: data.description || null,
          metadata: null,
        });
        toast.success('System created successfully');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(system ? 'Failed to update system' : 'Failed to create system');
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{system ? 'Edit System' : 'Add New System'}</DialogTitle>
          <DialogDescription>
            {system
              ? 'Update the system information below.'
              : 'Add a new system to the database.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="system_name">
                System Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="system_name"
                {...register('system_name', {
                  required: 'System name is required',
                })}
                placeholder="Enter system name"
              />
              {errors.system_name && (
                <p className="text-sm text-destructive">{errors.system_name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="system_id">
                System ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="system_id"
                {...register('system_id', {
                  required: 'System ID is required',
                })}
                placeholder="Enter system ID"
                disabled={!!system} // Can't change ID on edit
              />
              {errors.system_id && (
                <p className="text-sm text-destructive">{errors.system_id.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder="Enter system description (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : system ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
