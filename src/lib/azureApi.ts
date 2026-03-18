/**
 * Azure Functions API Client
 * Replaces Supabase client for backend communication
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:7071/api';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Get the access token from the current MSAL instance
 * This will be called by the API client before each request
 */
let getAccessTokenFn: (() => Promise<string>) | null = null;

export function setAccessTokenProvider(fn: () => Promise<string>) {
  getAccessTokenFn = fn;
}

/**
 * Make an authenticated API call to Azure Functions
 */
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    // Get ID token (not access token) for backend authentication
    let token: string | null = null;
    if (getAccessTokenFn) {
      try {
        token = await getAccessTokenFn();
      } catch (error) {
        console.error('Failed to get access token:', error);
        return { error: 'Authentication required' };
      }
    }

    // Build headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Make request
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      ...options,
      headers,
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      return {
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Parse response
    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('API call error:', error);
    return {
      error: error.message || 'Network error occurred',
    };
  }
}

/**
 * API client for interacting with Azure Functions backend
 */
export const azureApi = {
  // Processes
  processes: {
    list: () => apiCall<any[]>('processes'),
    get: (id: string) => apiCall<any>(`processes?id=${id}`),
    create: (data: any) => apiCall<any>('processes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiCall<any>(`processes?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`processes?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Systems
  systems: {
    list: () => apiCall<any[]>('systems'),
    get: (id: string) => apiCall<any>(`systems?id=${id}`),
    create: (data: any) => apiCall<any>('systems', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiCall<any>(`systems?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`systems?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Regions
  regions: {
    list: () => apiCall<any[]>('regions'),
    get: (id: string) => apiCall<any>(`regions?id=${id}`),
    create: (data: any) => apiCall<any>('regions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiCall<any>(`regions?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`regions?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Controls
  controls: {
    list: () => apiCall<any[]>('controls'),
    get: (id: string) => apiCall<any>(`controls?id=${id}`),
    create: (data: any) => apiCall<any>('controls', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiCall<any>(`controls?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`controls?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Critical Operations
  criticalOperations: {
    list: () => apiCall<any[]>('critical-operations'),
    get: (id: string) => apiCall<any>(`critical-operations?id=${id}`),
    create: (data: any) => apiCall<any>('critical-operations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiCall<any>(`critical-operations?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`critical-operations?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Process-Systems Junction
  processSystems: {
    list: (processId?: string, systemId?: string) => {
      const params = new URLSearchParams();
      if (processId) params.append('process_id', processId);
      if (systemId) params.append('system_id', systemId);
      const query = params.toString() ? `?${params.toString()}` : '';
      return apiCall<any[]>(`process-systems${query}`);
    },
    get: (id: string) => apiCall<any>(`process-systems?id=${id}`),
    create: (data: any) => apiCall<any>('process-systems', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiCall<any>(`process-systems?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`process-systems?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Process-Controls Junction
  processControls: {
    list: (processId?: string, controlId?: string) => {
      const params = new URLSearchParams();
      if (processId) params.append('process_id', processId);
      if (controlId) params.append('control_id', controlId);
      const query = params.toString() ? `?${params.toString()}` : '';
      return apiCall<any[]>(`process-controls${query}`);
    },
    get: (id: string) => apiCall<any>(`process-controls?id=${id}`),
    create: (data: any) => apiCall<any>('process-controls', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiCall<any>(`process-controls?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`process-controls?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // User Profiles
  userProfiles: {
    list: () => apiCall<any[]>('user-profiles'),
    get: (id: string) => apiCall<any>(`user-profiles?id=${id}`),
    create: (data: any) => apiCall<any>('user-profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiCall<any>(`user-profiles?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`user-profiles?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Settings
  settings: {
    list: () => apiCall<any[]>('settings'),
    get: (id: string) => apiCall<any>(`settings?id=${id}`),
    getByKey: (key: string) => apiCall<any>(`settings?key=${key}`),
    create: (data: any) => apiCall<any>('settings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiCall<any>(`settings?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    updateByKey: (key: string, data: any) => apiCall<any>(`settings?key=${key}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`settings?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Critical Operation Processes (junction table)
  criticalOperationProcesses: {
    list: (criticalOperationId?: string) => {
      const query = criticalOperationId ? `?critical_operation_id=${criticalOperationId}` : '';
      return apiCall<any[]>(`critical-operation-processes${query}`);
    },
    get: (id: string) => apiCall<any>(`critical-operation-processes?id=${id}`),
    create: (data: any) => apiCall<any>('critical-operation-processes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`critical-operation-processes?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Critical Operation Systems (junction table)
  criticalOperationSystems: {
    list: (criticalOperationId?: string) => {
      const query = criticalOperationId ? `?critical_operation_id=${criticalOperationId}` : '';
      return apiCall<any[]>(`critical-operation-systems${query}`);
    },
    get: (id: string) => apiCall<any>(`critical-operation-systems?id=${id}`),
    create: (data: any) => apiCall<any>('critical-operation-systems', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`critical-operation-systems?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Control Critical Operations (junction table)
  controlCriticalOperations: {
    list: (controlId?: string) => {
      const query = controlId ? `?control_id=${controlId}` : '';
      return apiCall<any[]>(`control-critical-operations${query}`);
    },
    get: (id: string) => apiCall<any>(`control-critical-operations?id=${id}`),
    create: (data: any) => apiCall<any>('control-critical-operations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`control-critical-operations?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Control Processes (junction table)
  controlProcesses: {
    list: (controlId?: string) => {
      const query = controlId ? `?control_id=${controlId}` : '';
      return apiCall<any[]>(`control-processes${query}`);
    },
    get: (id: string) => apiCall<any>(`control-processes?id=${id}`),
    create: (data: any) => apiCall<any>('control-processes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`control-processes?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Control Systems (junction table)
  controlSystems: {
    list: (controlId?: string) => {
      const query = controlId ? `?control_id=${controlId}` : '';
      return apiCall<any[]>(`control-systems${query}`);
    },
    get: (id: string) => apiCall<any>(`control-systems?id=${id}`),
    create: (data: any) => apiCall<any>('control-systems', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiCall<any>(`control-systems?id=${id}`, {
      method: 'DELETE',
    }),
  },

  // Sync History
  syncHistory: {
    list: (limit?: number, status?: string) => {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      if (status) params.append('status', status);
      const query = params.toString() ? `?${params.toString()}` : '';
      return apiCall<any[]>(`sync-history${query}`);
    },
    get: (id: string) => apiCall<any>(`sync-history?id=${id}`),
    create: (data: any) => apiCall<any>('sync-history', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiCall<any>(`sync-history?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  },

  // Sync Process Manager
  sync: {
    trigger: (type: 'full' | 'incremental' | 'processes' | 'systems' = 'full') =>
      apiCall<any>(`sync-process-manager?type=${type}`, {
        method: 'POST',
      }),
    status: () => apiCall<any>('sync-process-manager'),
  },

  // Create/Upsert User
  createUser: (data: any) => apiCall<any>('create-user', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Generic API methods for custom endpoints
  get: (endpoint: string) => apiCall<any>(endpoint),
  post: (endpoint: string, data: any) => apiCall<any>(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  patch: (endpoint: string, data: any) => apiCall<any>(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (endpoint: string) => apiCall<any>(endpoint, {
    method: 'DELETE',
  }),
};

export default azureApi;
