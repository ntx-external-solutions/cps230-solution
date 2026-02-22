import { describe, it, expect, beforeEach, vi } from 'vitest';
import { systemsApi, processesApi, controlsApi, criticalOperationsApi, settingsApi, userProfilesApi, syncHistoryApi, syncProcessManagerApi } from './api';
import azureApi from './azureApi';

// Mock azureApi
vi.mock('./azureApi', () => ({
  default: {
    systems: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    processes: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    controls: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    criticalOperations: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    settings: {
      list: vi.fn(),
      updateByKey: vi.fn(),
      create: vi.fn(),
    },
    userProfiles: {
      list: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    syncHistory: {
      list: vi.fn(),
      update: vi.fn(),
    },
    sync: {
      trigger: vi.fn(),
    },
  },
}));

describe('Systems API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('should return all systems on success', async () => {
      const mockSystems = [{ id: '1', system_name: 'Test System' }];
      vi.mocked(azureApi.systems.list).mockResolvedValue({ data: mockSystems, error: null, message: 'Success' });

      const result = await systemsApi.getAll();
      expect(result).toEqual(mockSystems);
      expect(azureApi.systems.list).toHaveBeenCalledOnce();
    });

    it('should throw error when API returns error', async () => {
      vi.mocked(azureApi.systems.list).mockResolvedValue({ data: null, error: 'API Error', message: '' });

      await expect(systemsApi.getAll()).rejects.toThrow('API Error');
    });
  });

  describe('getById', () => {
    it('should return system by id', async () => {
      const mockSystem = { id: '1', system_name: 'Test System' };
      vi.mocked(azureApi.systems.get).mockResolvedValue({ data: mockSystem, error: null, message: 'Success' });

      const result = await systemsApi.getById('1');
      expect(result).toEqual(mockSystem);
      expect(azureApi.systems.get).toHaveBeenCalledWith('1');
    });

    it('should throw error when system not found', async () => {
      vi.mocked(azureApi.systems.get).mockResolvedValue({ data: null, error: null, message: '' });

      await expect(systemsApi.getById('1')).rejects.toThrow('System not found');
    });
  });

  describe('create', () => {
    it('should create a new system', async () => {
      const newSystem = { system_name: 'New System', description: 'Test' };
      const createdSystem = { id: '1', ...newSystem, created_at: '2024-01-01', modified_date: '2024-01-01', modified_by: 'user1' };
      vi.mocked(azureApi.systems.create).mockResolvedValue({ data: createdSystem, error: null, message: 'Success' });

      const result = await systemsApi.create(newSystem as any);
      expect(result).toEqual(createdSystem);
      expect(azureApi.systems.create).toHaveBeenCalledWith(newSystem);
    });
  });

  describe('update', () => {
    it('should update an existing system', async () => {
      const updates = { system_name: 'Updated System' };
      const updatedSystem = { id: '1', ...updates, created_at: '2024-01-01', modified_date: '2024-01-02', modified_by: 'user1' };
      vi.mocked(azureApi.systems.update).mockResolvedValue({ data: updatedSystem, error: null, message: 'Success' });

      const result = await systemsApi.update('1', updates);
      expect(result).toEqual(updatedSystem);
      expect(azureApi.systems.update).toHaveBeenCalledWith('1', updates);
    });
  });

  describe('delete', () => {
    it('should delete a system', async () => {
      vi.mocked(azureApi.systems.delete).mockResolvedValue({ data: null, error: null, message: 'Success' });

      await systemsApi.delete('1');
      expect(azureApi.systems.delete).toHaveBeenCalledWith('1');
    });
  });
});

describe('Settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('should return all settings when no keys provided', async () => {
      const mockSettings = [
        { key: 'setting1', value: 'value1' },
        { key: 'setting2', value: 'value2' },
      ];
      vi.mocked(azureApi.settings.list).mockResolvedValue({ data: mockSettings, error: null, message: 'Success' });

      const result = await settingsApi.getAll();
      expect(result).toEqual(mockSettings);
    });

    it('should filter settings by keys', async () => {
      const mockSettings = [
        { key: 'setting1', value: 'value1' },
        { key: 'setting2', value: 'value2' },
        { key: 'setting3', value: 'value3' },
      ];
      vi.mocked(azureApi.settings.list).mockResolvedValue({ data: mockSettings, error: null, message: 'Success' });

      const result = await settingsApi.getAll(['setting1', 'setting3']);
      expect(result).toHaveLength(2);
      expect(result.map((s: any) => s.key)).toEqual(['setting1', 'setting3']);
    });
  });

  describe('upsert', () => {
    it('should update existing settings', async () => {
      const settings = [{ key: 'setting1', value: 'newValue' }];
      vi.mocked(azureApi.settings.updateByKey).mockResolvedValue({ data: {}, error: null, message: 'Success' });

      await settingsApi.upsert(settings);
      expect(azureApi.settings.updateByKey).toHaveBeenCalledWith('setting1', { value: 'newValue' });
    });

    it('should create setting if update fails with not found', async () => {
      const settings = [{ key: 'setting1', value: 'newValue' }];
      vi.mocked(azureApi.settings.updateByKey).mockResolvedValue({ data: null, error: 'not found', message: '' });
      vi.mocked(azureApi.settings.create).mockResolvedValue({ data: {}, error: null, message: 'Success' });

      await settingsApi.upsert(settings);
      expect(azureApi.settings.create).toHaveBeenCalledWith(settings[0]);
    });
  });
});

describe('Sync Process Manager API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('init', () => {
    it('should initialize sync and return sync info', async () => {
      const mockResponse = {
        data: { syncHistoryId: 'sync-123', recordsSynced: 10, message: 'Sync started' },
        error: null,
        message: 'Success',
      };
      vi.mocked(azureApi.sync.trigger).mockResolvedValue(mockResponse);

      const result = await syncProcessManagerApi.init();
      expect(result.mode).toBe('init');
      expect(result.syncId).toBe('sync-123');
      expect(result.totalProcesses).toBe(10);
      expect(azureApi.sync.trigger).toHaveBeenCalledWith('full');
    });

    it('should throw error on failure', async () => {
      vi.mocked(azureApi.sync.trigger).mockResolvedValue({ data: null, error: 'Sync failed', message: '' });

      await expect(syncProcessManagerApi.init()).rejects.toThrow('Sync failed');
    });
  });

  describe('processBatch', () => {
    it('should process batch and return completion status', async () => {
      const mockResponse = {
        data: { syncHistoryId: 'sync-123', recordsSynced: 5 },
        error: null,
        message: 'Success',
      };
      vi.mocked(azureApi.sync.trigger).mockResolvedValue(mockResponse);

      const result = await syncProcessManagerApi.processBatch();
      expect(result.mode).toBe('process');
      expect(result.completed).toBe(true);
      expect(result.percentComplete).toBe(100);
    });
  });
});
