import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { processesApi, ProcessWithSystems } from '@/lib/api';
import type { Process } from '@/types/database';

export type { ProcessWithSystems };

export function useProcesses() {
  return useQuery({
    queryKey: ['processes'],
    queryFn: () => processesApi.getAll(),
  });
}

export function useCreateProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (process: Omit<Process, 'id' | 'created_at' | 'modified_date' | 'modified_by'>) =>
      processesApi.create(process),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}

export function useUpdateProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<Process> & { id: string }) =>
      processesApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}

export function useDeleteProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => processesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}
