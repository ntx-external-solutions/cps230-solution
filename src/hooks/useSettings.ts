import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, syncProcessManagerApi, syncHistoryApi } from '@/lib/api';
import type { Setting } from '@/types/database';

export interface ProcessManagerSettings {
  pm_site_url?: string;
  pm_username?: string;
  pm_password?: string;
  pm_tenant_id?: string;
}

export function useSettings(keys?: string[]) {
  return useQuery({
    queryKey: keys ? ['settings', ...keys] : ['settings'],
    queryFn: () => settingsApi.getAll(keys),
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: { key: string; value: any }[]) =>
      settingsApi.upsert(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useSyncProcessManager() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (onProgress?: (progress: { processed: number; total: number; percentComplete: number }) => void) => {
      // Phase 1: Initialize sync
      const initResponse = await syncProcessManagerApi.init();
      console.log('Sync initialized:', initResponse);

      // Phase 2: Process batches until complete
      let isComplete = false;
      let response;

      while (!isComplete) {
        response = await syncProcessManagerApi.processBatch();
        console.log('Batch processed:', response);

        // Report progress to caller
        if (onProgress) {
          onProgress({
            processed: response.processed,
            total: response.total,
            percentComplete: response.percentComplete,
          });
        }

        // Check if sync is complete
        if (response.completed || response.remaining === 0) {
          isComplete = true;
        }

        // Small delay between batches to avoid overwhelming the API
        if (!isComplete) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      queryClient.invalidateQueries({ queryKey: ['systems'] });
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
      queryClient.invalidateQueries({ queryKey: ['latest-sync'] });
    },
  });
}

export function useSyncHistory(refetchInterval?: number) {
  return useQuery({
    queryKey: ['sync-history'],
    queryFn: () => syncHistoryApi.getAll(10),
    refetchInterval, // Auto-refetch at specified interval
  });
}

export function useLatestSync() {
  return useQuery({
    queryKey: ['latest-sync'],
    queryFn: () => syncHistoryApi.getLatest(),
    refetchInterval: 30000, // Poll every 30 seconds
  });
}

export function useCancelSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (syncId: string) => syncHistoryApi.cancel(syncId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
      queryClient.invalidateQueries({ queryKey: ['latest-sync'] });
    },
  });
}
