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
    mutationFn: async () => {
      // Single sync call - backend handles everything
      const response = await syncProcessManagerApi.sync();
      console.log('Sync completed:', response);
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

export function useLatestSync(enablePolling: boolean = false) {
  return useQuery({
    queryKey: ['latest-sync'],
    queryFn: () => syncHistoryApi.getLatest(),
    refetchInterval: (query) => {
      // Only poll if enabled and there's an active sync
      if (!enablePolling) return false;
      const latestSync = query.state.data as any;
      return latestSync?.status === 'in_progress' ? 5000 : false;
    },
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
