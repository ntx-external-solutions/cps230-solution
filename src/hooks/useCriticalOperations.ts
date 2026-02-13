import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { criticalOperationsApi } from '@/lib/api';
import type { CriticalOperation } from '@/types/database';

export function useCriticalOperations() {
  return useQuery({
    queryKey: ['critical_operations'],
    queryFn: () => criticalOperationsApi.getAll(),
  });
}

export function useCreateCriticalOperation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (operation: Omit<CriticalOperation, 'id' | 'created_at' | 'modified_date' | 'modified_by'>) =>
      criticalOperationsApi.create(operation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical_operations'] });
    },
  });
}

export function useUpdateCriticalOperation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<CriticalOperation> & { id: string }) =>
      criticalOperationsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical_operations'] });
    },
  });
}

export function useDeleteCriticalOperation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => criticalOperationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['critical_operations'] });
    },
  });
}
