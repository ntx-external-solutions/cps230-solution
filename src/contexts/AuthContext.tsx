import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  PublicClientApplication,
  AccountInfo,
  InteractionRequiredAuthError,
} from '@azure/msal-browser';
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';
import { azureApi, setAccessTokenProvider } from '@/lib/azureApi';
import type { UserProfile } from '@/types/database';

// MSAL Configuration for Azure AD
const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_REDIRECT_URI || window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage' as const,
    storeAuthStateInCookie: false,
  },
};

const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

// Create MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig);

// Local auth token storage keys
const LOCAL_AUTH_TOKEN_KEY = 'cps230_local_auth_token';
const LOCAL_USER_PROFILE_KEY = 'cps230_local_user_profile';

interface AuthContextType {
  user: AccountInfo | null;
  profile: UserProfile | null;
  loading: boolean;
  authType: 'azure_sso' | 'local' | null;
  signInWithMicrosoft: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: () => Promise<void>;
  signOut: () => Promise<void>;
  isPromaster: boolean;
  isBusinessAnalyst: boolean;
  getAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Inner provider that uses MSAL hooks
function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authType, setAuthType] = useState<'azure_sso' | 'local' | null>(null);

  const user = accounts.length > 0 ? accounts[0] : null;

  // Get token (either Azure AD or local JWT)
  const getAccessToken = async (): Promise<string> => {
    // Check for local auth first
    const localToken = localStorage.getItem(LOCAL_AUTH_TOKEN_KEY);
    if (localToken && authType === 'local') {
      return localToken;
    }

    // Fall back to Azure AD token
    if (!user) {
      throw new Error('No authenticated user');
    }

    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: user,
      });
      return response.idToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        const response = await instance.acquireTokenPopup({
          ...loginRequest,
          account: user,
        });
        return response.idToken;
      }
      throw error;
    }
  };

  // Set up the access token provider for the API client
  useEffect(() => {
    setAccessTokenProvider(getAccessToken);
  }, [user, authType]);

  // Check for existing local auth on mount
  useEffect(() => {
    const checkLocalAuth = async () => {
      const localToken = localStorage.getItem(LOCAL_AUTH_TOKEN_KEY);
      const localProfileStr = localStorage.getItem(LOCAL_USER_PROFILE_KEY);

      if (localToken && localProfileStr) {
        try {
          const localProfile = JSON.parse(localProfileStr);

          // Verify token is still valid by making a test request
          const response = await fetch(`${import.meta.env.VITE_API_URL}/user-profiles?id=${localProfile.id}`, {
            headers: {
              'Authorization': `Bearer ${localToken}`,
            },
          });

          if (response.ok) {
            setProfile(localProfile);
            setAuthType('local');
            setLoading(false);
            return;
          } else {
            // Token invalid, clear local auth
            localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
            localStorage.removeItem(LOCAL_USER_PROFILE_KEY);
          }
        } catch (error) {
          console.error('Error validating local auth:', error);
          localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
          localStorage.removeItem(LOCAL_USER_PROFILE_KEY);
        }
      }

      setLoading(false);
    };

    checkLocalAuth();
  }, []);

  // Fetch Azure AD user profile when authenticated via MSAL
  useEffect(() => {
    const fetchAzureUserProfile = async () => {
      // Skip if already authenticated locally
      if (authType === 'local') {
        return;
      }

      if (!isAuthenticated || !user) {
        if (authType !== 'local') {
          setProfile(null);
          setAuthType(null);
        }
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const azureAdObjectId = user.localAccountId || user.homeAccountId;
        const email = user.username;

        // Try to create/update user profile
        const result = await azureApi.createUser({
          entra_id_object_id: azureAdObjectId,
          email: email,
          full_name: user.name || undefined,
        });

        if (result.error) {
          console.error('Error creating/updating user profile:', result.error);
          setProfile({
            id: azureAdObjectId,
            azure_ad_object_id: azureAdObjectId,
            email: email,
            full_name: user.name || null,
            role: 'user',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as UserProfile);
        } else {
          setProfile(result.data);
        }

        setAuthType('azure_sso');
      } catch (error) {
        console.error('Error fetching user profile:', error);
        if (user) {
          setProfile({
            id: user.localAccountId || user.homeAccountId,
            azure_ad_object_id: user.localAccountId || user.homeAccountId,
            email: user.username,
            full_name: user.name || null,
            role: 'user',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as UserProfile);
          setAuthType('azure_sso');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAzureUserProfile();
  }, [isAuthenticated, user]);

  // Sign in with Microsoft (Azure AD SSO)
  const signInWithMicrosoft = async () => {
    try {
      console.log('Starting Microsoft login');

      try {
        const response = await instance.loginPopup(loginRequest);
        console.log('Microsoft login successful:', response);
      } catch (popupError) {
        console.log('Popup failed, trying redirect:', popupError);
        await instance.loginRedirect(loginRequest);
      }
    } catch (error) {
      console.error('Microsoft login failed:', error);
      throw error;
    }
  };

  // Sign in with email/password (Local auth)
  const signInWithEmail = async (email: string, password: string) => {
    try {
      setLoading(true);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/local/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();

      // Store token and profile
      localStorage.setItem(LOCAL_AUTH_TOKEN_KEY, data.token);
      localStorage.setItem(LOCAL_USER_PROFILE_KEY, JSON.stringify(data.user));

      setProfile(data.user);
      setAuthType('local');
    } catch (error) {
      console.error('Email login failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async () => {
    // For now, redirect to Microsoft sign-in
    // In the future, could add a local sign-up flow
    await signInWithMicrosoft();
  };

  const signOut = async () => {
    try {
      if (authType === 'local') {
        // Clear local auth
        localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
        localStorage.removeItem(LOCAL_USER_PROFILE_KEY);
        setProfile(null);
        setAuthType(null);
      } else {
        // Azure AD logout
        const logoutRequest = {
          account: user,
          postLogoutRedirectUri: window.location.origin,
        };
        await instance.logoutRedirect(logoutRequest);
      }
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  };

  const isPromaster = profile?.role === 'promaster';
  const isBusinessAnalyst = profile?.role === 'business_analyst' || isPromaster;

  const value = {
    user,
    profile,
    loading,
    authType,
    signInWithMicrosoft,
    signInWithEmail,
    signUp,
    signOut,
    isPromaster,
    isBusinessAnalyst,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Main provider that wraps with MsalProvider
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [msalReady, setMsalReady] = useState(false);
  const [msalError, setMsalError] = useState<string | null>(null);

  useEffect(() => {
    const initializeMsal = async () => {
      try {
        console.log('Initializing MSAL with config:', {
          clientId: msalConfig.auth.clientId,
          authority: msalConfig.auth.authority,
          redirectUri: msalConfig.auth.redirectUri,
        });
        await msalInstance.initialize();
        console.log('MSAL initialized successfully');
        setMsalReady(true);
      } catch (error) {
        console.error('MSAL initialization failed:', error);
        setMsalError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    initializeMsal();
  }, []);

  if (msalError) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h3>Authentication Error</h3>
        <p>Failed to initialize authentication: {msalError}</p>
        <pre>{JSON.stringify(msalConfig, null, 2)}</pre>
      </div>
    );
  }

  if (!msalReady) {
    return <div style={{ padding: '20px' }}>Initializing authentication...</div>;
  }

  return (
    <MsalProvider instance={msalInstance}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </MsalProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
