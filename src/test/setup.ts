import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
process.env.VITE_AZURE_CLIENT_ID = 'test-client-id';
process.env.VITE_AZURE_TENANT_ID = 'test-tenant-id';
process.env.VITE_AZURE_REDIRECT_URI = 'http://localhost:8080';
process.env.VITE_API_BASE_URL = 'http://localhost:7071/api';

// Mock MSAL
vi.mock('@azure/msal-browser', () => {
  const mockMsalInstance = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllAccounts: vi.fn().mockReturnValue([]),
    loginPopup: vi.fn(),
    loginRedirect: vi.fn(),
    logout: vi.fn(),
    logoutRedirect: vi.fn(),
    acquireTokenSilent: vi.fn(),
    acquireTokenPopup: vi.fn(),
  };

  return {
    PublicClientApplication: vi.fn(function() {
      return mockMsalInstance;
    }),
    InteractionRequiredAuthError: class InteractionRequiredAuthError extends Error {},
    EventType: {
      LOGIN_SUCCESS: 'LOGIN_SUCCESS',
      LOGOUT_SUCCESS: 'LOGOUT_SUCCESS',
    },
  };
});

// Mock @azure/msal-react
vi.mock('@azure/msal-react', () => ({
  MsalProvider: ({ children }: { children: React.ReactNode }) => children,
  useMsal: vi.fn(() => ({
    instance: {
      getAllAccounts: vi.fn().mockReturnValue([]),
      loginPopup: vi.fn(),
      logout: vi.fn(),
      acquireTokenSilent: vi.fn(),
    },
    accounts: [],
    inProgress: 'none',
  })),
  useIsAuthenticated: vi.fn(() => false),
}));
