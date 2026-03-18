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
import { Badge } from '@/components/ui/badge';
import type { Process } from '@/types/database';
import { useCreateProcess, useUpdateProcess } from '@/hooks/useProcesses';
import { useQuery } from '@tanstack/react-query';
import { regionsApi } from '@/lib/api';
import { toast } from 'sonner';

interface ProcessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  process?: Process | null;
}

interface ProcessFormData {
  process_name: string;
  process_unique_id: string;
  owner_username: string;
}

export function ProcessDialog({ open, onOpenChange, process }: ProcessDialogProps) {
  const createProcess = useCreateProcess();
  const updateProcess = useUpdateProcess();
  const { data: regions = [], isLoading: regionsLoading } = useQuery({
    queryKey: ['regions'],
    queryFn: () => regionsApi.getAll(),
  });

  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProcessFormData>({
    defaultValues: {
      process_name: '',
      process_unique_id: '',
      owner_username: '',
    },
  });

  // Get available regions from database
  const availableRegions = regions.map((r: any) => ({
    name: r.region_code,
    label: r.region_name,
    icon: r.icon,
  }));

  // Reset form when dialog opens with process data
  useEffect(() => {
    if (open && process) {
      reset({
        process_name: process.process_name,
        process_unique_id: process.process_unique_id,
        owner_username: process.owner_username || '',
      });
      setSelectedRegions(process.regions || []);
    } else if (open) {
      reset({
        process_name: '',
        process_unique_id: '',
        owner_username: '',
      });
      setSelectedRegions([]);
    }
  }, [open, process, reset]);

  const onSubmit = async (data: ProcessFormData) => {
    try {
      if (process) {
        // Update existing process
        await updateProcess.mutateAsync({
          id: process.id,
          ...data,
          owner_username: data.owner_username || null,
          regions: selectedRegions.length > 0 ? selectedRegions : null,
        });
        toast.success('Process updated successfully');
      } else {
        // Create new process
        await createProcess.mutateAsync({
          ...data,
          owner_username: data.owner_username || null,
          input_processes: null,
          output_processes: null,
          canvas_position: null,
          metadata: null,
          regions: selectedRegions.length > 0 ? selectedRegions : null,
        });
        toast.success('Process created successfully');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(process ? 'Failed to update process' : 'Failed to create process');
      console.error(error);
    }
  };

  const handleRegionToggle = (regionName: string) => {
    setSelectedRegions(prev =>
      prev.includes(regionName)
        ? prev.filter(r => r !== regionName)
        : [...prev, regionName]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{process ? 'Edit Process' : 'Add New Process'}</DialogTitle>
          <DialogDescription>
            {process
              ? 'Update the process information below.'
              : 'Add a new process to the system.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="process_name">
                Process Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="process_name"
                {...register('process_name', {
                  required: 'Process name is required',
                })}
                placeholder="Enter process name"
              />
              {errors.process_name && (
                <p className="text-sm text-destructive">{errors.process_name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="process_unique_id">
                Process Unique ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="process_unique_id"
                {...register('process_unique_id', {
                  required: 'Process unique ID is required',
                })}
                placeholder="Enter unique ID from Nintex"
                disabled={!!process} // Can't change ID on edit
              />
              {errors.process_unique_id && (
                <p className="text-sm text-destructive">
                  {errors.process_unique_id.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="owner_username">Owner Username</Label>
              <Input
                id="owner_username"
                {...register('owner_username')}
                placeholder="Enter owner username (optional)"
              />
            </div>

            <div className="grid gap-2">
              <Label>Regions</Label>
              {availableRegions.length > 0 ? (
                <div className="space-y-2">
                  {availableRegions.map((region) => (
                    <div key={region.name} className="flex items-center space-x-2">
                      <Checkbox
                        id={`region-${region.name}`}
                        checked={selectedRegions.includes(region.name)}
                        onCheckedChange={() => handleRegionToggle(region.name)}
                      />
                      <label
                        htmlFor={`region-${region.name}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {region.icon && <span className="mr-1">{region.icon}</span>}
                        {region.label}
                      </label>
                    </div>
                  ))}
                  {selectedRegions.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {selectedRegions.map((regionName) => {
                        const region = availableRegions.find(r => r.name === regionName);
                        return (
                          <Badge key={regionName} variant="outline" className="text-xs">
                            {region?.icon && <span className="mr-1">{region.icon}</span>}
                            {region?.label || regionName}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No regions configured. Add regions in Settings to assign them to processes.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : process ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
