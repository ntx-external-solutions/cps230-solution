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
import type { Region } from '@/types/database';
import { useCreateRegion, useUpdateRegion } from '@/hooks/useRegions';
import { toast } from 'sonner';

interface RegionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  region?: Region | null;
}

interface RegionFormData {
  region_code: string;
  region_name: string;
  description: string;
}

export function RegionDialog({ open, onOpenChange, region }: RegionDialogProps) {
  const createRegion = useCreateRegion();
  const updateRegion = useUpdateRegion();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RegionFormData>({
    defaultValues: {
      region_code: '',
      region_name: '',
      description: '',
    },
  });

  useEffect(() => {
    if (open && region) {
      reset({
        region_code: region.region_code,
        region_name: region.region_name || '',
        description: region.description || '',
      });
    } else if (open) {
      reset({
        region_code: '',
        region_name: '',
        description: '',
      });
    }
  }, [open, region, reset]);

  const onSubmit = async (data: RegionFormData) => {
    try {
      if (region) {
        await updateRegion.mutateAsync({
          id: region.id,
          region_name: data.region_name || null,
          description: data.description || null,
        });
        toast.success('Region updated successfully');
      } else {
        await createRegion.mutateAsync({
          region_code: data.region_code.toUpperCase(),
          region_name: data.region_name || null,
          description: data.description || null,
        });
        toast.success('Region created successfully');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(region ? 'Failed to update region' : 'Failed to create region');
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{region ? 'Edit Region' : 'Add New Region'}</DialogTitle>
          <DialogDescription>
            {region
              ? 'Update the region information below.'
              : 'Add a new region to the database.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="region_code">
                Region Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="region_code"
                {...register('region_code', {
                  required: 'Region code is required',
                  pattern: {
                    value: /^[A-Z0-9]+$/i,
                    message: 'Region code must be alphanumeric',
                  },
                })}
                placeholder="e.g., UK, AU, EMEA"
                disabled={!!region} // Can't change code on edit
                className="uppercase"
              />
              {errors.region_code && (
                <p className="text-sm text-destructive">{errors.region_code.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Unique identifier (2-10 uppercase letters)
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="region_name">Region Name</Label>
              <Input
                id="region_name"
                {...register('region_name')}
                placeholder="e.g., United Kingdom, Australia"
              />
              <p className="text-xs text-muted-foreground">
                Human-readable name (optional)
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder="Enter region description (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : region ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
