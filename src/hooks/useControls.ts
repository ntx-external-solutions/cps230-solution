import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { controlsApi } from '@/lib/api';
import type { Control } from '@/types/database';

export function useControls() {
  return useQuery({
    queryKey: ['controls'],
    queryFn: () => controlsApi.getAll(),
  });
}

export function useCreateControl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (control: Omit<Control, 'id' | 'created_at' | 'modified_date' | 'modified_by'>) =>
      controlsApi.create(control),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controls'] });
    },
  });
}

export function useUpdateControl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<Control> & { id: string }) =>
      controlsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controls'] });
    },
  });
}

export function useDeleteControl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => controlsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controls'] });
    },
  });
}
