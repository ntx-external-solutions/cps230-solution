import { supabase } from './supabase'
import type { System, Process, Control, CriticalOperation, Setting, UserProfile, SyncHistory } from '@/types/database'

// Use /data/v1 which will be rewritten by Vercel to Supabase Edge Functions
// This hides the Supabase URL from the client
const API_BASE_URL = '/data/v1'

// Helper function to get auth headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('No active session')
  }

  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders()

  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'An error occurred' }))
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json()
}

// ============================================================================
// SYSTEMS API
// ============================================================================

export const systemsApi = {
  getAll: async (): Promise<System[]> => {
    const response = await apiFetch<{ data: System[] }>('systems')
    return response.data
  },

  getById: async (id: string): Promise<System> => {
    const response = await apiFetch<{ data: System }>(`systems?id=${id}`)
    return response.data
  },

  create: async (system: Omit<System, 'id' | 'created_at' | 'modified_date' | 'modified_by'>): Promise<System> => {
    const response = await apiFetch<{ data: System }>('systems', {
      method: 'POST',
      body: JSON.stringify(system),
    })
    return response.data
  },

  update: async (id: string, updates: Partial<Omit<System, 'id' | 'created_at'>>): Promise<System> => {
    const response = await apiFetch<{ data: System }>(`systems?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch<{ success: boolean }>(`systems?id=${id}`, {
      method: 'DELETE',
    })
  },
}

// ============================================================================
// PROCESSES API
// ============================================================================

export interface ProcessWithSystems extends Process {
  systems?: Array<{
    id: string
    system_name: string
  }>
  controls?: Array<{
    id: string
    control_name: string
  }>
  criticalOperations?: Array<{
    id: string
    operation_name: string
  }>
}

export const processesApi = {
  getAll: async (): Promise<ProcessWithSystems[]> => {
    const response = await apiFetch<{ data: ProcessWithSystems[] }>('processes')
    return response.data
  },

  getById: async (id: string): Promise<ProcessWithSystems> => {
    const response = await apiFetch<{ data: ProcessWithSystems }>(`processes?id=${id}`)
    return response.data
  },

  create: async (process: Omit<Process, 'id' | 'created_at' | 'modified_date' | 'modified_by'>): Promise<Process> => {
    const response = await apiFetch<{ data: Process }>('processes', {
      method: 'POST',
      body: JSON.stringify(process),
    })
    return response.data
  },

  update: async (id: string, updates: Partial<Omit<Process, 'id' | 'created_at'>>): Promise<Process> => {
    const response = await apiFetch<{ data: Process }>(`processes?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch<{ success: boolean }>(`processes?id=${id}`, {
      method: 'DELETE',
    })
  },
}

// ============================================================================
// CONTROLS API
// ============================================================================

export const controlsApi = {
  getAll: async (): Promise<Control[]> => {
    const response = await apiFetch<{ data: Control[] }>('controls')
    return response.data
  },

  getById: async (id: string): Promise<Control> => {
    const response = await apiFetch<{ data: Control }>(`controls?id=${id}`)
    return response.data
  },

  create: async (control: Omit<Control, 'id' | 'created_at' | 'modified_date' | 'modified_by'>): Promise<Control> => {
    const response = await apiFetch<{ data: Control }>('controls', {
      method: 'POST',
      body: JSON.stringify(control),
    })
    return response.data
  },

  update: async (id: string, updates: Partial<Omit<Control, 'id' | 'created_at'>>): Promise<Control> => {
    const response = await apiFetch<{ data: Control }>(`controls?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch<{ success: boolean }>(`controls?id=${id}`, {
      method: 'DELETE',
    })
  },
}

// ============================================================================
// CRITICAL OPERATIONS API
// ============================================================================

export const criticalOperationsApi = {
  getAll: async (): Promise<CriticalOperation[]> => {
    const response = await apiFetch<{ data: CriticalOperation[] }>('critical-operations')
    return response.data
  },

  getById: async (id: string): Promise<CriticalOperation> => {
    const response = await apiFetch<{ data: CriticalOperation }>(`critical-operations?id=${id}`)
    return response.data
  },

  create: async (operation: Omit<CriticalOperation, 'id' | 'created_at' | 'modified_date' | 'modified_by'>): Promise<CriticalOperation> => {
    const response = await apiFetch<{ data: CriticalOperation }>('critical-operations', {
      method: 'POST',
      body: JSON.stringify(operation),
    })
    return response.data
  },

  update: async (id: string, updates: Partial<Omit<CriticalOperation, 'id' | 'created_at'>>): Promise<CriticalOperation> => {
    const response = await apiFetch<{ data: CriticalOperation }>(`critical-operations?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch<{ success: boolean }>(`critical-operations?id=${id}`, {
      method: 'DELETE',
    })
  },
}

// ============================================================================
// SETTINGS API
// ============================================================================

export const settingsApi = {
  getAll: async (keys?: string[]): Promise<Setting[]> => {
    const queryParams = keys && keys.length > 0 ? `?keys=${keys.join(',')}` : ''
    const response = await apiFetch<{ data: Setting[] }>(`settings${queryParams}`)
    return response.data
  },

  upsert: async (settings: Array<{ key: string; value: any }>): Promise<void> => {
    await apiFetch<{ success: boolean }>('settings', {
      method: 'POST',
      body: JSON.stringify({ settings }),
    })
  },
}

// ============================================================================
// USER PROFILES API
// ============================================================================

export const userProfilesApi = {
  getAll: async (): Promise<UserProfile[]> => {
    const response = await apiFetch<{ data: UserProfile[] }>('user-profiles')
    return response.data
  },

  getById: async (id: string): Promise<UserProfile> => {
    const response = await apiFetch<{ data: UserProfile }>(`user-profiles?id=${id}`)
    return response.data
  },

  getByUserId: async (userId: string): Promise<UserProfile> => {
    const response = await apiFetch<{ data: UserProfile }>(`user-profiles?user_id=${userId}`)
    return response.data
  },

  update: async (id: string, updates: { full_name?: string | null; role?: string }): Promise<UserProfile> => {
    const response = await apiFetch<{ data: UserProfile }>(`user-profiles?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch<{ success: boolean }>(`user-profiles?id=${id}`, {
      method: 'DELETE',
    })
  },
}

// ============================================================================
// SYNC HISTORY API
// ============================================================================

export const syncHistoryApi = {
  getAll: async (limit?: number): Promise<SyncHistory[]> => {
    const queryParams = limit ? `?limit=${limit}` : ''
    const response = await apiFetch<{ data: SyncHistory[] }>(`sync-history${queryParams}`)
    return response.data
  },

  getLatest: async (): Promise<SyncHistory | null> => {
    const response = await apiFetch<{ data: SyncHistory | null }>('sync-history?latest=true')
    return response.data
  },

  cancel: async (id: string): Promise<SyncHistory> => {
    const response = await apiFetch<{ data: SyncHistory }>(`sync-history?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    })
    return response.data
  },
}

// ============================================================================
// SYNC PROCESS MANAGER API
// ============================================================================

export interface SyncInitResponse {
  success: boolean
  mode: 'init'
  syncId: string
  totalProcesses: number
  message: string
}

export interface SyncProcessResponse {
  success: boolean
  mode: 'process'
  syncId: string
  processed: number
  total: number
  remaining: number
  percentComplete: number
  message: string
  completed?: boolean
  totalProcessed?: number
}

export const syncProcessManagerApi = {
  // Initialize sync - searches for processes and queues them
  init: async (): Promise<SyncInitResponse> => {
    const response = await apiFetch<SyncInitResponse>('sync-process-manager?mode=init', {
      method: 'POST',
    })
    return response
  },

  // Process next batch - processes next 5 processes from queue
  processBatch: async (): Promise<SyncProcessResponse> => {
    const response = await apiFetch<SyncProcessResponse>('sync-process-manager?mode=process', {
      method: 'POST',
    })
    return response
  },

  // Legacy sync method (calls init - kept for backwards compatibility)
  sync: async (): Promise<{ success: boolean; message: string; syncId: string }> => {
    return await syncProcessManagerApi.init()
  },
}
