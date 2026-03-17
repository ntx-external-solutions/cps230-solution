import azureApi from './azureApi';
import type { System, Region, Process, Control, CriticalOperation, Setting, UserProfile, SyncHistory } from '@/types/database';

// ============================================================================
// SYSTEMS API
// ============================================================================

export const systemsApi = {
  getAll: async (): Promise<System[]> => {
    const response = await azureApi.systems.list();
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || [];
  },

  getById: async (id: string): Promise<System> => {
    const response = await azureApi.systems.get(id);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('System not found');
    }
    return response.data;
  },

  create: async (system: Omit<System, 'id' | 'created_at' | 'modified_date' | 'modified_by'>): Promise<System> => {
    const response = await azureApi.systems.create(system);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to create system');
    }
    return response.data;
  },

  update: async (id: string, updates: Partial<Omit<System, 'id' | 'created_at'>>): Promise<System> => {
    const response = await azureApi.systems.update(id, updates);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to update system');
    }
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    const response = await azureApi.systems.delete(id);
    if (response.error) {
      throw new Error(response.error);
    }
  },
};

// ============================================================================
// REGIONS API
// ============================================================================

export const regionsApi = {
  getAll: async (): Promise<Region[]> => {
    const response = await azureApi.regions.list();
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || [];
  },

  getById: async (id: string): Promise<Region> => {
    const response = await azureApi.regions.get(id);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Region not found');
    }
    return response.data;
  },

  create: async (region: Omit<Region, 'id' | 'created_at' | 'modified_date' | 'modified_by'>): Promise<Region> => {
    const response = await azureApi.regions.create(region);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to create region');
    }
    return response.data;
  },

  update: async (id: string, updates: Partial<Omit<Region, 'id' | 'created_at'>>): Promise<Region> => {
    const response = await azureApi.regions.update(id, updates);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to update region');
    }
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    const response = await azureApi.regions.delete(id);
    if (response.error) {
      throw new Error(response.error);
    }
  },
};

// ============================================================================
// PROCESSES API
// ============================================================================

export interface ProcessWithSystems extends Process {
  systems?: Array<{
    id: string;
    system_name: string;
  }>;
  controls?: Array<{
    id: string;
    control_name: string;
  }>;
  criticalOperations?: Array<{
    id: string;
    operation_name: string;
  }>;
}

export const processesApi = {
  getAll: async (): Promise<ProcessWithSystems[]> => {
    const response = await azureApi.processes.list();
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || [];
  },

  getById: async (id: string): Promise<ProcessWithSystems> => {
    const response = await azureApi.processes.get(id);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Process not found');
    }
    return response.data;
  },

  create: async (process: Omit<Process, 'id' | 'created_at' | 'modified_date' | 'modified_by'>): Promise<Process> => {
    const response = await azureApi.processes.create(process);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to create process');
    }
    return response.data;
  },

  update: async (id: string, updates: Partial<Omit<Process, 'id' | 'created_at'>>): Promise<Process> => {
    const response = await azureApi.processes.update(id, updates);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to update process');
    }
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    const response = await azureApi.processes.delete(id);
    if (response.error) {
      throw new Error(response.error);
    }
  },
};

// ============================================================================
// CONTROLS API
// ============================================================================

export const controlsApi = {
  getAll: async (): Promise<Control[]> => {
    const response = await azureApi.controls.list();
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || [];
  },

  getById: async (id: string): Promise<Control> => {
    const response = await azureApi.controls.get(id);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Control not found');
    }
    return response.data;
  },

  create: async (control: Omit<Control, 'id' | 'created_at' | 'modified_date' | 'modified_by'>): Promise<Control> => {
    const response = await azureApi.controls.create(control);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to create control');
    }
    return response.data;
  },

  update: async (id: string, updates: Partial<Omit<Control, 'id' | 'created_at'>>): Promise<Control> => {
    const response = await azureApi.controls.update(id, updates);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to update control');
    }
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    const response = await azureApi.controls.delete(id);
    if (response.error) {
      throw new Error(response.error);
    }
  },
};

// ============================================================================
// CRITICAL OPERATIONS API
// ============================================================================

export const criticalOperationsApi = {
  getAll: async (): Promise<CriticalOperation[]> => {
    const response = await azureApi.criticalOperations.list();
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || [];
  },

  getById: async (id: string): Promise<CriticalOperation> => {
    const response = await azureApi.criticalOperations.get(id);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Critical operation not found');
    }
    return response.data;
  },

  create: async (operation: Omit<CriticalOperation, 'id' | 'created_at' | 'modified_date' | 'modified_by'>): Promise<CriticalOperation> => {
    const response = await azureApi.criticalOperations.create(operation);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to create critical operation');
    }
    return response.data;
  },

  update: async (id: string, updates: Partial<Omit<CriticalOperation, 'id' | 'created_at'>>): Promise<CriticalOperation> => {
    const response = await azureApi.criticalOperations.update(id, updates);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to update critical operation');
    }
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    const response = await azureApi.criticalOperations.delete(id);
    if (response.error) {
      throw new Error(response.error);
    }
  },
};

// ============================================================================
// SETTINGS API
// ============================================================================

export const settingsApi = {
  getAll: async (keys?: string[]): Promise<Setting[]> => {
    const response = await azureApi.settings.list();
    if (response.error) {
      throw new Error(response.error);
    }
    let settings = response.data || [];

    // Filter by keys if provided
    if (keys && keys.length > 0) {
      settings = settings.filter((s: Setting) => keys.includes(s.key));
    }

    return settings;
  },

  upsert: async (settings: Array<{ key: string; value: any }>): Promise<void> => {
    // For each setting, try to update it, or create if it doesn't exist
    for (const setting of settings) {
      const updateResponse = await azureApi.settings.updateByKey(setting.key, {
        value: setting.value,
      });

      // If update failed (not found), create the setting
      if (updateResponse.error && updateResponse.error.includes('not found')) {
        const createResponse = await azureApi.settings.create(setting);
        if (createResponse.error) {
          throw new Error(createResponse.error);
        }
      } else if (updateResponse.error) {
        throw new Error(updateResponse.error);
      }
    }
  },
};

// ============================================================================
// USER PROFILES API
// ============================================================================

export const userProfilesApi = {
  getAll: async (): Promise<UserProfile[]> => {
    const response = await azureApi.userProfiles.list();
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || [];
  },

  getById: async (id: string): Promise<UserProfile> => {
    const response = await azureApi.userProfiles.get(id);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('User profile not found');
    }
    return response.data;
  },

  getByUserId: async (userId: string): Promise<UserProfile> => {
    // For Azure, we use the user ID as the identifier
    return this.getById(userId);
  },

  update: async (id: string, updates: { full_name?: string | null; role?: string }): Promise<UserProfile> => {
    const response = await azureApi.userProfiles.update(id, updates);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to update user profile');
    }
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    const response = await azureApi.userProfiles.delete(id);
    if (response.error) {
      throw new Error(response.error);
    }
  },
};

// ============================================================================
// SYNC HISTORY API
// ============================================================================

export const syncHistoryApi = {
  getAll: async (limit?: number): Promise<SyncHistory[]> => {
    const response = await azureApi.syncHistory.list(limit, undefined);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || [];
  },

  getLatest: async (): Promise<SyncHistory | null> => {
    const response = await azureApi.syncHistory.list(1, undefined);
    if (response.error) {
      throw new Error(response.error);
    }
    const data = response.data || [];
    return data.length > 0 ? data[0] : null;
  },

  cancel: async (id: string): Promise<SyncHistory> => {
    const response = await azureApi.syncHistory.update(id, {
      status: 'failed',
      error_message: 'Cancelled by user',
    });
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Failed to cancel sync');
    }
    return response.data;
  },
};

// ============================================================================
// SYNC PROCESS MANAGER API
// ============================================================================

export interface SyncInitResponse {
  success: boolean;
  mode: 'init';
  syncId: string;
  totalProcesses: number;
  message: string;
}

export interface SyncProcessResponse {
  success: boolean;
  mode: 'process';
  syncId: string;
  processed: number;
  total: number;
  remaining: number;
  percentComplete: number;
  message: string;
  completed?: boolean;
  totalProcessed?: number;
}

export const syncProcessManagerApi = {
  // Initialize sync - searches for processes and queues them
  init: async (): Promise<SyncInitResponse> => {
    const response = await azureApi.sync.trigger('full');
    if (response.error) {
      throw new Error(response.error);
    }

    // Map the Azure response to the expected format
    return {
      success: true,
      mode: 'init' as const,
      syncId: response.data?.syncHistoryId || '',
      totalProcesses: response.data?.recordsSynced || 0,
      message: response.data?.message || response.message || 'Sync initiated',
    };
  },

  // Process next batch - processes next 5 processes from queue
  processBatch: async (): Promise<SyncProcessResponse> => {
    // Azure Functions handles syncing in one go, so we'll simulate the batch processing
    const response = await azureApi.sync.trigger('full');
    if (response.error) {
      throw new Error(response.error);
    }

    return {
      success: true,
      mode: 'process' as const,
      syncId: response.data?.syncHistoryId || '',
      processed: response.data?.recordsSynced || 0,
      total: response.data?.recordsSynced || 0,
      remaining: 0,
      percentComplete: 100,
      message: response.data?.message || response.message || 'Sync completed',
      completed: true,
      totalProcessed: response.data?.recordsSynced || 0,
    };
  },

  // Legacy sync method (calls init - kept for backwards compatibility)
  sync: async (): Promise<{ success: boolean; message: string; syncId: string }> => {
    const result = await syncProcessManagerApi.init();
    return {
      success: result.success,
      message: result.message,
      syncId: result.syncId,
    };
  },
};
