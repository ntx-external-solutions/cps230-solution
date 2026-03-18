import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { regionsApi } from '@/lib/api';
import type { Region } from '@/types/database';

export function useRegions() {
  return useQuery({
    queryKey: ['regions'],
    queryFn: () => regionsApi.getAll(),
  });
}

export function useCreateRegion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (region: Omit<Region, 'id' | 'created_at' | 'modified_date' | 'modified_by'>) =>
      regionsApi.create(region),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regions'] });
    },
  });
}

export function useUpdateRegion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<Region> & { id: string }) =>
      regionsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regions'] });
    },
  });
}

export function useDeleteRegion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => regionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regions'] });
    },
  });
}
