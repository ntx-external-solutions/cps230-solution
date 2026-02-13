import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { systemsApi } from '@/lib/api';
import type { System } from '@/types/database';

export function useSystems() {
  return useQuery({
    queryKey: ['systems'],
    queryFn: () => systemsApi.getAll(),
  });
}

export function useCreateSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (system: Omit<System, 'id' | 'created_at' | 'modified_date' | 'modified_by'>) =>
      systemsApi.create(system),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systems'] });
    },
  });
}

export function useUpdateSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<System> & { id: string }) =>
      systemsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systems'] });
    },
  });
}

export function useDeleteSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => systemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systems'] });
    },
  });
}
